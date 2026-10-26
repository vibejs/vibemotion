import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
const directory = await mkdtemp(join(tmpdir(), 'vibemotion-consumer-'));
const run = (args: string[], cwd = directory) =>
  execFileSync('pnpm', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
run(['pack', '--pack-destination', directory], process.cwd());
const tarball = (await readdir(directory)).find((name) => name.endsWith('.tgz'));
assert(tarball);
const listing = execFileSync('tar', ['-tzf', join(directory, tarball)], { encoding: 'utf8' });
assert(listing.includes('package/README.md') && listing.includes('package/THIRD-PARTY-NOTICES.md'));
assert(!/package\/(src|test|examples|node_modules)\//.test(listing));
const packedManifest = JSON.parse(
  execFileSync('tar', ['-xOzf', join(directory, tarball), 'package/package.json'], {
    encoding: 'utf8',
  }),
);
assert(!/workspace:|link:|file:|\/Users\//.test(JSON.stringify(packedManifest)));
await writeFile(
  join(directory, 'package.json'),
  JSON.stringify({
    private: true,
    type: 'module',
    dependencies: {
      '@usevibejs/motion': `file:./${tarball}`,
      '@usevibejs/ui': '0.1.0',
      '@usevibejs/compiler': '0.1.0',
      vite: '8.3.4',
      typescript: '7.0.2',
    },
  }),
);
await writeFile(
  join(directory, 'index.html'),
  '<div id="app"></div><script type="module" src="/main.ts"></script>',
);
await writeFile(
  join(directory, 'vite.config.ts'),
  "import { vibe } from '@usevibejs/compiler/vite'; export default { plugins: [vibe()], build: { target: 'es2022' } }",
);
await writeFile(
  join(directory, 'main.ts'),
  "import { createApp } from '@usevibejs/ui'; import App from './App.vibe'; let app: ReturnType<typeof createApp> | undefined = createApp(App); app.mount('#app'); Object.assign(window, { unmount: () => { app?.unmount(); app = undefined; } });",
);
await writeFile(
  join(directory, 'App.vibe'),
  `<script setup lang="ts">
import { ref, useTemplateRef } from '@usevibejs/ui';
import { useMotion, useSpring, useMotionStyle, useLayoutMotion } from '@usevibejs/motion';
import { useAnimate } from '@usevibejs/motion/mini';
const root = useTemplateRef<HTMLElement>('root'); const layout = useLayoutMotion(root); const order = ref([1,2,3,4,5]);
const box = useTemplateRef<HTMLElement>('box'); const mini = useTemplateRef<HTMLElement>('mini');
const x = ref(0); const spring = useSpring(x); useMotionStyle(box, { x: spring });
useMotion(box, { animate: { opacity: 1 }, initial: { opacity: 0 }, hover: { scale: 1.2 }, transition: { duration: 0.1 } });
const animate = useAnimate();
function move() { void layout.update(() => { order.value = [...order.value].reverse(); }); x.value = 100; if (mini.value) animate(mini.value, { opacity: [0, 1] }, { duration: 0.3 }); }
</script><template><div ref="root"><div style="display:flex"><div v-for="i in order" :key="i" data-layout class="layout-box" style="width:20px;height:20px">{{ i }}</div></div><button id="move" @click="move">Move</button><div ref="box" id="box" style="width:50px;height:50px;background:blue"></div><div ref="mini" id="mini">Native animation</div></div></template>`,
);
await writeFile(
  join(directory, 'types.ts'),
  `import { effectScope, ref, type Ref } from '@usevibejs/ui';
import { useMotion, useSpring, useTransform, useAnimate, usePresenceList, type MotionValue } from '@usevibejs/motion';
import { useAnimate as mini } from '@usevibejs/motion/mini';
effectScope().run(() => {
const el = ref<HTMLElement | null>(null);
const state = ref<'hidden' | 'shown'>('hidden');
const motion = useMotion(el, { variants: { hidden: { opacity: 0 }, shown: { opacity: 1 } }, animate: state });
motion.start('shown');
// @ts-expect-error variant names are inferred
motion.start('typo');
const x: MotionValue<number> = useSpring(ref(0));
const color: MotionValue<string> = useTransform(x, [0, 1], ['red', 'blue']);
useAnimate()(x, 1, { type: 'spring' });
useAnimate()([[el.value!, { x: 20 }], [x, 2, { at: '<' }]]);
mini()(el.value!, { opacity: 1 });
// @ts-expect-error mini cannot animate motion values
mini()(x, 2);
usePresenceList(ref([{ id: 'a' }]), { key: item => item.id });
void color;
});`,
);
try {
  console.log(run(['install', '--ignore-scripts', '--config.auto-install-peers=false']));
  run([
    'exec',
    'tsc',
    '--noEmit',
    '--strict',
    '--skipLibCheck',
    '--module',
    'preserve',
    '--moduleResolution',
    'bundler',
    '--target',
    'es2022',
    'types.ts',
  ]);
  console.log(run(['exec', 'vite', 'build']));
  const server = createServer(async (req, res) => {
    const path = req.url === '/' ? 'index.html' : req.url!.slice(1);
    try {
      const body = await readFile(join(directory, 'dist', path));
      res.setHeader('Content-Type', path.endsWith('.js') ? 'application/javascript' : 'text/html');
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.click('#move');
    await page.waitForFunction(
      () =>
        Math.abs(
          new DOMMatrixReadOnly(getComputedStyle(document.querySelector('#box')!).transform).m41 -
            100,
        ) < 0.5,
    );
    await page.waitForFunction(
      () => Number(getComputedStyle(document.querySelector('#mini')!).opacity) === 1,
    );
    await page.hover('#box');
    await page.waitForFunction(
      () =>
        new DOMMatrixReadOnly(getComputedStyle(document.querySelector('#box')!).transform).m11 >
        1.15,
    );
    await page.evaluate(() =>
      Object.assign(window, {
        layoutWeakRefs: [...document.querySelectorAll('.layout-box')].map(
          (element) => new WeakRef(element),
        ),
      }),
    );
    await page.evaluate(() => (window as unknown as { unmount(): void }).unmount());
    await page.waitForTimeout(150);
    const session = await page.context().newCDPSession(page);
    await session.send('HeapProfiler.collectGarbage');
    assert.equal(
      await page.evaluate(
        () =>
          (window as unknown as { layoutWeakRefs: WeakRef<Element>[] }).layoutWeakRefs.filter(
            (ref) => ref.deref(),
          ).length,
      ),
      0,
      'unmounted consumer layout nodes are collectible',
    );
    await session.detach();
    assert.equal(await page.locator('#box').count(), 0);
    assert.deepEqual(errors, []);
    const installed = await readdir(join(directory, 'node_modules'));
    assert(!installed.includes('react') && !installed.includes('vue'));
  } finally {
    await browser.close();
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
  await mkdir('reports', { recursive: true });
  await writeFile(
    'reports/package.json',
    JSON.stringify(
      {
        package: '@usevibejs/motion',
        version: packedManifest.version,
        checks: [
          'isolated install',
          'declarations and negative types',
          'real .vibe build',
          'hybrid and mini browser animations',
          'hover',
          'layout',
          'unmount',
          'detached layout garbage collection',
          'no React or Vue installed',
        ],
        passed: true,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    'Packed consumer: declarations, .vibe build, hybrid/mini browser animations, gestures and unmount passed.',
  );
} catch (error) {
  if (error && typeof error === 'object' && 'stderr' in error) console.error(String(error.stderr));
  throw error;
}
