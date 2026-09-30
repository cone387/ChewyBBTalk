import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8', include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/__tests__/**', 'src/**/*.d.ts'],
      reporter: ['text-summary', 'json-summary', 'json', 'lcov', 'html'],
    },
  },
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
    },
  },
});
