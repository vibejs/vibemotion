import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { index: 'src/index.ts', mini: 'src/mini.ts' },
  tsconfig: 'tsconfig.build.json',
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  dts: { generator: 'tsgo' },
  sourcemap: true,
  clean: true,
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  // Both runtimes are resolved from the consumer's install, never bundled.
  deps: { neverBundle: ['@usevibejs/ui', /^motion(\/|$)/] },
});
