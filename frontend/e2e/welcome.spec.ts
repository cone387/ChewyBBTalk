import { test, expect } from '@playwright/test'

test('personal welcome setup, rotation, preview, lock and disable', async ({ page }, info) => {
  const response = await page.request.post('/api/v1/bbtalk/auth/register', { data: {
    username: `welcome_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    password: 'welcome-page-regression-2026',
  } })
  expect(response.status()).toBe(201)
  const session = await response.json()
  await page.addInitScript(value => {
    localStorage.setItem('bbtalk_access_token', value.access)
    localStorage.setItem('bbtalk_refresh_token', value.refresh)
    localStorage.setItem('bbtalk_user_info', JSON.stringify(value.user))
    localStorage.setItem('privacy_enabled', 'false')
  }, session)
  await page.goto('/settings/welcome')
  await expect(page.getByText('扉页，等你落笔。')).toBeVisible()
  const quotes = ['慢慢来，比较快。', '今天也值得被记下来。', '把脑子里的声音放在这里。']
  for (const text of quotes) {
    await page.getByLabel('文案内容').fill(text)
    await page.getByLabel('出处（可选）').fill('我的手记')
    await page.getByRole('button', { name: '添加文案', exact: true }).click()
    await expect(page.getByLabel('文案内容')).toHaveValue('')
  }
  await page.getByRole('checkbox', { name: '开启文案欢迎页' }).click()
  await expect(page.getByRole('checkbox')).toBeChecked()
  await expect(page.getByText('已保存到你的账号')).toBeVisible()
  await page.screenshot({ path: info.outputPath('welcome-settings.png'), fullPage: true })
  await page.getByRole('button', { name: `预览：${quotes[0]}`, exact: true }).click()
  await expect(page.getByRole('main', { name: '文案欢迎页预览' })).toBeVisible()
  await page.screenshot({ path: info.outputPath('welcome-preview.png'), fullPage: true })
  await page.getByRole('button', { name: '返回文案设置' }).click()

  const seen: string[] = []
  for (let index = 0; index < 4; index++) {
    await page.goto('/')
    const welcome = page.getByRole('main', { name: '文案欢迎页', exact: true })
    await expect(welcome).toBeVisible()
    seen.push(await welcome.locator('blockquote').innerText())
    if (index === 0) {
      await page.screenshot({ path: info.outputPath('welcome-page.png'), fullPage: true })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    }
    await page.getByRole('button', { name: '进入记录', exact: true }).click()
    await expect(page.getByLabel('记录内容')).toBeVisible()
  }
  expect(new Set(seen.slice(0, 3)).size).toBe(3)
  expect(seen[3]).not.toBe(seen[2])

  // Internal navigation should not create another opening.
  await page.getByRole('button', { name: /^(账户与设置|我的)$/ }).first().click()
  await page.getByRole('button', { name: /^(记录|返回记录)$/ }).first().click()
  await expect(page.getByLabel('记录内容')).toBeVisible()
  await expect(page.getByRole('main', { name: '文案欢迎页', exact: true })).toHaveCount(0)

  // The existing privacy lock takes precedence over all welcome content.
  await page.evaluate(() => localStorage.setItem('bbtalk_privacy_mode', 'true'))
  await page.goto('/')
  await expect(page).toHaveURL(/\/locked$/)
  await expect(page.getByRole('main', { name: '文案欢迎页', exact: true })).toHaveCount(0)
  await page.evaluate(() => localStorage.removeItem('bbtalk_privacy_mode'))

  await page.goto('/settings/welcome')
  await page.getByRole('checkbox', { name: '开启文案欢迎页' }).click()
  await expect(page.getByRole('checkbox')).not.toBeChecked()
  await page.goto('/')
  await expect(page.getByLabel('记录内容')).toBeVisible()

  await page.getByLabel('记录内容').fill('把这一刻也收藏起来。')
  await page.getByRole('button', { name: '发布', exact: true }).click()
  await expect(page.getByLabel('记录内容')).toHaveText('')
  await page.getByRole('button', { name: '更多操作' }).first().click()
  await page.getByRole('button', { name: '加入文案池', exact: true }).click()
  await expect(page.getByLabel('文案内容')).toHaveValue('把这一刻也收藏起来。')
  await page.getByRole('button', { name: '添加文案', exact: true }).click()
  await expect(page.getByLabel('文案内容')).toHaveValue('')
  await page.getByRole('button', { name: `编辑：${quotes[0]}`, exact: true }).click()
  await page.getByLabel('文案内容').fill('慢慢来，也要向前走。')
  await page.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect(page.getByText('慢慢来，也要向前走。', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '删除：慢慢来，也要向前走。', exact: true }).click()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(page.getByText('慢慢来，也要向前走。', { exact: true })).toHaveCount(0)
})

test('unavailable welcome selection does not block records', async ({ page }) => {
  const response = await page.request.post('/api/v1/bbtalk/auth/register', { data: {
    username: `welcome_offline_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    password: 'welcome-page-regression-2026',
  } })
  const session = await response.json()
  await page.addInitScript(value => {
    localStorage.setItem('bbtalk_access_token', value.access)
    localStorage.setItem('bbtalk_refresh_token', value.refresh)
    localStorage.setItem('bbtalk_user_info', JSON.stringify(value.user))
  }, session)
  await page.route('**/api/v1/bbtalk/settings/welcome/next', route => route.fulfill({ status: 503, body: '{}' }))
  await page.goto('/')
  await expect(page.getByLabel('记录内容')).toBeVisible()
})
