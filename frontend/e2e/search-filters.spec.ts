import { test, expect, type Page } from '@playwright/test'

async function setup(page: Page) {
  const username = `search_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const password = 'search-regression-2026'
  const registration = await page.request.post('/api/v1/bbtalk/auth/register', { data: { username, password } })
  expect(registration.status()).toBe(201)
  await page.goto('/login')
  await page.getByPlaceholder('请输入用户名').fill(username)
  await page.getByPlaceholder('请输入密码').fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByPlaceholder('你要BB什么？')).toBeVisible()
  for (const content of ['中文 Alpha a+b #旅行', 'other record #工作']) {
    await page.getByPlaceholder('你要BB什么？').fill(content + ' ')
    await page.getByRole('button', { name: '发布', exact: true }).click()
    await expect(page.locator('.bbtalk-item').filter({ hasText: content.split(' #')[0] })).toBeVisible()
  }
}

test('search highlights literal text and clearing the input restores the feed', async ({ page }, info) => {
  await setup(page)
  const search = page.getByPlaceholder('搜索 BBTalk...').filter({ visible: true })
  await search.fill('a+b')
  await expect(page.locator('.bbtalk-item')).toHaveCount(1)
  await expect(page.locator('.bbtalk-item mark')).toHaveText('a+b')
  await expect(page.getByRole('region', { name: '当前筛选条件' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /筛选与排序/ })).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('search.png') })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await search.fill('')
  await expect(page.locator('.bbtalk-item')).toHaveCount(2)
  await expect(page.locator('.bbtalk-item mark')).toHaveCount(0)
})

test('empty results can clear both search and selected tags', async ({ page }) => {
  await setup(page)
  const sidebar = page.getByRole('region', { name: '标签列表' })
  const tags = await sidebar.isVisible() ? sidebar : page.getByLabel('标签快捷筛选')
  await tags.getByRole('button', { name: /^旅行/ }).click()
  await expect(page.locator('.bbtalk-item')).toHaveCount(1)
  await page.getByPlaceholder('搜索 BBTalk...').filter({ visible: true }).fill('没有对应记录的关键词')
  await expect(page.getByText('没有找到匹配的碎碎念')).toBeVisible()
  await page.getByRole('button', { name: '清除条件，查看全部', exact: true }).click()
  await expect(page.locator('.bbtalk-item')).toHaveCount(2)
  await expect(tags.getByRole('button', { name: /^旅行/ })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByPlaceholder('搜索 BBTalk...').filter({ visible: true })).toHaveValue('')
})

test('tags switch exclusively and retain selection on repeated clicks', async ({ page }, info) => {
  await setup(page)
  const sidebar = page.getByRole('region', { name: '标签列表' })
  const desktop = await sidebar.isVisible()
  const trigger = page.getByRole('navigation', { name: '移动导航' }).getByRole('button', { name: /^标签/ })
  if (!desktop) await trigger.click()
  const tags = desktop ? sidebar : page.getByRole('dialog', { name: '选择标签' })
  await expect(tags.getByLabel('可见性筛选')).toHaveCount(0)
  await tags.getByRole('button', { name: /^旅行/ }).click()
  const work = tags.getByRole('button', { name: /^工作/ })
  await work.focus()
  await page.keyboard.press('Enter')
  await expect(work).toHaveAttribute('aria-pressed', 'true')
  await expect(tags.getByRole('button', { name: /^旅行/ })).toHaveAttribute('aria-pressed', 'false')
  await page.screenshot({ path: info.outputPath('tags.png') })
  await page.keyboard.press('Enter')
  await expect(work).toHaveAttribute('aria-pressed', 'true')
  if (!desktop) {
    await page.keyboard.press('Escape')
    await expect(tags).toHaveCount(0)
    await expect(trigger).toBeFocused()
  }
  await expect(page.locator('.bbtalk-item')).toHaveCount(1)
  await expect(page.locator('.bbtalk-item')).toContainText('other record')
  const visibleTags = desktop ? sidebar : page.getByLabel('标签快捷筛选')
  await visibleTags.getByRole('button', { name: /^全部/ }).click()
  await expect(page.locator('.bbtalk-item')).toHaveCount(2)
})
