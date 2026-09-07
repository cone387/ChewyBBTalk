import { test, expect, type Page } from '@playwright/test'

const password = 'e2e-only-records-2026'

async function prepareUser(page: Page) {
  const username = `e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const response = await page.request.post('/api/v1/bbtalk/auth/register/', { data: { username, password } })
  expect(response.status()).toBe(201)
  await page.goto('/login')
  await page.getByPlaceholder('请输入用户名').fill(username)
  await page.getByPlaceholder('请输入密码').fill(password)
  return username
}

async function login(page: Page) {
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByPlaceholder('你要BB什么？')).toBeVisible()
  const publish = page.getByRole('button', { name: '发布', exact: true })
  expect(await publish.evaluate(button => {
    const text = document.createRange()
    text.selectNodeContents(button)
    return text.getBoundingClientRect().height <= parseFloat(getComputedStyle(button).lineHeight) + 1
  })).toBe(true)
}

test('wrong password gives feedback and allows retry', async ({ page }) => {
  await prepareUser(page)
  await page.getByPlaceholder('请输入密码').fill('wrong-password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByText(/用户名或密码错误/).first()).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
  await page.getByPlaceholder('请输入密码').fill(password)
  await login(page)
})

test('publish, edit, search, undo and delete persist across reload', async ({ page }, testInfo) => {
  await prepareUser(page)
  await login(page)
  await page.getByPlaceholder('你要BB什么？').fill('回归记录 alpha')
  await page.getByRole('button', { name: '发布', exact: true }).click()
  const card = page.locator('.bbtalk-item').first()
  await expect(card).toBeVisible()
  await expect(card).toContainText('回归记录 alpha')
  await page.reload()
  await expect(card).toBeVisible()

  await card.getByTitle('更多', { exact: true }).click()
  await card.getByRole('button', { name: '编辑', exact: true }).click()
  await card.getByPlaceholder('你要BB什么？').fill('回归记录 beta')
  await card.getByRole('button', { name: '保存', exact: true }).click()
  await expect(card).toContainText('回归记录 beta')
  await page.reload()
  await expect(card).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('feed.png'), fullPage: true })

  // Search is in the sidebar on desktop and the filter sheet on small screens.
  const search = page.getByPlaceholder('搜索 BBTalk...').filter({ visible: true })
  if (!(await search.count())) await page.getByRole('button', { name: '筛选', exact: true }).click()
  await search.fill('missing-e2e-record')
  await expect(page.getByText('没有找到匹配的碎碎念')).toBeVisible()
  await search.fill('beta')
  await expect(card).toBeVisible()
  await search.fill('')
  if (await page.getByRole('heading', { name: '筛选记录' }).isVisible()) {
    await page.getByRole('button', { name: '关闭筛选' }).click()
  }

  await card.getByTitle('更多', { exact: true }).click()
  await card.getByRole('button', { name: '删除', exact: true }).click()
  await expect(card).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('undo.png') })
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(card).toBeVisible()
  await page.reload()
  await expect(card).toBeVisible()

  await card.getByTitle('更多', { exact: true }).click()
  const deletion = page.waitForResponse(response => response.request().method() === 'DELETE' && response.url().includes('/bbtalk/'))
  await card.getByRole('button', { name: '删除', exact: true }).click()
  expect((await deletion).status()).toBe(204)
  await page.reload()
  await expect(page.locator('.bbtalk-item')).toHaveCount(0)
  await expect(page.getByText('暂无碎碎念')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('a second deletion does not cancel or hide the undo state for the latest record', async ({ page }) => {
  await prepareUser(page)
  await login(page)
  for (const text of ['first deletion', 'second deletion']) {
    await page.getByPlaceholder('你要BB什么？').fill(text)
    await page.getByRole('button', { name: '发布', exact: true }).click()
    await expect(page.locator('.bbtalk-item').filter({ hasText: text })).toBeVisible()
  }
  const first = page.locator('.bbtalk-item').filter({ hasText: 'first deletion' })
  const second = page.locator('.bbtalk-item').filter({ hasText: 'second deletion' })
  await first.getByTitle('更多', { exact: true }).click()
  await first.getByRole('button', { name: '删除', exact: true }).click()
  await second.getByTitle('更多', { exact: true }).click()
  const committed = page.waitForResponse(response => response.request().method() === 'DELETE')
  await second.getByRole('button', { name: '删除', exact: true }).click()
  expect((await committed).status()).toBe(204)
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await page.reload()
  await expect(first).toHaveCount(0)
  await expect(second).toBeVisible()
})


test('closed registration keeps existing login available', async ({ page }) => {
  await page.route('**/auth/policy/', route => route.fulfill({ json: { registration_enabled: false } }))
  await prepareUser(page)
  await expect(page.getByText('当前服务未开放注册，请联系管理员')).toBeVisible()
  await expect(page.getByRole('button', { name: '创建新账户' })).toHaveCount(0)
  await login(page)
})

test('registration policy failure can be retried and throttling preserves credentials', async ({ page }) => {
  let policyFails = true
  await page.route('**/auth/policy/', route => policyFails
    ? route.fulfill({ status: 503, json: { error: 'unavailable' } })
    : route.fulfill({ json: { registration_enabled: true } }))
  await page.goto('/login')
  await expect(page.getByText('无法读取注册设置，已有账户可继续登录。')).toBeVisible()
  policyFails = false
  await page.getByRole('button', { name: '重试读取注册设置' }).click()
  await page.getByRole('button', { name: '创建新账户' }).click()
  await expect(page.getByRole('heading', { name: '创建账户' })).toBeVisible()
  await page.getByRole('button', { name: '登录已有账户' }).click()
  await page.route('**/auth/token/', route => route.fulfill({ status: 429,
    headers: { 'Retry-After': '42' }, json: { code: 'rate_limited', error: '请求过于频繁，请 42 秒后重试', retry_after: 42 } }))
  await page.getByPlaceholder('请输入用户名').fill('existing-account')
  await page.getByPlaceholder('请输入密码').fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByText('请求过于频繁，请 42 秒后重试')).toBeVisible()
  await expect(page.getByPlaceholder('请输入用户名')).toHaveValue('existing-account')
  await expect(page.getByPlaceholder('请输入密码')).toHaveValue(password)
})


test('runtime status shows own checks and supports retry without exposing admin diagnostics', async ({ page }, testInfo) => {
  await prepareUser(page)
  await login(page)
  await page.goto('/settings')
  await page.getByRole('button', { name: /运行状态/ }).click()
  await expect(page.getByRole('heading', { name: '运行状态', exact: true })).toBeVisible()
  await expect(page.getByText('服务器附件目录读写检查通过')).toBeVisible()
  await expect(page.getByText('可用备份：0 份')).toBeVisible()
  await expect(page.getByRole('heading', { name: '管理员诊断' })).toHaveCount(0)
  await page.route('**/settings/status/', route => route.fulfill({ status: 503, json: { error: 'unavailable' } }))
  await page.getByRole('button', { name: '重新检查' }).click()
  await expect(page.getByRole('alert')).toContainText('无法获取运行状态')
  await expect(page.getByText(/（上次结果）/)).toBeVisible()
  await page.unroute('**/settings/status/')
  await page.getByRole('button', { name: '重新检查' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '重新检查' })).toBeEnabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('runtime-status.png'), fullPage: true })
  await page.getByRole('link', { name: '管理与创建备份' }).click()
  await expect(page).toHaveURL(/settings\/data$/)
})

test('runtime status renders partial failures and administrator checks', async ({ page }, testInfo) => {
  await prepareUser(page)
  await login(page)
  await page.route('**/settings/status/', route => route.fulfill({ json: {
    checked_at: '2026-09-07T09:00:00Z',
    service: { status: 'ok', message: '已连接到服务并通过身份验证' },
    storage: { mode: 's3', status: 'error', message: '存储检查失败，请检查配置、连接或目录权限后重试' },
    backup: { status: 'failed', message: '最近一次备份失败，请在数据管理中检查并重新创建', count: 2,
      latest_completed_at: '2026-09-06T09:00:00Z', latest_size: 1234567 },
    diagnostics: { database: { status: 'ok', message: '数据库查询检查通过' },
      attachment_disk: { status: 'ok', message: '服务器附件目录所在磁盘', total_bytes: 1000000000, free_bytes: 200000000 } },
  } }))
  await page.goto('/settings/status')
  await expect(page.getByRole('heading', { name: '管理员诊断' })).toBeVisible()
  await expect(page.getByText('可用备份：2 份')).toBeVisible()
  await expect(page.getByText('存储检查失败，请检查配置、连接或目录权限后重试')).toBeVisible()
  await expect(page.getByText('数据库查询检查通过')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('runtime-status-admin.png'), fullPage: true })
  await page.getByRole('heading', { name: '服务器磁盘' }).scrollIntoViewIfNeeded()
  await expect(page.getByRole('heading', { name: '服务器磁盘' })).toBeInViewport()
  await page.screenshot({ path: testInfo.outputPath('runtime-status-admin-bottom.png'), fullPage: true })
})
