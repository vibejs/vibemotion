// Real-browser verification of the demo application: animations, gestures, scroll, layout,
// presence, route transitions, reduced motion and resource cleanup, in headless Chromium.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, type Page } from 'playwright';
import { preview } from 'vite';

const server = await preview({
  configFile: 'examples/demo/vite.config.ts',
  preview: { host: '127.0.0.1', port: 0 },
  logLevel: 'error',
});
const address = server.httpServer.address();
assert(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const errors: string[] = [];
const passed: string[] = [];
const failed: string[] = [];

// Count global listeners and observers so that leaks across mount cycles are visible.
await context.addInitScript(() => {
  const counts = { listeners: 0, observers: 0 };
  const live = new WeakMap<object, Set<string>>();
  const add = EventTarget.prototype.addEventListener;
  const remove = EventTarget.prototype.removeEventListener;
  const id = (type: string, listener: unknown, options?: boolean | AddEventListenerOptions) =>
    `${type}:${typeof options === 'boolean' ? options : !!options?.capture}:${(listener as { name?: string })?.name ?? ''}`;
  const tracked = (target: EventTarget) => target === window || target === document;
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (tracked(this) && listener) {
      let set = live.get(listener);
      if (!set) live.set(listener, (set = new Set()));
      const key = id(type, listener, options) + (this === window ? 'w' : 'd');
      if (!set.has(key)) {
        set.add(key);
        counts.listeners++;
      }
    }
    return add.call(this, type, listener, options);
  };
  EventTarget.prototype.removeEventListener = function (type, listener, options) {
    if (tracked(this) && listener) {
      const key = id(type, listener, options) + (this === window ? 'w' : 'd');
      if (live.get(listener)?.delete(key)) counts.listeners--;
    }
    return remove.call(this, type, listener, options);
  };
  for (const name of ['ResizeObserver', 'IntersectionObserver'] as const) {
    const Native = window[name] as unknown as {
      new (
        cb: never,
        o?: never,
      ): { observe(...a: never[]): void; unobserve(...a: never[]): void; disconnect(): void };
      prototype: object;
    };
    class Counted extends Native {
      targets = new Set<unknown>();
      observe(...args: never[]) {
        if (!this.targets.has(args[0])) {
          this.targets.add(args[0]);
          counts.observers++;
        }
        return super.observe(...args);
      }
      unobserve(...args: never[]) {
        if (this.targets.delete(args[0])) counts.observers--;
        return super.unobserve(...args);
      }
      disconnect() {
        counts.observers -= this.targets.size;
        this.targets.clear();
        return super.disconnect();
      }
    }
    Object.defineProperty(window, name, { value: Counted, configurable: true });
  }
  (window as unknown as { vibemotionCounts: typeof counts }).vibemotionCounts = counts;
});

context.setDefaultTimeout(5000);
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') {
    errors.push(message.text());
    for (const argument of message.args())
      void argument
        .evaluate((value) => ({
          message: value?.message,
          cause: value?.cause?.message,
          stack: value?.cause?.stack,
        }))
        .then((detail) => console.log('Browser error detail', detail));
  }
});

async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed.push(name);
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed.push(name);
    console.log(
      `  ✗ ${name}\n    ${(error as Error).message.split('\n').slice(0, 6).join('\n    ')}`,
    );
  }
}

async function until(fn: () => Promise<boolean>, label: string, timeout = 3000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await fn()) return;
    await page.waitForTimeout(16);
  }
  throw new Error(`Timed out: ${label}`);
}

/** The decomposed 2D transform of the first element matching `selector`. */
async function transform(selector: string, p: Page = page) {
  return p
    .locator(selector)
    .first()
    .evaluate((el) => {
      const m = new DOMMatrixReadOnly(
        getComputedStyle(el).transform === 'none' ? undefined : getComputedStyle(el).transform,
      );
      return {
        x: m.m41,
        y: m.m42,
        scaleX: Math.hypot(m.m11, m.m12),
        scaleY: Math.hypot(m.m21, m.m22),
        identity: m.isIdentity,
      };
    });
}
const opacity = (selector: string, index = 0) =>
  page
    .locator(selector)
    .nth(index)
    .evaluate((el) => Number(getComputedStyle(el).opacity));
const text = (selector: string) => page.locator(selector).first().innerText();
const count = (selector: string) => page.locator(selector).count();
const center = async (selector: string) => {
  const box = await page.locator(selector).first().boundingBox();
  assert(box, `no box for ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
const scrollTo = (selector: string) => page.locator(selector).first().scrollIntoViewIfNeeded();

async function home() {
  await page.goto(origin + '/');
  await page.locator('[data-demo="spring"]').waitFor();
}

try {
  console.log('Animation');
  await home();

  await check('spring: animates to target through a motion value, readout follows', async () => {
    const start = await transform('[data-testid="spring-ball"]');
    await page.click('[data-testid="spring-toggle"]');
    await page.waitForTimeout(80);
    const mid = await transform('[data-testid="spring-ball"]');
    assert(mid.x > start.x + 1, `ball moved (${start.x} → ${mid.x})`);
    await until(
      async () => (await text('[data-testid="spring-value"]')) === '1.000',
      'spring settles at 1',
    );
    const end = await transform('[data-testid="spring-ball"]');
    assert(end.x > mid.x, 'ball reached the far end');
  });

  await check('spring: retargeting mid-flight continues from the current value', async () => {
    // Record the value on every frame across a mid-flight retarget, inside the page.
    const samples = await page.evaluate(async () => {
      const output = document.querySelector('[data-testid="spring-value"]')!;
      const toggle = document.querySelector<HTMLElement>('[data-testid="spring-toggle"]')!;
      const values: number[] = [];
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      toggle.click(); // towards 0
      for (let i = 0; i < 6; i++) {
        await frame();
        values.push(Number(output.textContent));
      }
      toggle.click(); // towards 1 while still moving
      for (let i = 0; i < 30; i++) {
        await frame();
        values.push(Number(output.textContent));
      }
      return values;
    });
    const mid = samples[5]!;
    assert(mid > 0.05 && mid < 0.99, `retargeted in flight (${mid})`);
    const steps = samples.slice(1).map((v, i) => Math.abs(v - samples[i]!));
    assert(
      Math.max(...steps) < 0.2,
      `continuous, no jump (max step ${Math.max(...steps).toFixed(3)})`,
    );
    await until(
      async () => (await text('[data-testid="spring-value"]')) === '1.000',
      'settles again',
    );
  });

  await check('hover: state and scale while hovered, reverts after', async () => {
    await scrollTo('[data-testid="press-button"]');
    const button = '[data-testid="press-button"] button';
    const c = await center(button);
    await page.mouse.move(c.x, c.y);
    await until(async () => (await text('[data-testid="hover-state"]')) === 'true', 'hover state');
    await until(async () => (await transform(button)).scaleX > 1.03, 'scaled up');
    await page.mouse.move(5, 5);
    await until(async () => (await text('[data-testid="hover-state"]')) === 'false', 'hover end');
    await until(
      async () => Math.abs((await transform(button)).scaleX - 1) < 0.005,
      'scale reverts',
    );
  });

  await check('press: pointer press scales down, release restores', async () => {
    const button = '[data-testid="press-button"] button';
    const c = await center(button);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await until(async () => (await text('[data-testid="press-state"]')) === 'true', 'press state');
    await until(async () => (await transform(button)).scaleX < 0.97, 'scaled down');
    await page.mouse.up();
    await until(async () => (await text('[data-testid="press-state"]')) === 'false', 'press end');
    await page.mouse.move(5, 5);
  });

  await check('press: keyboard Enter on the focused button', async () => {
    await page.locator('[data-testid="press-button"] button').focus();
    await page.keyboard.down('Enter');
    await until(
      async () => (await text('[data-testid="press-state"]')) === 'true',
      'keyboard press',
    );
    await page.keyboard.up('Enter');
    await until(
      async () => (await text('[data-testid="press-state"]')) === 'false',
      'keyboard release',
    );
  });

  await check('keyframes: like button runs a keyframe animation and still clicks', async () => {
    await page.click('[data-testid="like"]');
    await page.waitForTimeout(80);
    const t = await transform('[data-testid="like"] svg');
    assert(!t.identity, 'heart transformed mid-animation');
    assert.equal(await text('[data-testid="like-count"]'), '1');
  });

  await check('variants + inView: cards reveal when scrolled into view', async () => {
    await scrollTo('[data-demo="cards"]');
    await until(
      async () => (await opacity('[data-testid="motion-card"]', 2)) > 0.99,
      'third card visible',
    );
  });

  await check('stagger + controls: pause freezes, resume finishes', async () => {
    await scrollTo('[data-demo="stagger"]');
    await page.click('[data-testid="stagger-replay"]');
    await page.waitForTimeout(150);
    assert.equal(await text('[data-testid="stagger-state"]'), 'running');
    await page.click('[data-testid="stagger-pause"]');
    assert.equal(await text('[data-testid="stagger-state"]'), 'paused');
    const a = await opacity('[data-testid="stagger-list"] li', 6);
    await page.waitForTimeout(200);
    const b = await opacity('[data-testid="stagger-list"] li', 6);
    assert.equal(a, b, 'paused animation does not advance');
    assert(a < 1, 'last item not finished while paused');
    await page.click('[data-testid="stagger-play"]');
    await until(
      async () => (await text('[data-testid="stagger-state"]')) === 'finished',
      'finished state',
    );
    assert((await opacity('[data-testid="stagger-list"] li', 6)) > 0.99);
  });

  console.log('Scroll and viewport');
  await check('scroll reveal: tiles below the fold reveal on scroll', async () => {
    await page
      .locator('[data-demo="reveal"]')
      .evaluate((el) => el.scrollIntoView({ block: 'start' }));
    const last = page.locator('[data-testid="reveal-tile"]').last();
    await last.scrollIntoViewIfNeeded();
    await until(async () => (await last.getAttribute('data-in-view')) === 'true', 'in view state');
    await until(
      async () => Number(await last.evaluate((el) => getComputedStyle(el).opacity)) > 0.99,
      'opacity 1',
      4000,
    );
  });

  await check(
    'parallax: element-relative scroll progress moves layers in opposite directions',
    async () => {
      await page
        .locator('[data-testid="parallax"]')
        .evaluate((el) => el.scrollIntoView({ block: 'end' }));
      await page.waitForTimeout(120);
      const a = await transform('[data-testid="parallax-front"]');
      const backA = await transform('[data-testid="parallax-back"]');
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(250);
      const b = await transform('[data-testid="parallax-front"]');
      const backB = await transform('[data-testid="parallax-back"]');
      assert(b.y < a.y - 5, `front layer moved up (${a.y} → ${b.y})`);
      assert(backB.y > backA.y + 2, `back layer moved down (${backA.y} → ${backB.y})`);
    },
  );

  await check('scroll progress bar: page scroll drives scaleX', async () => {
    const t = await transform('[data-testid="scroll-progress"]');
    assert(t.scaleX > 0.05 && t.scaleX < 1, `progress ${t.scaleX}`);
  });

  await check('horizontal container: custom container x progress', async () => {
    await page.locator('[data-testid="strip"]').evaluate((el) => (el.scrollLeft = el.scrollWidth));
    await until(
      async () => (await transform('[data-testid="strip-progress"]')).scaleX > 0.95,
      'x progress',
    );
  });

  console.log('Gestures');
  await check('drag: free card follows the pointer within its constraints', async () => {
    await scrollTo('[data-demo="drag"]');
    const c = await center('[data-testid="drag-free"]');
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(c.x + i * 12, c.y + i * 6);
    assert.equal(await text('[data-testid="drag-state"]'), 'true');
    const t = await transform('[data-testid="drag-free"]');
    assert(t.x > 80 && t.y > 30, `moved with pointer (${t.x}, ${t.y})`);
    await page.mouse.up();
    await until(async () => (await text('[data-testid="drag-state"]')) === 'false', 'drag ended');
  });

  await check('drag: momentum carries a throw after release, inside the area', async () => {
    const c = await center('[data-testid="drag-free"]');
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(c.x + i * 25, c.y);
      await page.waitForTimeout(8);
    }
    const atRelease = await transform('[data-testid="drag-free"]');
    await page.mouse.up();
    assert(Number(await text('[data-testid="drag-velocity"]')) > 100, 'release velocity recorded');
    await page.waitForTimeout(400);
    const after = await transform('[data-testid="drag-free"]');
    assert(after.x > atRelease.x + 5, `continued after release (${atRelease.x} → ${after.x})`);
    const area = await page.locator('[data-testid="drag-area"]').boundingBox();
    // Elastic overshoot springs back inside the constraint element.
    await until(
      async () => {
        const box = await page.locator('[data-testid="drag-free"]').boundingBox();
        return !!area && !!box && box.x + box.width <= area.x + area.width + 1;
      },
      'settled inside the constraints',
      4000,
    );
  });

  await check('drag: axis lock and pixel constraints on the rail', async () => {
    const c = await center('[data-testid="drag-rail"]');
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(c.x + i * 40, c.y + i * 10);
    await page.mouse.up();
    await page.waitForTimeout(600);
    const t = await transform('[data-testid="drag-rail"]');
    assert(t.y === 0, `y locked (${t.y})`);
    assert(t.x <= 221 && t.x > 150, `x constrained (${t.x})`);
  });

  await check('drag: snap to origin after release', async () => {
    const c = await center('[data-testid="drag-snap"]');
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(c.x - i * 10, c.y);
    await page.mouse.up();
    await until(async () => {
      const t = await transform('[data-testid="drag-snap"]');
      return Math.abs(t.x) < 0.5 && Math.abs(t.y) < 0.5;
    }, 'snapped back');
  });

  console.log('Presence');
  await check(
    'drawer: stays mounted and inert during exit, removed after, focus restored',
    async () => {
      await scrollTo('[data-demo="drawer"]');
      await page.click('[data-testid="drawer-open"]');
      await page.locator('[data-testid="drawer"]').waitFor();
      await until(
        async () => Math.abs((await transform('[data-testid="drawer"]')).y) < 1,
        'drawer open',
      );
      await page.click('[data-testid="drawer-close"]');
      assert.equal(await count('[data-testid="drawer"]'), 1, 'still rendered while exiting');
      assert.equal(
        await page.locator('[data-testid="drawer"]').getAttribute('inert'),
        '',
        'inert while exiting',
      );
      await until(async () => (await count('[data-testid="drawer"]')) === 0, 'removed after exit');
      const focused = await page.evaluate(() =>
        document.activeElement?.getAttribute('data-testid'),
      );
      assert.equal(focused, 'drawer-open', 'focus returned to the trigger');
    },
  );

  await check('drawer: rapid toggles reverse the exit and never remove shown content', async () => {
    await page.click('[data-testid="drawer-open"]');
    await page.locator('[data-testid="drawer"]').waitFor();
    await page.waitForTimeout(100);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(40);
    // The backdrop covers the trigger, so reopen programmatically during the exit.
    await page.locator('[data-testid="drawer-open"]').evaluate((el: HTMLElement) => el.click());
    await page.waitForTimeout(900);
    assert.equal(await count('[data-testid="drawer"]'), 1, 'drawer still present');
    assert.equal(
      await page.locator('[data-testid="drawer"]').getAttribute('inert'),
      null,
      'not inert',
    );
    assert(
      Math.abs((await transform('[data-testid="drawer"]')).y) < 1,
      'back in the open position',
    );
    await page.click('[data-testid="drawer-close"]');
    await until(async () => (await count('[data-testid="drawer"]')) === 0, 'closed');
  });

  await check('drawer: drag down to dismiss', async () => {
    await page.click('[data-testid="drawer-open"]');
    await page.locator('[data-testid="drawer"]').waitFor();
    await page.waitForTimeout(500);
    const c = await center('[data-testid="drawer"] h3');
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(c.x, c.y + i * 20);
    await page.mouse.up();
    await until(async () => (await count('[data-testid="drawer"]')) === 0, 'dismissed by drag');
  });

  await check(
    'notifications: exiting toast stays until its exit ends, then the stack closes',
    async () => {
      await scrollTo('[data-demo="toasts"]');
      for (let i = 0; i < 3; i++) await page.click('[data-testid="toast-success"]');
      await until(async () => (await count('[data-testid="toast"]')) === 3, 'three toasts');
      await page.waitForTimeout(400);
      await page.locator('[data-testid="toast-dismiss"]').nth(1).click();
      assert.equal(await count('[data-testid="toast"]'), 3, 'exiting toast still rendered');
      assert.equal(
        await page.locator('[data-testid="toast"]').nth(1).getAttribute('data-exiting'),
        'true',
      );
      await until(async () => (await count('[data-testid="toast"]')) === 2, 'removed after exit');
    },
  );

  await check('notifications: a re-added item during exit reverses (list presence)', async () => {
    // Dismiss all, then quickly add: new keys enter while old ones exit; nothing duplicates.
    await page.locator('[data-testid="toast-dismiss"]').first().click();
    await page.click('[data-testid="toast-success"]');
    await page.waitForTimeout(800);
    const ids = await page.locator('[data-testid="toast"]').allInnerTexts();
    assert.equal(new Set(ids).size, ids.length, 'no duplicate toasts');
    assert.equal(ids.length, 2);
  });

  console.log('Layout');
  await check('tabs: shared indicator morphs between triggers', async () => {
    await scrollTo('[data-demo="tabs"]');
    await page.locator('[data-testid="tabs-list"] button').nth(2).click();
    await page.waitForTimeout(40);
    const mid = await transform('[data-testid="tab-indicator"]');
    assert(!mid.identity, 'indicator projected from the previous trigger');
    await until(
      async () => (await transform('[data-testid="tab-indicator"]')).identity,
      'indicator settles',
    );
    const parent = await page
      .locator('[data-testid="tab-indicator"]')
      .evaluate((el) => el.parentElement?.textContent?.trim());
    assert.equal(parent, 'Settings');
  });

  await check('tabs: keyboard navigation still works', async () => {
    await page.locator('[data-testid="tabs-list"] button').nth(2).focus();
    await page.keyboard.press('ArrowLeft');
    await until(
      async () =>
        (await page
          .locator('[data-testid="tab-indicator"]')
          .evaluate((el) => el.parentElement?.textContent?.trim())) === 'Activity',
      'moved by keyboard',
    );
  });

  await check('shared element: card morphs into the detail panel and back', async () => {
    await scrollTo('[data-demo="shared"]');
    const before = await page.locator('[data-testid="shared-card"]').first().boundingBox();
    await page.locator('[data-testid="shared-card"]').first().click();
    await page.locator('[data-testid="shared-detail"]').waitFor();
    await page.waitForTimeout(30);
    const mid = await transform('[data-testid="shared-detail"]');
    assert(!mid.identity, 'detail starts from the card box');
    await until(
      async () => (await transform('[data-testid="shared-detail"]')).identity,
      'detail settles',
      3000,
    );
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    assert.equal(focused, 'shared-close', 'focus moved into the panel');
    await page.keyboard.press('Escape');
    await until(async () => (await count('[data-testid="shared-detail"]')) === 0, 'detail removed');
    await until(
      async () => (await transform('[data-testid="shared-card"]')).identity,
      'card settles',
    );
    const after = await page.locator('[data-testid="shared-card"]').first().boundingBox();
    assert(before && after && Math.abs(before.width - after.width) < 1, 'card back to its size');
  });

  await check('reorder: shuffle animates positions; interruptions settle cleanly', async () => {
    await scrollTo('[data-demo="reorder"]');
    const order = () =>
      page
        .locator('[data-testid="reorder-grid"] li')
        .evaluateAll((els) => els.map((el) => el.getAttribute('data-tile')).join(','));
    const initial = await order();
    let moved = false;
    for (let attempt = 0; attempt < 3 && !moved; attempt++) {
      await page.click('[data-testid="reorder-shuffle"]');
      await page.waitForTimeout(40);
      const transforms = await page
        .locator('[data-testid="reorder-grid"] li')
        .evaluateAll((els) => els.filter((el) => getComputedStyle(el).transform !== 'none').length);
      moved = transforms > 0 && (await order()) !== initial;
    }
    assert(moved, 'tiles reordered with transforms in flight');
    await page.click('[data-testid="reorder-shuffle"]');
    await page.waitForTimeout(30);
    await page.click('[data-testid="reorder-shuffle"]');
    await page.waitForTimeout(30);
    await page.click('[data-testid="reorder-columns"]');
    await until(
      async () => (await text('[data-testid="layout-animating"]')) === 'false',
      'animation finished',
      4000,
    );
    const residual = await page.locator('[data-testid="reorder-grid"] li').evaluateAll(
      (els) =>
        els.filter((el) => {
          const t = getComputedStyle(el).transform;
          return t !== 'none' && !new DOMMatrixReadOnly(t).isIdentity;
        }).length,
    );
    assert.equal(residual, 0, 'no tile left transformed');
  });

  await check('dialog: Vibecn dialog opens and its content staggers in', async () => {
    await scrollTo('[data-demo="dialog"]');
    await page.click('[data-testid="dialog-open"]');
    await until(async () => page.locator('dialog[open]').isVisible(), 'dialog open');
    await until(
      async () => (await opacity('[data-testid="dialog-body"] [data-stagger]', 4)) > 0.99,
      'content in',
    );
    await page.keyboard.press('Escape');
    await until(async () => (await count('dialog[open]')) === 0, 'dialog closed');
  });

  console.log('Routes, view transitions and presence page');
  await check('route transition: old page exits (inert) before the new page enters', async () => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.click('nav[aria-label="Main"] a[href="/guide"]');
    await page.waitForTimeout(40);
    const inert = await page.locator('#main').getAttribute('inert');
    const stillDemos = await count('[data-demo="spring"]');
    assert(inert === '' && stillDemos === 1, 'old page kept and inert during exit');
    await page.locator('[data-demo="presence"]').waitFor();
    assert.equal(await page.locator('#main').getAttribute('inert'), null);
    assert.equal(new URL(page.url()).pathname, '/guide');
  });

  await check('presence: rapid show/hide never removes shown content', async () => {
    const toggle = '[data-testid="presence-toggle"]';
    await page.click(toggle); // hide
    await page.waitForTimeout(50);
    await page.click(toggle); // show during exit
    await page.waitForTimeout(500);
    assert.equal(await count('[data-testid="presence-box"]'), 1);
    assert.equal(await text('[data-testid="presence-box"]'), 'Present');
    assert((await opacity('[data-testid="presence-box"]')) > 0.99);
    await page.click(toggle);
    await until(
      async () => (await count('[data-testid="presence-box"]')) === 0,
      'removed after exit',
    );
    await page.click(toggle);
    await page.locator('[data-testid="presence-box"]').waitFor();
  });

  await check('view transition: update applies (with or without API support)', async () => {
    const before = await page.locator('[data-testid="vt-row"]').getAttribute('class');
    await page.click('[data-testid="vt-toggle"]');
    await until(
      async () => (await page.locator('[data-testid="vt-row"]').getAttribute('class')) !== before,
      'row flipped',
    );
    await until(
      async () =>
        (await page.locator('[data-testid="vt-row"]').getAttribute('data-transitioning')) ===
        'false',
      'view playback finishes',
    );
  });

  await check('view transition: fallback when the API is missing', async () => {
    const p = await context.newPage();
    await p.addInitScript(() => {
      delete (Document.prototype as { startViewTransition?: unknown }).startViewTransition;
    });
    await p.goto(origin + '/guide');
    await p.locator('[data-demo="view-transition"]').waitFor();
    assert(
      /No View Transition API/.test(await p.locator('[data-demo="view-transition"]').innerText()),
    );
    const before = await p.locator('[data-testid="vt-row"]').getAttribute('class');
    await p.click('[data-testid="vt-toggle"]');
    await p.waitForTimeout(100);
    assert.notEqual(await p.locator('[data-testid="vt-row"]').getAttribute('class'), before);
    await p.close();
  });

  console.log('Reduced motion');
  await check(
    'prefers-reduced-motion: transforms become instant, opacity still fades',
    async () => {
      const p = await context.newPage();
      await p.emulateMedia({ reducedMotion: 'reduce' });
      await p.goto(origin + '/');
      await p.locator('[data-demo="drawer"]').scrollIntoViewIfNeeded();
      await p.click('[data-testid="drawer-open"]');
      await p.locator('[data-testid="drawer"]').waitFor();
      await p.waitForTimeout(50);
      const t = await transform('[data-testid="drawer"]', p);
      assert(Math.abs(t.y) < 0.5, `drawer jumped into place (${t.y})`);
      assert(/Reduced motion on/.test(await p.getByRole('banner').innerText()));
      await p.close();
    },
  );

  await check('app-level switch: forcing reduced motion through provideMotionConfig', async () => {
    await home();
    await page.click('[data-testid="reduce-motion"]');
    await page.locator('[data-demo="tabs"]').scrollIntoViewIfNeeded();
    await page.locator('[data-testid="tabs-list"] button').nth(1).click();
    await page.waitForTimeout(30);
    assert((await transform('[data-testid="tab-indicator"]')).identity, 'no layout animation');
    await page.click('[data-testid="reduce-motion"]');
  });

  console.log('Lifecycle');
  await check('route cycles do not accumulate listeners or observers', async () => {
    await home();
    await page.waitForTimeout(300);
    const read = () =>
      page.evaluate(() => ({
        ...(window as unknown as { vibemotionCounts: { listeners: number; observers: number } })
          .vibemotionCounts,
      }));
    const go = async (path: string, ready: string) => {
      await page.click(`nav[aria-label="Main"] a[href="${path}"]`);
      await page.locator(ready).waitFor();
      await page.waitForTimeout(350);
    };
    await go('/guide', '[data-demo="presence"]');
    await go('/', '[data-demo="spring"]');
    const baseline = await read();
    for (let i = 0; i < 4; i++) {
      await go('/guide', '[data-demo="presence"]');
      await go('/', '[data-demo="spring"]');
    }
    const after = await read();
    assert.deepEqual(
      after,
      baseline,
      `listeners/observers stable (${JSON.stringify(baseline)} → ${JSON.stringify(after)})`,
    );
  });

  await check('layout teardown: repeated mount cycles release old projected nodes', async () => {
    await home();
    await scrollTo('[data-demo="reorder"]');
    await page.click('[data-testid="reorder-shuffle"]');
    await until(
      async () => (await text('[data-testid="layout-animating"]')) === 'false',
      'layout settles',
    );
    await page.evaluate(() => {
      Object.assign(window, {
        layoutWeakRefs: [...document.querySelectorAll('[data-testid="reorder-grid"] li')].map(
          (el) => new WeakRef(el),
        ),
      });
    });
    await page.click('nav[aria-label="Main"] a[href="/guide"]');
    await page.locator('[data-demo="presence"]').waitFor();
    // Complete another render cycle: Vibe's lazy template-ref cleanup may retain the
    // latest disposed branch until the next render. Older branches must never accumulate.
    await page.click('nav[aria-label="Main"] a[href="/"]');
    await page.locator('[data-demo="spring"]').waitFor();
    await page.waitForTimeout(400);
    const session = await context.newCDPSession(page);
    await session.send('HeapProfiler.collectGarbage');
    const retained = await page.evaluate(
      () =>
        (window as unknown as { layoutWeakRefs: WeakRef<Element>[] }).layoutWeakRefs.filter((ref) =>
          ref.deref(),
        ).length,
    );
    assert.equal(retained, 0, 'old layout elements released after scope disposal');
    await session.detach();
  });

  await check('press cancellation: release outside restores the resting state', async () => {
    await home();
    const selector = '[data-testid="press-button"] button';
    await scrollTo(selector);
    const c = await center(selector);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await until(async () => (await text('[data-testid="press-state"]')) === 'true', 'press begins');
    await page.mouse.move(4, 4);
    await page.mouse.up();
    await until(
      async () => (await text('[data-testid="press-state"]')) === 'false',
      'press cancels',
    );
  });

  await check('modal drawer traps keyboard focus in the native dialog', async () => {
    await scrollTo('[data-demo="drawer"]');
    await page.click('[data-testid="drawer-open"]');
    await until(
      async () => Math.abs((await transform('[data-testid="drawer"]')).y) < 1,
      'drawer settled for keyboard navigation',
    );
    await page.locator('[data-testid="drawer-close"]').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'Cancel');
    await page.keyboard.press('Shift+Tab');
    assert.equal(
      await page.evaluate(() => document.activeElement?.getAttribute('data-testid')),
      'drawer-close',
    );
    await page.locator('[data-testid="drawer-open"]').focus();
    assert.notEqual(
      await page.evaluate(() => document.activeElement?.getAttribute('data-testid')),
      'drawer-open',
      'background control remains inert under native modal',
    );
    await page.locator('[data-testid="drawer-close"]').focus();
    await page.keyboard.press('Escape');
    await until(async () => (await count('[data-testid="drawer"]')) === 0, 'drawer closes');
  });

  await check('touch drag: physical touch input follows the pointer and ends cleanly', async () => {
    const touchContext = await browser.newContext({
      viewport: { width: 1100, height: 900 },
      hasTouch: true,
      isMobile: false,
    });
    const touchPage = await touchContext.newPage();
    touchPage.on('pageerror', (error) => errors.push(error.message));
    await touchPage.goto(origin);
    await touchPage.locator('[data-testid="drag-free"]').scrollIntoViewIfNeeded();
    const box = await touchPage.locator('[data-testid="drag-free"]').boundingBox();
    assert(box);
    const session = await touchContext.newCDPSession(touchPage);
    const x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 8; i++)
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: x + i * 10, y: y + i * 3 }],
      });
    const moved = await transform('[data-testid="drag-free"]', touchPage);
    assert(moved.x > 40, `touch moved card (${moved.x})`);
    await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await touchPage.waitForFunction(
      () => document.querySelector('[data-testid="drag-state"]')?.textContent?.trim() === 'false',
    );
    await touchContext.close();
  });

  await check('responsive layout and visual artifacts', async () => {
    await home();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(300);
    await mkdir('artifacts/screenshots', { recursive: true });
    await page.screenshot({ path: 'artifacts/screenshots/desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'no horizontal overflow on mobile',
    );
    await page.screenshot({ path: 'artifacts/screenshots/mobile.png' });
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  await check('no page errors', async () => {
    assert.deepEqual(errors, []);
  });
} finally {
  await browser.close();
  await server.close();
}

await mkdir('reports', { recursive: true });
await writeFile(
  'reports/browser.json',
  JSON.stringify({ browser: 'Chromium', passed, failed, errors }, null, 2) + '\n',
);
console.log(`\n${passed.length} passed, ${failed.length} failed`);
if (failed.length) process.exit(1);
