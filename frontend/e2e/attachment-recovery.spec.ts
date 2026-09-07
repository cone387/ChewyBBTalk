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

test('partial upload and failed publish preserve input and retry without reuploading successes', async ({ page }, info) => {
  await login(page)
  const content = '#保留标签 附件失败恢复'
  await page.getByPlaceholder('你要BB什么？').fill(content)
  await page.getByTitle('仅自己可见', { exact: true }).click()
  let uploadCount = 0
  await page.route('**/api/v1/attachments/files/', async route => {
    if (route.request().method() !== 'POST') return route.continue()
    uploadCount++
    if (uploadCount === 2) return route.fulfill({ status: 413, contentType: 'text/html', body: 'Too large' })
    return route.continue()
  })
  await page.getByLabel('上传附件', { exact: true }).setInputFiles([
    { name: 'first.txt', mimeType: 'text/plain', buffer: Buffer.from('first file') },
    { name: 'second.txt', mimeType: 'text/plain', buffer: Buffer.from('second file') },
  ])
  await expect(page.getByText('文件太大，请压缩后重试')).toBeVisible()
  await expect(page.getByRole('button', { name: /^移除附件 / })).toHaveCount(1)
  await expect(page.getByRole('button', { name: '发布', exact: true })).toBeDisabled()
  await page.screenshot({ path: info.outputPath('upload-failure.png'), fullPage: true })
  await page.getByRole('button', { name: '重试上传' }).click()
  await expect(page.getByRole('button', { name: /^移除附件 / })).toHaveCount(2)
  expect(uploadCount).toBe(3)

  await page.route('**/api/v1/bbtalk/', async route => {
    if (route.request().method() === 'POST') return route.abort('internetdisconnected')
    return route.continue()
  })
  await page.getByRole('button', { name: '发布', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('发布失败，内容已保留')
  await expect(page.getByPlaceholder('你要BB什么？')).toHaveValue(content)
  await expect(page.getByTitle('公开可见', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^移除附件 / })).toHaveCount(2)
  await page.unroute('**/api/v1/bbtalk/')
  await page.getByRole('button', { name: '发布', exact: true }).click()
  await expect(page.getByPlaceholder('你要BB什么？')).toHaveValue('')
  await page.reload()
  const card = page.locator('.bbtalk-item').first()
  await expect(card).toContainText('附件失败恢复')
  await expect(card).toContainText('保留标签')
  await expect(card.getByRole('link', { name: /first.txt/ })).toBeVisible()
  await expect(card.getByRole('link', { name: /second.txt/ })).toBeVisible()
  expect(uploadCount).toBe(3)
  await card.getByTitle('更多', { exact: true }).click()
  await card.getByRole('button', { name: '编辑', exact: true }).click()
  await card.getByPlaceholder('你要BB什么？').fill('#保留标签 更新失败恢复')
  await page.route('**/api/v1/bbtalk/*/', async route => {
    if (route.request().method() === 'PATCH' || route.request().method() === 'PUT') return route.fulfill({ status: 500, json: { error: 'test failure' } })
    return route.continue()
  })
  await card.getByRole('button', { name: '保存', exact: true }).click()
  await expect(card.getByRole('alert')).toContainText('更新失败，内容已保留')
  await expect(card.getByPlaceholder('你要BB什么？')).toHaveValue('#保留标签 更新失败恢复')
  await expect(card.getByRole('button', { name: /^移除附件 / })).toHaveCount(2)
  await page.unroute('**/api/v1/bbtalk/*/')
  await card.getByRole('button', { name: '保存', exact: true }).click()
  await expect(card.getByPlaceholder('你要BB什么？')).toHaveCount(0)
  await page.reload()
  await expect(card).toContainText('更新失败恢复')
})

test('failed uploads can be removed and the same file selected again', async ({ page }) => {
  await login(page)
  await page.getByPlaceholder('你要BB什么？').fill('取消上传测试')
  await page.route('**/api/v1/attachments/files/', route => route.abort('internetdisconnected'))
  const file = { name: 'retry.txt', mimeType: 'text/plain', buffer: Buffer.from('retry me') }
  await page.getByLabel('上传附件', { exact: true }).setInputFiles(file)
  await expect(page.getByText('网络连接失败，请检查网络后重试')).toBeVisible()
  await page.getByRole('button', { name: '移除文件', exact: true }).click()
  await expect(page.getByRole('button', { name: '发布', exact: true })).toBeEnabled()
  await page.unroute('**/api/v1/attachments/files/')
  await page.getByLabel('上传附件', { exact: true }).setInputFiles(file)
  await expect(page.getByRole('button', { name: '移除附件 retry.txt', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '移除附件 retry.txt', exact: true }).click()
  await expect(page.getByRole('button', { name: /^移除附件 / })).toHaveCount(0)
})

test('long text remains scrollable with large text, dark preference and landscape', async ({ page }, info) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await login(page)
  await page.evaluate(() => { document.documentElement.style.fontSize = '24px' })
  const editor = page.getByPlaceholder('你要BB什么？')
  const content = Array.from({ length: 35 }, (_, i) => `第 ${i + 1} 行 长内容走查`).join('\n')
  await editor.fill(content)
  expect(await editor.evaluate(element => getComputedStyle(element).overflowY)).toBe('auto')
  await editor.evaluate(element => { element.scrollTop = element.scrollHeight })
  expect(await editor.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
  await page.screenshot({ path: info.outputPath('large-text-portrait.png'), fullPage: true })
  for (const size of [{ width: 375, height: 812 }, { width: 812, height: 375 }]) {
    await page.setViewportSize(size)
    const publish = page.getByRole('button', { name: '发布', exact: true })
    await publish.scrollIntoViewIfNeeded()
    const box = await publish.boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(size.width)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`large-text-${size.width}.png`), fullPage: true })
  }
})

test('privacy lock editor also retains content after publish failure', async ({ page }) => {
  await login(page)
  await page.evaluate(() => localStorage.setItem('bbtalk_privacy_mode', 'true'))
  await page.goto('/locked')
  await expect(page).toHaveURL(/\/locked$/)
  await page.getByPlaceholder('你要BB什么？').fill('防窥页面失败恢复')
  await page.route('**/api/v1/bbtalk/', route => route.request().method() === 'POST'
    ? route.fulfill({ status: 500, json: { error: 'test failure' } }) : route.continue())
  await page.getByRole('button', { name: '发布', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('发布失败，内容已保留')
  await expect(page.getByPlaceholder('你要BB什么？')).toHaveValue('防窥页面失败恢复')
  await page.unroute('**/api/v1/bbtalk/')
  await page.getByRole('button', { name: '发布', exact: true }).click()
  await expect(page.getByPlaceholder('你要BB什么？')).toHaveValue('')
})

test('import dialog remains usable in portrait and landscape with large text', async ({ page }, info) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await login(page)
  await page.goto('/settings/data')
  // This fixture opens the existing dialog only; no import is executed.
  await page.route('**/api/v1/bbtalk/data/validate/', route => route.fulfill({ json: {
    valid: true, file_type: 'json', export_time: '2026-09-07T00:00:00Z',
    preview: { bbtalks_count: 100, tags_count: 10, storage_settings_count: 0 },
  } }))
  await page.evaluate(() => { document.documentElement.style.fontSize = '24px' })
  await page.locator('input[type=file]').setInputFiles({ name: 'preview.json', mimeType: 'application/json', buffer: Buffer.from('{}') })
  const dialog = page.getByRole('dialog', { name: '确认导入' })
  await expect(dialog).toBeVisible()
  for (const size of [{ width: 375, height: 812 }, { width: 812, height: 375 }]) {
    await page.setViewportSize(size)
    const cancel = dialog.getByRole('button', { name: '取消', exact: true })
    await cancel.scrollIntoViewIfNeeded()
    const box = await cancel.boundingBox()
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.y + box!.height).toBeLessThanOrEqual(size.height)
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`dialog-${size.width}.png`), fullPage: true })
  }
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})
