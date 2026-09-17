import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './desktop-integration', outputDir: './desktop-test-results', workers: 1, timeout: 90000,
  expect: { timeout: 10000 }, reporter: [['list']],
  webServer: { command: 'uv run python e2e_server.py', cwd: '../backend',
    url: 'http://127.0.0.1:18020/api/v1/bbtalk/user/me/', reuseExistingServer: false, timeout: 90000 },
})
