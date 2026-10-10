import { expect, test } from '@playwright/test'

test('deployment configuration loads before branding and API initialization', async ({ page }) => {
  let siteName = '部署站点 A'
  await page.route('**/api/public-config', route => route.fulfill({
    contentType: 'application/javascript',
    body: 'window.__BBTALK_CONFIG__ = ' + JSON.stringify({
      VITE_SITE_NAME: siteName, VITE_API_BASE_URL: '/configured-api',
    }) + ';',
  }))
  await page.route('**/configured-api/api/v1/bbtalk/auth/policy', route => route.fulfill({
    json: { registration_enabled: false },
  }))
  const policy = page.waitForRequest('**/configured-api/api/v1/bbtalk/auth/policy')
  await page.goto('/login')
  await policy
  await expect(page).toHaveTitle('部署站点 A')
  await expect(page.getByRole('heading', { name: '登录 部署站点 A' })).toBeVisible()
  siteName = '部署站点 B'
  await page.reload()
  await expect(page).toHaveTitle('部署站点 B')
  await expect(page.getByRole('heading', { name: '登录 部署站点 B' })).toBeVisible()
})
