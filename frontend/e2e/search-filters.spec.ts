import { test, expect, type Page } from '@playwright/test'

async function setup(page: Page) {
  const username = `search_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const password = 'search-regression-2026'
  const registration = await page.request.post('/api/v1/bbtalk/auth/register/', { data: { username, password } })
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

async function openFilters(page: Page) {
  if (!(await page.getByPlaceholder('搜索 BBTalk...').filter({ visible: true }).count())) {
    await page.getByRole('button', { name: /^筛选(?:\(\d+\))?$/ }).click()
  }
}

async function closeFilters(page: Page) {
  const close = page.getByRole('button', { name: '关闭筛选' })
  if (await close.isVisible()) await close.click()
}

test('search highlighting and all filter chips remain visible and can be cleared', async ({ page }, info) => {
  await setup(page)
  await openFilters(page)
  await page.getByPlaceholder('搜索 BBTalk...').filter({ visible: true }).fill('a+b')
  await page.getByLabel('附件筛选', { exact: true }).filter({ visible: true }).selectOption('no')
  await page.getByLabel('开始日期', { exact: true }).filter({ visible: true }).fill('2000-01-01')
  await page.getByLabel('结束日期', { exact: true }).filter({ visible: true }).fill('2099-12-31')
  await closeFilters(page)
  const summary = page.getByRole('region', { name: '当前筛选条件' })
  await expect(summary.getByRole('button', { name: '移除关键词：a+b' })).toBeVisible()
  await expect(summary.getByRole('button', { name: '移除无附件' })).toBeVisible()
  await expect(page.locator('.bbtalk-item')).toHaveCount(1)
  await expect(page.locator('.bbtalk-item mark')).toHaveText('a+b')
  await summary.getByRole('button', { name: '移除开始：2000-01-01' }).click()
  await expect(summary.getByRole('button', { name: '移除结束：2099-12-31' })).toBeVisible()
  await page.screenshot({ path: info.outputPath('search-filters.png') })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await summary.getByRole('button', { name: '全部清除' }).click()
  await expect(summary).toHaveCount(0)
  await expect(page.locator('.bbtalk-item')).toHaveCount(2)
  await expect(page.locator('.bbtalk-item mark')).toHaveCount(0)
})

test('date-only empty results offer clearing and clearing also removes tags', async ({ page }) => {
  await setup(page)
  await openFilters(page)
  await page.getByLabel('开始日期', { exact: true }).filter({ visible: true }).fill('2099-01-01')
  await closeFilters(page)
  await expect(page.getByText('没有找到匹配的碎碎念')).toBeVisible()
  await page.getByRole('button', { name: '全部清除', exact: true }).click()
  await expect(page.locator('.bbtalk-item')).toHaveCount(2)
  await openFilters(page)
  await page.locator('button').filter({ hasText: /旅行/, visible: true }).click()
  await closeFilters(page)
  await expect(page.getByRole('button', { name: '移除标签：旅行' })).toBeVisible()
  await expect(page.locator('.bbtalk-item')).toHaveCount(1)
  await openFilters(page)
  await page.getByRole('button', { name: '清除筛选', exact: true }).filter({ visible: true }).click()
  await closeFilters(page)
  await expect(page.getByRole('region', { name: '当前筛选条件' })).toHaveCount(0)
  await expect(page.locator('.bbtalk-item')).toHaveCount(2)
})
