import { test, expect } from '@playwright/test'

test('desktop keeps its sidebar and authenticated login visits return to the feed', async ({ page }, info) => {
  const username = `layout_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const password = 'layout-regression-2026'
  expect((await page.request.post('/api/v1/bbtalk/auth/register/', { data: { username, password } })).status()).toBe(201)
  await page.goto('/login')
  await page.getByLabel('用户名', { exact: true }).fill(username)
  await page.getByLabel('密码', { exact: true }).fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByLabel('记录内容')).toBeVisible()
  await page.goto('/login')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByLabel('记录内容')).toBeVisible()
  await expect(page.getByRole('heading', { name: '登录 BBTalk' })).toHaveCount(0)

  for (const width of [1440, 1024, 375]) {
    await page.setViewportSize({ width, height: 900 })
    const sidebar = page.getByRole('complementary', { name: '桌面侧栏' })
    if (width >= 1024) {
      await expect(sidebar).toBeVisible()
      await expect(sidebar.getByRole('searchbox')).toBeVisible()
      await expect(sidebar.getByRole('button', { name: '账户与设置' })).toBeVisible()
      const editor = await page.getByLabel('记录内容').boundingBox()
      const side = await sidebar.boundingBox()
      expect(editor!.x).toBeGreaterThan(side!.x + side!.width)
      if (width === 1440) expect(editor!.width).toBeGreaterThan(700)
      await expect(page.getByRole('navigation', { name: '移动导航' })).toBeHidden()
    } else {
      await expect(sidebar).toBeHidden()
      await expect(page.getByRole('navigation', { name: '移动导航' })).toBeVisible()
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`feed-${width}.png`) })
  }
})
