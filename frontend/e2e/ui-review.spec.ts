import { test, expect, type Page } from '@playwright/test'

async function login(page: Page) {
  const username = `ui_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const password = 'ui-review-2026'
  expect((await page.request.post('/api/v1/bbtalk/auth/register', { data: { username, password } })).status()).toBe(201)
  await page.goto('/login')
  await page.getByPlaceholder('请输入用户名').fill(username)
  await page.getByPlaceholder('请输入密码').fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByLabel('记录内容')).toBeVisible()
}

test('settings destinations remain reachable and scrollable, and logout can be cancelled', async ({ page }, info) => {
  await login(page)
  const destinations = [
    ['/settings', '设置'], ['/settings/privacy', '防窥设置'], ['/settings/storage', '存储设置'],
    ['/settings/storage/s3', 'S3 配置管理'], ['/settings/data', '数据管理'], ['/settings/status', '运行状态'],
  ]
  for (const [path, title] of destinations) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    await expect(page.getByText('页面加载中…')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`${path.replaceAll('/', '-')}.png`) })
  }
  await page.goto('/settings')
  if (info.project.name === 'small-screen') await page.setViewportSize({ width: 375, height: 568 })
  const logout = page.getByRole('button', { name: '退出登录', exact: true })
  await logout.scrollIntoViewIfNeeded()
  await expect(logout).toBeInViewport()
  if (info.project.name === 'small-screen') {
    expect(await page.getByTestId('route-viewport').evaluate(el => el.scrollTop)).toBeGreaterThan(0)
  }
  await logout.click()
  const dialog = page.getByRole('dialog', { name: '退出登录' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(logout).toBeFocused()
  const sidebar = page.getByRole('complementary', { name: '桌面侧栏' })
  if (await sidebar.isVisible()) await sidebar.getByRole('button', { name: '记录', exact: true }).click()
  else await page.getByRole('button', { name: '返回记录', exact: true }).click()
  await expect(page.getByLabel('记录内容')).toBeVisible()
})

test('comment loading failure waits for explicit retry instead of requesting in a loop', async ({ page }) => {
  await login(page)
  await page.getByLabel('记录内容').fill('评论加载回归测试')
  await page.getByRole('button', { name: '发布', exact: true }).click()
  let card = page.locator('.bbtalk-item').first()
  await card.getByTitle('评论', { exact: true }).click()
  await card.getByLabel('评论内容').fill('已保存的评论')
  await card.getByRole('button', { name: '发送', exact: true }).click()
  await expect(card.getByLabel('删除评论：已保存的评论')).toBeVisible()
  let requests = 0
  await page.route('**/comments', route => {
    if (route.request().method() === 'GET') { requests++; return route.abort() }
    return route.continue()
  })
  await page.reload()
  card = page.locator('.bbtalk-item').first()
  await expect(card.getByRole('alert')).toContainText('评论加载失败')
  await page.waitForTimeout(1000)
  expect(requests).toBe(1)
  await page.unroute('**/comments')
  await card.getByRole('button', { name: '重试操作' }).click()
  await expect(card.getByLabel('删除评论：已保存的评论')).toBeVisible()
  await expect(card.getByRole('alert')).toHaveCount(0)
})

test('record detail provides a working retry after a network failure', async ({ page }, info) => {
  await login(page)
  await page.getByLabel('记录内容').fill('详情重试测试')
  await page.getByRole('button', { name: '发布', exact: true }).click()
  const card = page.locator('.bbtalk-item').first()
  await expect(card).toBeVisible()
  const id = await card.getAttribute('data-record-id')
  await page.route(`**/bbtalk/${id}`, route => route.abort())
  await page.goto(`/detail/${id}`)
  await expect(page.getByRole('heading', { name: '暂时无法打开记录' })).toBeVisible()
  await page.unroute(`**/bbtalk/${id}`)
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(page.locator('.bbtalk-item')).toContainText('详情重试测试')
  await page.screenshot({ path: info.outputPath('record-detail.png') })
})
