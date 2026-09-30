import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom', include: ['tests/**/*.test.{ts,tsx}'], restoreMocks: true,
    coverage: {
      provider: 'v8', include: ['src/**/*.{ts,tsx}'], exclude: ['src/**/*.d.ts'],
      reporter: ['text-summary', 'json-summary', 'json', 'lcov', 'html'],
    },
  },
})
