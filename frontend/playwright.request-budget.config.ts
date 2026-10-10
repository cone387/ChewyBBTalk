import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: 'request-budget.spec.ts',
  metadata: { productionRequestBudget: true },
  outputDir: './test-results/request-budget',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 12_000 },
  reporter: [['list'], ['json', { outputFile: './test-results/request-budget-report.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:14175',
    browserName: 'chromium',
    channel: 'chromium',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'uv run python tools/e2e_server.py',
      cwd: '../backend',
      url: 'http://127.0.0.1:18020/api/v1/bbtalk/user/me/',
      reuseExistingServer: false,
      timeout: 90_000,
    },
    {
      command: 'npm run build && node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 14175 --strictPort',
      url: 'http://127.0.0.1:14175',
      env: { CI: 'true', VITE_PROXY_TARGET: 'http://127.0.0.1:18020', VITE_API_BASE_URL: '', VITE_BASE_PATH: '/' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
