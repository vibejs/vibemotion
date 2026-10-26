import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release } from 'node:os';
import { chromium } from 'playwright';
import { preview } from 'vite';
const server = await preview({
  configFile: 'examples/demo/vite.config.ts',
  preview: { host: '127.0.0.1', port: 0 },
  logLevel: 'error',
});
const address = server.httpServer.address();
assert(address && typeof address !== 'string');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    reducedMotion: 'no-preference',
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${address.port}/bench`);
  const scenarios = await page
    .locator('[data-scenario]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-scenario')!));
  // One warm-up followed by three recorded runs. Each scenario prepares fresh state.
  for (let run = 0; run < 4; run++)
    for (const scenario of scenarios) {
      const before = await page.evaluate(
        () => (window as unknown as { vibemotionBench?: unknown[] }).vibemotionBench?.length ?? 0,
      );
      await page.locator(`[data-scenario="${scenario}"]`).click();
      await page.waitForFunction(
        (n) =>
          ((window as unknown as { vibemotionBench?: unknown[] }).vibemotionBench?.length ?? 0) > n,
        before,
        { timeout: 30000 },
      );
    }
  assert.deepEqual(errors, []);
  const samples = await page.evaluate(
    () => (window as unknown as { vibemotionBench: unknown[] }).vibemotionBench,
  );
  const report = {
    date: new Date().toISOString(),
    browser: browser.version(),
    system: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model },
    viewport: '1280x900',
    methodology:
      'Headless Chromium RAF intervals. One warm-up, three samples per workload. Intervals are not an FPS guarantee; setup metrics differ by scenario. Layout samples include each reorder.',
    samples: samples.slice(scenarios.length),
  };
  await mkdir('reports', { recursive: true });
  await writeFile('reports/benchmarks.json', JSON.stringify(report, null, 2) + '\n');
  console.table(report.samples);
} finally {
  await browser.close();
  await server.close();
}
