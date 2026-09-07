import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    channel: 'chromium',
    baseURL: 'http://127.0.0.1:14175',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 1000 } } },
    { name: 'small-screen', use: { browserName: 'chromium', viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
  ],
  webServer: [
    { command: 'uv run python e2e_server.py', cwd: '../backend', url: 'http://127.0.0.1:18020/api/v1/bbtalk/user/me/',
      reuseExistingServer: false, timeout: 90_000 },
    { command: 'npm run dev -- --host 127.0.0.1 --port 14175 --strictPort --mode test', url: 'http://127.0.0.1:14175',
      env: { VITE_PROXY_TARGET: 'http://127.0.0.1:18020', VITE_API_BASE_URL: '', VITE_BASE_PATH: '/' },
      reuseExistingServer: false, timeout: 60_000 },
  ],
})
