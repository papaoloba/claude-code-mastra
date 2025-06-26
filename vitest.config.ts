import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      include: ['**/*.{js,ts}'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.test.{js,ts}',
        '**/*.spec.{js,ts}',
        '**/example.ts'
      ]
    },
    testTimeout: 30000,
    hookTimeout: 30000
  },
  resolve: {
    alias: {
      '@': new URL('./', import.meta.url).pathname
    }
  }
});