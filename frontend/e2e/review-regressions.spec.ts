import { test, expect, type Page } from '@playwright/test'

test('account settings persist profile and require the new password after changing it', async ({ page }) => {
  const headers = await account(page)
  const me = await (await page.request.get('/api/v1/bbtalk/user/me/', { headers })).json()
  await page.goto('/settings')
  await page.getByRole('button', { name: /账户设置/ }).click()
  await page.getByLabel('显示名称', { exact: true }).fill('账户回归测试')
  await page.getByLabel('简介', { exact: true }).fill('第一行\n第二行')
  await page.getByRole('button', { name: '保存资料', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('账户资料已保存')
  await page.reload()
  await expect(page.getByLabel('显示名称', { exact: true })).toHaveValue('账户回归测试')
  await page.getByLabel('当前密码', { exact: true }).fill('wrong-password')
  await page.getByLabel('新密码', { exact: true }).fill('changed-password-2026')
  await page.getByLabel('确认新密码', { exact: true }).fill('different-password')
  await page.getByRole('button', { name: '修改密码并退出登录' }).click()
  await expect(page.getByRole('alert')).toContainText('两次输入的新密码不一致')
  await expect(page.getByRole('alert')).toBeInViewport()
  await page.getByLabel('确认新密码', { exact: true }).fill('changed-password-2026')
  await page.getByRole('button', { name: '修改密码并退出登录' }).click()
  await expect(page.getByRole('alert')).toContainText('当前密码不正确')
  await expect(page.getByRole('alert')).toBeInViewport()
  await page.getByLabel('当前密码', { exact: true }).fill('review-regression-2026')
  await page.getByRole('button', { name: '修改密码并退出登录' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.getByPlaceholder('请输入用户名').fill(me.username)
  await page.getByPlaceholder('请输入密码').fill('review-regression-2026')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByPlaceholder('请输入密码').fill('changed-password-2026')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByLabel('记录内容')).toBeEnabled()
})

async function account(page: Page) {
  const username = `review_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const password = 'review-regression-2026'
  const response = await page.request.post('/api/v1/bbtalk/auth/register/', { data: { username, password } })
  expect(response.status()).toBe(201)
  const session = await response.json()
  await page.goto('/login')
  await page.getByPlaceholder('请输入用户名').fill(username)
  await page.getByPlaceholder('请输入密码').fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByLabel('记录内容')).toBeEnabled()
  return { Authorization: `Bearer ${session.access}` }
}

test('cancelled editor drafts never reappear or overwrite a later visibility change', async ({ page }) => {
  await account(page)
  await page.getByLabel('记录内容').fill('saved baseline #技术 #旅行 ')
  await page.getByRole('button', { name: '发布', exact: true }).click()
  const card = page.locator('[data-record-id]').first()
  await expect(card).toContainText('saved baseline')
  await expect(card.locator('.record-tag')).toHaveCount(2)
  const id = await card.getAttribute('data-record-id')
  await card.getByTitle('更多', { exact: true }).click()
  await card.getByRole('button', { name: '编辑', exact: true }).click()
  const editor = page.getByLabel('记录内容').last()
  await editor.fill('discarded text')
  await expect(page.getByRole('status').filter({ hasText: '草稿已保存' }).last()).toHaveText('草稿已保存到此浏览器')
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await card.getByTitle('更多', { exact: true }).click()
  await card.getByRole('button', { name: '编辑', exact: true }).click()
  await expect(editor).toContainText('saved baseline')
  await expect(editor).not.toContainText('discarded text')
  const editCard = page.locator('.bbtalk-item').filter({ has: page.getByRole('button', { name: '保存', exact: true }) })
  await editCard.getByTitle('仅自己可见', { exact: true }).click()
  await editCard.getByRole('button', { name: '保存', exact: true }).click()
  await expect(card).toContainText('saved baseline')
  await page.reload()
  await expect(page.locator(`[data-record-id="${id}"]`)).toContainText('saved baseline')
})

test('anonymous public feed and comments stay readable while private comments remain unavailable', async ({ page, browser }) => {
  const headers = await account(page)
  const create = await page.request.post('/api/v1/bbtalk/', { headers, data: { content: 'public review comments', visibility: 'public' } })
  const record = await create.json()
  for (let index = 0; index < 4; index++) {
    expect((await page.request.post(`/api/v1/bbtalk/${record.uid}/comments/`, { headers, data: { content: `comment-${index}\nnext line` } })).status()).toBe(201)
  }
  const context = await browser.newContext()
  const anonymous = await context.newPage()
  const unauthorized: string[] = []
  anonymous.on('response', response => { if (response.status() === 401) unauthorized.push(response.url()) })
  await anonymous.goto(new URL('/public', page.url()).href)
  const card = anonymous.locator('[data-record-id]').filter({ hasText: 'public review comments' })
  await expect(card).toContainText('comment-0')
  await expect(card.getByText('comment-3', { exact: false })).toHaveCount(0)
  await card.getByRole('button', { name: '查看全部 4 条评论' }).click()
  await expect(card).toContainText('comment-3')
  await expect(card.getByRole('button', { name: /^删除评论/ })).toHaveCount(0)
  await anonymous.goto(new URL(`/detail/${record.uid}`, page.url()).href)
  await expect(anonymous.getByText('public review comments')).toBeVisible()
  await expect(anonymous.getByText(/comment-0/)).toBeVisible()
  expect(unauthorized).toEqual([])
  await page.request.patch(`/api/v1/bbtalk/${record.uid}/`, { headers, data: { visibility: 'private' } })
  expect((await anonymous.request.get(new URL(`/api/v1/bbtalk/public/${record.uid}/comments/`, page.url()).href)).status()).toBe(404)
  await context.close()
})

test('attachment images fit small cards and downloading preserves the original filename', async ({ page }, info) => {
  const headers = await account(page)
  const filename = '带 空格 & 中文.txt'
  const upload = await page.request.post('/api/v1/attachments/files/', {
    headers, multipart: { file: { name: filename, mimeType: 'text/plain', buffer: Buffer.from('review download') } },
  })
  expect(upload.ok()).toBe(true)
  const file = await upload.json()
  const attachments = [{ uid: file.id, url: file.preview_url, type: 'file', filename }]
  for (const name of ['first.png', 'second.png']) {
    const response = await page.request.post('/api/v1/attachments/files/', { headers, multipart: { file: {
      name, mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=', 'base64'),
    } } })
    expect(response.status()).toBe(201)
    const image = await response.json()
    attachments.push({ uid: image.id, url: image.preview_url, type: 'image', filename: name })
  }
  const create = await page.request.post('/api/v1/bbtalk/', { headers, data: { content: 'download review', attachments } })
  expect(create.status()).toBe(201)
  await page.reload()
  const card = page.locator('[data-record-id]').filter({ hasText: 'download review' })
  const download = page.waitForEvent('download')
  await card.getByRole('link', { name: /带 空格/ }).click()
  expect((await download).suggestedFilename()).toBe(filename)
  await expect(card.locator('img')).toHaveCount(2)
  for (const image of await card.locator('img').all()) {
    const bounds = await image.boundingBox()
    const parent = await card.boundingBox()
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(parent!.x + parent!.width)
  }
  await card.getByRole('button', { name: 'first.png', exact: true }).click()
  const preview = page.getByRole('dialog', { name: '图片预览' })
  await expect(preview.getByText('1 / 2')).toBeVisible()
  await preview.getByRole('button', { name: '下一张图片' }).click()
  await expect(preview.getByText('2 / 2')).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  await expect(preview.getByText('1 / 2')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(preview).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('download-filename.png') })
})
