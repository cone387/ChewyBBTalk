import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './desktop-integration', outputDir: './desktop-test-results', workers: 1, timeout: 90000,
  expect: { timeout: 10000 }, reporter: [['list']],
  use: { browserName: 'chromium', channel: 'chromium' },
  webServer: [
    { command: 'uv run python e2e_server.py', cwd: '../backend',
      url: 'http://127.0.0.1:18020/api/v1/bbtalk/user/me/', reuseExistingServer: false, timeout: 90000 },
    { command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 14175 --strictPort --mode test',
      url: 'http://127.0.0.1:14175', reuseExistingServer: false,
      env: { CI: 'true', VITE_PROXY_TARGET: 'http://127.0.0.1:18020', VITE_API_BASE_URL: '', VITE_BASE_PATH: '/' } },
  ],
})
