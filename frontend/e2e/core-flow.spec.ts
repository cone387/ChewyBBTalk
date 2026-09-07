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
  if (!(await search.count())) await page.getByRole('button', { name: '标签', exact: true }).click()
  await search.fill('missing-e2e-record')
  await expect(page.getByText('没有找到匹配的碎碎念')).toBeVisible()
  await search.fill('beta')
  await expect(card).toBeVisible()
  await search.fill('')
  if (await page.getByRole('heading', { name: '筛选标签' }).isVisible()) {
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
