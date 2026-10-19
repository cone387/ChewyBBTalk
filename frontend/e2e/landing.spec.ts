import { test, expect } from '@playwright/test'

test('public product page is styled locally, responsive, and navigates to the app', async ({ page }, info) => {
  const externalRequests: string[] = []
  page.on('request', request => {
    if (!request.url().startsWith('http://127.0.0.1:14175')) externalRequests.push(request.url())
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('你的私人碎碎念都值得被记住')
  await expect(page).toHaveTitle('BBTalk · 你的私人碎碎念')
  await expect(page.locator('.landing-root')).toHaveCSS('opacity', '1')
  await expect(page.getByRole('navigation', { name: '产品导航' })).toHaveCSS('display', 'flex')
  await expect(page.getByRole('img', { name: 'BBTalk 移动端记录界面示意' })).toBeVisible()
  await expect(page.locator('h1 .text-gradient')).toHaveText('私人碎碎念')
  await expect(page.locator('header.glass')).toHaveCSS('backdrop-filter', 'saturate(1.8) blur(20px)')
  await expect(page.getByRole('link', { name: '立即开始', exact: true })).toHaveCSS('background-color', 'rgb(11, 11, 14)')
  await page.screenshot({ path: info.outputPath('product-page.png'), animations: 'disabled' })
  for (const section of ['features', 'download', 'privacy', 'deploy', 'faq']) {
    await page.locator(`#${section}`).evaluate(el => el.scrollIntoView({ block: 'start' }))
    await page.screenshot({ path: info.outputPath(`product-${section}.png`), animations: 'disabled' })
  }
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(await page.getByTestId('route-viewport').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  }
  const faq = page.locator('summary').filter({ hasText: '支持哪些设备？' })
  await faq.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('正式 Web 支持现代桌面和手机浏览器', { exact: false })).toBeVisible()
  await page.locator('summary').filter({ hasText: 'Web 可以直接录音吗？' }).click()
  await expect(page.getByText(/Web 支持上传和播放音频附件，暂不提供内置录音/)).toBeVisible()
  await page.locator('#download').evaluate(el => el.scrollIntoView({ block: 'start' }))
  await expect(page.getByRole('heading', { name: '现在就开始记录' })).toBeInViewport()
  await expect(page.getByRole('link', { name: '查看 Windows 安装包' })).toHaveAttribute('href', 'https://github.com/cone387/ChewyBBTalk/releases/tag/desktop-stable')
  await page.getByRole('link', { name: '立即开始', exact: true }).click()
  await expect(page.getByRole('heading', { name: '登录 BBTalk' })).toBeVisible()
  await page.getByRole('link', { name: '了解 BBTalk · 产品介绍' }).click()
  await expect(page).toHaveURL(/\/about$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('都值得被记住')
  expect(externalRequests).toEqual([])
})

test('fixed product URL is independent of authentication and respects reduced motion', async ({ page }) => {
  const apiRequests: string[] = []
  page.on('request', request => { if (request.url().includes('/api/v1/')) apiRequests.push(request.url()) })
  await page.addInitScript(() => {
    localStorage.setItem('bbtalk_privacy_mode', 'true')
    localStorage.setItem('bbtalk_access_token', 'expired-token')
  })
  await page.route('**/api/v1/**', route => route.abort())
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/about')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('都值得被记住')
  await expect(page.locator('.anim-float').first()).toHaveCSS('animation-name', 'none')
  expect(apiRequests).toEqual([])
  await page.getByRole('link', { name: '进入 BBTalk', exact: true }).click()
  await expect(page).toHaveURL(/\/locked$/)
})

test('signed-in home remains the feed and settings links back to the product page', async ({ page }) => {
  const username = `landing_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const password = 'landing-route-check-2026'
  expect((await page.request.post('/api/v1/bbtalk/auth/register', { data: { username, password } })).status()).toBe(201)
  await page.goto('/app')
  await page.getByLabel('用户名', { exact: true }).fill(username)
  await page.getByLabel('密码', { exact: true }).fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByLabel('记录内容')).toBeVisible()
  await page.goto('/settings')
  await page.getByRole('button', { name: /产品介绍/ }).click()
  await expect(page).toHaveURL(/\/about$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('都值得被记住')
  await page.getByRole('link', { name: '进入 BBTalk', exact: true }).click()
  await expect(page.getByLabel('记录内容')).toBeVisible()
  await expect(page).toHaveURL('http://127.0.0.1:14175/')
})
