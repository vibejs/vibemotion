import { vibe } from '@usevibejs/compiler/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [vibe()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    restoreMocks: true,
    unstubGlobals: true,
    setupFiles: ['test/setup.ts'],
    coverage: {
      provider: 'v8',
      thresholds: { lines: 95, functions: 95, branches: 90, statements: 95 },
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts'],
      reporter: ['text-summary', 'json-summary'],
    },
  },
});
