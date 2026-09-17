import { test, expect, type Page } from '@playwright/test'

async function login(page: Page) {
  const username = `submission_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const password = 'submission-e2e-2026'
  expect((await page.request.post('/api/v1/bbtalk/auth/register/', { data: { username, password } })).status()).toBe(201)
  await page.goto('/login')
  await page.getByPlaceholder('请输入用户名').fill(username)
  await page.getByPlaceholder('请输入密码').fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByLabel('记录内容')).toBeEnabled()
}

test('lost response survives reload and original retry creates only one record', async ({ page }) => {
  await login(page)
  await page.getByLabel('记录内容').fill('响应丢失原提交')
  let originalKey = ''
  let originalUid = ''
  await page.route('**/api/v1/bbtalk/', async route => {
    if (route.request().method() !== 'POST') return route.continue()
    originalKey = route.request().headers()['idempotency-key']
    const response = await route.fetch()
    expect(response.status()).toBe(201)
    originalUid = (await response.json()).uid
    await route.abort('connectionreset')
  })
  await page.getByRole('button', { name: '发布', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('发布失败')
  expect(originalKey).toMatch(/^[a-f0-9]{32}$/)
  await page.unroute('**/api/v1/bbtalk/')
  await page.reload()
  await expect(page.getByRole('region', { name: '原提交恢复' })).toContainText('待核对')
  await page.getByLabel('记录内容').fill('用户后来的修改')
  const replay = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/api/v1/bbtalk/'))
  await page.getByRole('button', { name: '重试原提交', exact: true }).click()
  const result = await replay
  expect(result.request().headers()['idempotency-key']).toBe(originalKey)
  expect(result.status()).toBe(200)
  expect((await result.json()).uid).toBe(originalUid)
  await expect(page.getByLabel('记录内容')).toHaveValue('用户后来的修改')
  await expect(page.locator('.bbtalk-item')).toHaveCount(1)
  await page.reload()
  await expect(page.locator('.bbtalk-item')).toHaveCount(1)
  await expect(page.getByLabel('记录内容')).toHaveValue('用户后来的修改')
})

test('unknown submission blocks changed payload and can be checked without posting', async ({ page }) => {
  await login(page)
  await page.getByLabel('记录内容').fill('未到达服务器')
  await page.route('**/api/v1/bbtalk/', route => route.request().method() === 'POST' ? route.abort() : route.continue())
  await page.getByRole('button', { name: '发布', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('发布失败')
  await page.unroute('**/api/v1/bbtalk/')
  await page.getByLabel('记录内容').fill('修改后的正文')
  await page.getByRole('button', { name: '发布', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('先核对或重试原提交')
  await page.getByRole('button', { name: '核对发布结果' }).click()
  await expect(page.getByRole('alert')).toContainText('暂未查到')
  await expect(page.locator('.bbtalk-item')).toHaveCount(0)
  await page.getByRole('button', { name: '重试原提交' }).click()
  await expect(page.locator('.bbtalk-item')).toHaveCount(1)
  await expect(page.locator('.bbtalk-item')).toContainText('未到达服务器')
  await expect(page.getByLabel('记录内容')).toHaveValue('修改后的正文')
})

test('stale edit preserves input and requires review before saving against new version', async ({ page }) => {
  await login(page)
  await page.getByLabel('记录内容').fill('初始版本')
  await page.getByRole('button', { name: '发布', exact: true }).click()
  await expect(page.getByLabel('记录内容')).toHaveValue('')
  const card = page.locator('.bbtalk-item').first()
  const uid = await card.getAttribute('data-record-id')
  await card.getByTitle('更多', { exact: true }).click()
  await card.getByRole('button', { name: '编辑', exact: true }).click()
  await card.getByLabel('记录内容').fill('本地未保存修改')
  const token = await page.evaluate(() => localStorage.getItem('bbtalk_access_token'))
  const remote = await page.request.patch(`/api/v1/bbtalk/${uid}/`, {
    headers: { Authorization: `Bearer ${token}` }, data: { content: '另一设备新版本' },
  })
  expect(remote.status()).toBe(200)
  await card.getByRole('button', { name: '保存', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '记录已有新版本' })
  await expect(dialog).toContainText('另一设备新版本')
  await expect(card.getByLabel('记录内容')).toHaveValue('本地未保存修改')
  await dialog.getByRole('button', { name: '保留我的修改，继续编辑' }).click()
  const saved = page.waitForResponse(r => r.request().method() === 'PATCH')
  await card.getByRole('button', { name: '保存', exact: true }).click()
  expect((await saved).status()).toBe(200)
  await expect(card.getByLabel('记录内容')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.bbtalk-item')).toContainText('本地未保存修改')
})

test('foreground refresh keeps the active search and unsent draft', async ({ page }) => {
  await login(page)
  if (!(await page.getByPlaceholder('搜索 BBTalk...').filter({ visible: true }).count())) {
    await page.getByRole('button', { name: /^筛选(?:\(\d+\))?$/ }).click()
  }
  await page.getByPlaceholder('搜索 BBTalk...').filter({ visible: true }).fill('前台命中')
  const close = page.getByRole('button', { name: '关闭筛选' })
  if (await close.isVisible()) await close.click()
  await expect(page.getByText('关键词：前台命中', { exact: true })).toBeVisible()
  await page.getByLabel('记录内容').fill('尚未提交的本地草稿')
  const token = await page.evaluate(() => localStorage.getItem('bbtalk_access_token'))
  const headers = { Authorization: `Bearer ${token}` }
  expect((await page.request.post('/api/v1/bbtalk/', { headers, data: { content: '前台命中远端新增' } })).status()).toBe(201)
  expect((await page.request.post('/api/v1/bbtalk/', { headers, data: { content: '不匹配的记录' } })).status()).toBe(201)
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.locator('.bbtalk-item')).toHaveCount(1)
  await expect(page.locator('.bbtalk-item')).toContainText('前台命中远端新增')
  await expect(page.getByRole('button', { name: '移除关键词：前台命中' })).toBeVisible()
  await expect(page.getByLabel('记录内容')).toHaveValue('尚未提交的本地草稿')
  await page.clock.install()
  await page.clock.fastForward(1100)
  expect((await page.request.post('/api/v1/bbtalk/', { headers, data: { content: '前台命中网络恢复新增' } })).status()).toBe(201)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(page.locator('.bbtalk-item')).toHaveCount(2)
  await expect(page.getByLabel('记录内容')).toHaveValue('尚未提交的本地草稿')
})
