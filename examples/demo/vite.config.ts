import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { vibe } from '@usevibejs/compiler/vite';
import { defineConfig } from 'vite';

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: source('.'),
  plugins: [vibe(), tailwindcss()],
  resolve: {
    // The demo runs against the library source; `pnpm test:package` checks the built package.
    alias: {
      '@usevibejs/motion/mini': source('../../src/mini.ts'),
      '@usevibejs/motion': source('../../src/index.ts'),
    },
  },
  build: { target: 'es2022', outDir: source('../../artifacts/demo'), emptyOutDir: true },
});
