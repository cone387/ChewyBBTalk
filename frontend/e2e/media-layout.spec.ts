import { test, expect, type Page } from '@playwright/test'

async function login(page: Page) {
  const username = `files_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const password = 'e2e-only-attachments-2026'
  expect((await page.request.post('/api/v1/bbtalk/auth/register/', { data: { username, password } })).status()).toBe(201)
  await page.goto('/login')
  await page.getByPlaceholder('请输入用户名').fill(username)
  await page.getByPlaceholder('请输入密码').fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByPlaceholder('你要BB什么？')).toBeVisible()
}

test('image failure and corrupt cache recover through the visible retry action', async ({ page }, info) => {
  await login(page)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64')
  let attempts = 0
  await page.route('**/api/v1/attachments/files/', async route => {
    if (route.request().method() !== 'POST') return route.continue()
    const response = await route.fetch()
    expect(response.status()).toBe(201)
    const data = await response.json()
    const source = data.preview_url || data.url || data.file
    await page.route(new URL(source, page.url()).href, async imageRoute => {
      attempts++
      if (attempts === 1) return imageRoute.abort('internetdisconnected')
      return imageRoute.fulfill({ status: 200, contentType: 'image/png', body: attempts === 2 ? Buffer.from('corrupt image') : png })
    })
    await route.fulfill({ response })
  })
  await page.getByPlaceholder('你要BB什么？').fill('图片恢复走查')
  await page.getByLabel('上传图片', { exact: true }).setInputFiles({ name: 'retry-image.png', mimeType: 'image/png', buffer: png })
  const retry = page.getByRole('button', { name: '重试加载图片 retry-image.png', exact: true })
  await expect(retry).toBeVisible()
  await retry.focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => attempts).toBe(2)
  await expect(retry).toBeVisible()
  await page.screenshot({ path: info.outputPath('image-error.png'), fullPage: true })
  await retry.click()
  const img = page.getByRole('img', { name: 'retry-image.png', exact: true })
  await expect(img).toBeVisible()
  await expect.poll(() => img.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(1)
  expect(attempts).toBe(3)
  await expect(retry).toHaveCount(0)
})

test('long links, plain and highlighted code, and wide tables stay inside the feed', async ({ page }, info) => {
  await login(page)
  const long = 'verylongword'.repeat(30)
  const content = `长内容布局\n\nhttps://example.com/${long}\n\n\`\`\`\n${long}\n\`\`\`\n\n\`\`\`js\n${long}\n\`\`\`\n\n| ${long} | 第二列 |\n| --- | --- |\n| 内容 | 表格内容 |`
  await page.getByPlaceholder('你要BB什么？').fill(content)
  await page.getByRole('button', { name: '发布', exact: true }).click()
  const card = page.locator('.bbtalk-item').first()
  await expect(card).toBeVisible()
  for (const width of [375, 812]) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 375 })
    const expand = card.getByRole('button', { name: /展开/ })
    if (await expand.count()) await expand.first().click()
    const box = await card.boundingBox()
    expect(box!.x + box!.width).toBeLessThanOrEqual(width)
    expect(await card.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    const scrollAreas = card.locator('pre, [role=region]')
    await expect(scrollAreas).toHaveCount(3)
    for (const area of await scrollAreas.all()) {
      expect(await area.evaluate(element => getComputedStyle(element).overflowX)).toBe('auto')
      await area.evaluate(element => { element.scrollLeft = 100 })
      expect(await area.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
    }
    await page.screenshot({ path: info.outputPath(`content-${width}.png`), fullPage: true })
  }
})

