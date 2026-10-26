import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { build } from 'vite';

const cases = {
  reduced: "import { useReducedMotion as api } from './dist/index.js'; export { api }",
  mini: "import { useAnimate as api } from './dist/mini.js'; export { api }",
  hybrid: "import { useAnimate as api } from './dist/index.js'; export { api }",
  gestures: "import { useDrag as api } from './dist/index.js'; export { api }",
  full: "export * from './dist/index.js'",
};
const rows = [];
for (const [name, source] of Object.entries(cases)) {
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/size-entry.ts', source.replaceAll('./dist/', '../dist/'));
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: true,
      lib: { entry: 'artifacts/size-entry.ts', formats: ['es'] },
      rolldownOptions: { external: ['@usevibejs/ui'], output: { minify: true } },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) =>
    'output' in r ? r.output : [],
  );
  const chunks = outputs.filter((o) => o.type === 'chunk');
  const code = chunks.map((c) => c.code).join('\n');
  const modules = chunks.flatMap((c) => Object.keys(c.modules));
  assert(
    !modules.some((m) => /node_modules\/(react|react-dom|vue)\//.test(m)),
    'no React/Vue runtime',
  );
  if (name === 'mini')
    assert(
      !modules.some((m) => /animation\/sequence|gestures\/drag|JSAnimation\.mjs/.test(m)),
      'mini excludes hybrid engine',
    );
  if (name === 'reduced')
    assert(!modules.some((m) => /motion-dom/.test(m)), 'config-only import excludes Motion');
  rows.push({
    name,
    bytes: Buffer.byteLength(code),
    gzip: gzipSync(code).length,
    brotli: brotliCompressSync(code).length,
    modules: modules.length,
  });
}
await mkdir('reports', { recursive: true });
await writeFile(
  'reports/bundle-size.json',
  JSON.stringify(
    {
      external: ['@usevibejs/ui'],
      note: 'Minified consumer bundles including Motion, excluding Vibe.js. Bytes, not package download size.',
      rows,
    },
    null,
    2,
  ) + '\n',
);
console.table(rows);
