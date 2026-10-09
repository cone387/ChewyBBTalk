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

  await page.route('**/api/v1/bbtalk/tags/', route => route.fulfill({ json: Array.from({ length: 40 }, (_, index) => ({
    uid: `layout-tag-${index}`, name: index === 0 ? '一个用于验证布局的超长标签名称' : `日常记录 ${index + 1}`,
    color: '#2563eb', sort_order: index, bbtalk_count: index + 1,
  })) }))
  await page.reload()

  for (const width of [1440, 1024, 375]) {
    await page.setViewportSize({ width, height: 900 })
    const sidebar = page.getByRole('complementary', { name: '桌面侧栏' })
    if (width >= 1024) {
      await expect(sidebar).toBeVisible()
      await expect(sidebar.getByRole('searchbox')).toBeVisible()
      await expect(sidebar.getByRole('button', { name: '账户与设置' })).toBeVisible()
      const editor = await page.getByLabel('记录内容').boundingBox()
      const side = await sidebar.boundingBox()
      const tags = sidebar.getByRole('region', { name: '标签列表' })
      await expect(tags).toBeVisible()
      const tagBox = await tags.boundingBox()
      expect(tagBox!.x + tagBox!.width).toBeLessThan(editor!.x)
      expect(side!.width).toBe(256)
      expect(tagBox!.height).toBeGreaterThan(600)
      await expect(tags.locator('.tag-list-row')).toHaveCount(40)
      const visibleRows = await tags.locator('.tag-list-row').evaluateAll(rows => rows.filter(row => {
        const bounds = row.getBoundingClientRect()
        return bounds.top >= 0 && bounds.bottom <= innerHeight
      }).length)
      // Touch devices keep taller targets within the restored inset sidebar.
      expect(visibleRows).toBeGreaterThanOrEqual(12)
      const scroll = tags.locator('.feed-tags-scroll')
      expect(await scroll.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
      await tags.locator('.tag-list-row').last().getByRole('button').first().focus()
      await expect(tags.locator('.tag-list-row').last()).toBeInViewport()
      await page.getByLabel('记录内容').focus()
      await scroll.evaluate(el => { el.scrollTop = 0 })
      expect(editor!.x).toBeGreaterThan(side!.x + side!.width)
      if (width === 1440) expect(editor!.width).toBeGreaterThan(700)
      await expect(page.getByRole('navigation', { name: '移动导航' })).toBeHidden()
    } else {
      await expect(sidebar).toBeHidden()
      await expect(page.getByRole('region', { name: '标签列表' })).toBeHidden()
      await expect(page.getByRole('navigation', { name: '移动导航' })).toBeVisible()
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`feed-${width}.png`) })
  }
})
