import { effectScope, nextTick, shallowRef } from '@usevibejs/ui';
import { describe, expect, it, vi } from 'vitest';
import type { AnimationPlaybackControls, animateLayout, animateView } from 'motion';
const engine = vi.hoisted(() => ({
  layouts: [] as {
    mutate: () => void | Promise<void>;
    shared: ReturnType<typeof vi.fn>;
    animation: AnimationPlaybackControls;
    finish: () => void;
  }[],
  views: [] as { mutate: () => void | Promise<void>; ready: () => void; finish: () => void }[],
  fail: false,
}));
vi.mock('motion', async (original) => {
  const real = await original<typeof import('motion')>();
  return {
    ...real,
    animateLayout: ((scope: unknown, update: unknown) => {
      let finish!: () => void;
      const animation = {
        stop: vi.fn<(...args: unknown[]) => unknown>(),
        finished: new Promise<void>((resolve) => {
          finish = resolve;
        }),
      } as unknown as AnimationPlaybackControls;
      const record = {
        mutate: (typeof scope === 'function' ? scope : update) as () => Promise<void>,
        animation,
        finish,
        shared: vi.fn<(...args: unknown[]) => unknown>(),
      };
      engine.layouts.push(record);
      const builder = {
        shared: record.shared,
        then: async (
          resolve: (value: AnimationPlaybackControls) => void,
          reject: (e: unknown) => void,
        ) => {
          try {
            await record.mutate();
            if (engine.fail) throw new Error('measurement failed');
            resolve(animation);
          } catch (error) {
            reject(error);
          }
        },
      };
      record.shared.mockReturnValue(builder);
      return builder;
    }) as unknown as typeof animateLayout,
    animateView: ((mutate: () => void | Promise<void>) => {
      let ready!: () => void;
      let done!: () => void;
      const snapshotReady = new Promise<void>((resolve) => {
        ready = resolve;
      });
      const animation = {
        finished: new Promise<void>((resolve) => {
          done = resolve;
        }),
        stop: vi.fn<() => void>(),
      } as unknown as AnimationPlaybackControls;
      const finish = () => {
        ready();
        done();
      };
      engine.views.push({ mutate, ready, finish });
      const builder = {
        new: () => builder,
        then: (resolve: (control: AnimationPlaybackControls) => void, reject?: () => void) =>
          Promise.resolve()
            .then(mutate)
            .then(() => snapshotReady)
            .then(() => resolve(animation), reject),
      };
      return builder;
    }) as unknown as typeof animateView,
  };
});
import {
  useLayoutMotion,
  useRouteTransition,
  useViewTransition,
  type RouterHooks,
} from '../src/index.ts';
import { frames, mockReducedMotion } from './media.ts';

function routerHarness() {
  let before!: Parameters<RouterHooks['beforeResolve']>[0];
  let after!: Parameters<RouterHooks['afterEach']>[0];
  const removeBefore = vi.fn<(...args: unknown[]) => unknown>(),
    removeAfter = vi.fn<(...args: unknown[]) => unknown>();
  const router: RouterHooks = {
    beforeResolve(fn) {
      before = fn;
      return removeBefore;
    },
    afterEach(fn) {
      after = fn;
      return removeAfter;
    },
  };
  return {
    router,
    removeBefore,
    removeAfter,
    before: (path = '/b', from = '/a') => before({ fullPath: path }, { fullPath: from }),
    after: (path = '/b', failure?: unknown) =>
      after({ fullPath: path }, { fullPath: '/a' }, failure),
  };
}

describe('layout scheduler contract', () => {
  it('flushes reactive changes, configures shared IDs and tracks completion', async () => {
    mockReducedMotion(false);
    const scope = effectScope();
    const root = shallowRef<Element | null>(document.body);
    const handle = scope.run(() => useLayoutMotion(root, { shared: { card: { duration: 1 } } }))!;
    const mutate = vi.fn<() => void>();
    await handle.update(mutate);
    const call = engine.layouts.at(-1)!;
    expect(mutate).toHaveBeenCalledOnce();
    expect(call.shared).toHaveBeenCalledWith('card', { duration: 1 });
    expect(handle.isAnimating.value).toBe(true);
    call.finish();
    await nextTick();
    await nextTick();
    expect(handle.isAnimating.value).toBe(false);
    await handle.update(mutate);
    handle.stop();
    expect(engine.layouts.at(-1)!.animation.stop).toHaveBeenCalledOnce();
    root.value = null;
    await handle.update(mutate); // No global fallback from a missing root.
    expect(mutate).toHaveBeenCalledTimes(3);
    scope.stop();
    await handle.update(mutate);
    expect(mutate).toHaveBeenCalledTimes(3);
  });
  it('commits reduced layouts without measuring and stops a late-created animation', async () => {
    const media = mockReducedMotion(true);
    const scope = effectScope();
    const handle = scope.run(() => useLayoutMotion())!;
    const mutate = vi.fn<() => void>();
    const before = engine.layouts.length;
    await handle.update(mutate);
    expect(engine.layouts.length).toBe(before);
    media.set(false);
    await nextTick();
    const pending = handle.update(mutate);
    handle.stop();
    await pending;
    expect(engine.layouts.at(-1)!.animation.stop).toHaveBeenCalledOnce();
    scope.stop();
  });
  it('resets state and propagates layout failures', async () => {
    mockReducedMotion(false);
    engine.fail = true;
    const scope = effectScope();
    const h = scope.run(() => useLayoutMotion())!;
    await expect(h.update(() => {})).rejects.toThrow('measurement failed');
    expect(h.isAnimating.value).toBe(false);
    engine.fail = false;
    scope.stop();
  });
});

describe('view transition boundaries', () => {
  it('falls back without the browser API, honours reduced motion and ignores disposed calls', async () => {
    const media = mockReducedMotion(false);
    const scope = effectScope();
    const h = scope.run(() => useViewTransition())!;
    const mutate = vi.fn<() => void>();
    await h.start(mutate);
    expect(mutate).toHaveBeenCalledOnce();
    Object.defineProperty(document, 'startViewTransition', {
      value: vi.fn<(...args: unknown[]) => unknown>(),
      configurable: true,
    });
    media.set(true);
    await h.start(mutate);
    expect(mutate).toHaveBeenCalledTimes(2);
    scope.stop();
    await h.start(mutate);
    expect(mutate).toHaveBeenCalledTimes(2);
    delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
  });
  it('waits for playback after snapshot readiness and settles when the scope stops', async () => {
    mockReducedMotion(false);
    Object.defineProperty(document, 'startViewTransition', {
      value: vi.fn<() => void>(),
      configurable: true,
    });
    const scope = effectScope();
    const h = scope.run(() => useViewTransition())!;
    const pending = h.start(() => {});
    engine.views.at(-1)!.ready();
    await nextTick();
    await nextTick();
    expect(h.isTransitioning.value).toBe(true);
    scope.stop();
    await pending;
    expect(h.isTransitioning.value).toBe(false);
    engine.views.at(-1)!.finish();
    delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
  });

  it('configures supported transitions, tracks completion, and restarts after stop', async () => {
    mockReducedMotion(false);
    Object.defineProperty(document, 'startViewTransition', {
      value: vi.fn<(...args: unknown[]) => unknown>(),
      configurable: true,
    });
    const scope = effectScope();
    const h = scope.run(() => useViewTransition())!;
    const configure = vi.fn<(...args: unknown[]) => unknown>();
    const pending = h.start(() => {}, configure);
    expect(h.isTransitioning.value).toBe(true);
    expect(configure).toHaveBeenCalledOnce();
    engine.views.at(-1)!.finish();
    await pending;
    expect(h.isTransitioning.value).toBe(false);
    h.stop();
    const second = h.start(() => {});
    engine.views.at(-1)!.finish();
    await second;
    scope.stop();
    delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
  });
});

describe('route transition guards', () => {
  it('animates exits, cancels pending guards and restores existing inert attributes', async () => {
    mockReducedMotion(false);
    const el = document.createElement('main');
    el.setAttribute('inert', 'original');
    document.body.append(el);
    const r = routerHarness();
    const scope = effectScope();
    const h = scope.run(() =>
      useRouteTransition(r.router, el, {
        exit: { opacity: 0 },
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        transition: { duration: 0.04 },
      }),
    )!;
    const first = r.before('/first');
    const second = r.before('/second');
    await first;
    expect(el.getAttribute('inert')).toBe('original');
    r.after('/first'); // superseded afterEach must not release the newest navigation.
    await second;
    r.after('/second');
    await frames(120);
    expect(el.style.opacity).toBe('1');
    const pending = r.before('/third');
    h.stop();
    await pending;
    expect(r.removeBefore).toHaveBeenCalledOnce();
    expect(r.removeAfter).toHaveBeenCalledOnce();
    r.after('/third');
    h.stop();
    scope.stop();
  });
  it('restores the old route on failure, bypasses same routes, missing targets and reduced motion', async () => {
    const media = mockReducedMotion(false);
    const r = routerHarness();
    const el = document.createElement('main');
    document.body.append(el);
    const target = shallowRef<HTMLElement | null>(el);
    const scope = effectScope();
    scope.run(() =>
      useRouteTransition(r.router, target, {
        animate: { opacity: 1 },
        transition: { duration: 0.01 },
      }),
    );
    expect(r.before('/a')).toBeUndefined();
    expect(r.before()).toBeUndefined();
    r.after('/b', new Error('cancelled'));
    await frames(80);
    expect(el.style.opacity).toBe('1');
    media.set(true);
    expect(r.before()).toBeUndefined();
    target.value = null;
    expect(r.before()).toBeUndefined();
    scope.stop();
  });
  it('resolves a view navigation only from the update and finishes it after rendering', async () => {
    mockReducedMotion(false);
    Object.defineProperty(document, 'startViewTransition', {
      value: vi.fn<(...args: unknown[]) => unknown>(),
      configurable: true,
    });
    const r = routerHarness();
    const scope = effectScope();
    scope.run(() => useRouteTransition(r.router, document.body, { mode: 'view' }));
    const pending = r.before();
    expect(engine.views.at(-1)).toBeDefined();
    await pending;
    r.after();
    engine.views.at(-1)!.finish();
    await nextTick();
    scope.stop();
    delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
  });
});
