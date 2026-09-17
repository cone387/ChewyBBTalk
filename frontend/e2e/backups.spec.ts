import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

async function login(page: Page) {
  const username = `backup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const password = 'backup-browser-2026'
  expect((await page.request.post('/api/v1/bbtalk/auth/register/', { data: { username, password } })).status()).toBe(201)
  await page.goto('/login')
  await page.getByPlaceholder('请输入用户名').fill(username)
  await page.getByPlaceholder('请输入密码').fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByLabel('记录内容')).toBeEnabled()
}

test('create, download and restore a real backup to a separate account', async ({ page }, info) => {
  await login(page)
  await page.getByLabel('记录内容').fill('#备份标签 浏览器完整恢复')
  await page.getByLabel('上传附件', { exact: true }).setInputFiles({ name: 'backup.txt', mimeType: 'text/plain', buffer: Buffer.from('backup bytes') })
  await expect(page.getByRole('button', { name: '移除附件 backup.txt' })).toBeVisible()
  await page.getByRole('button', { name: '发布', exact: true }).click()
  await expect(page.getByLabel('记录内容')).toHaveValue('')
  const id = await page.locator('.bbtalk-item').first().getAttribute('data-record-id')
  const token = await page.evaluate(() => localStorage.getItem('bbtalk_access_token'))
  expect((await page.request.post(`/api/v1/bbtalk/${id}/comments/`, { headers: { Authorization: `Bearer ${token}` }, data: { content: '恢复评论' } })).ok()).toBe(true)
  await page.goto('/settings/data')
  await expect(page.getByRole('heading', { name: '服务器备份' })).toBeVisible()
  await page.getByRole('button', { name: '创建完整备份' }).click()
  await expect(page.getByRole('status')).toContainText('完整备份已创建')
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: /^下载备份 / }).click()
  const downloaded = await downloadEvent
  const bytes = await readFile((await downloaded.path())!)
  expect(bytes.subarray(0, 2).toString()).toBe('PK')
  await page.screenshot({ path: info.outputPath('backup-list.png'), fullPage: true })
  await page.evaluate(() => { for (const key of ['bbtalk_access_token', 'bbtalk_refresh_token', 'bbtalk_user_info']) localStorage.removeItem(key) })
  await login(page)
  await page.goto('/settings/data')
  await expect(page.getByText('暂无服务器备份')).toBeVisible()
  await page.getByLabel('选择导入文件').setInputFiles({ name: downloaded.suggestedFilename(), mimeType: 'application/zip', buffer: bytes })
  await expect(page.getByRole('dialog')).toContainText('评论数量：')
  await page.getByRole('button', { name: '开始导入' }).click()
  await expect(page.getByRole('region', { name: '导入结果' })).toContainText('新增 1 条内容、1 个标签、1 条评论、1 个附件')
  await page.getByRole('button', { name: '查看记录' }).click()
  const card = page.locator('.bbtalk-item').first()
  await expect(card).toContainText('浏览器完整恢复')
  await expect(card).toContainText('备份标签')
  const href = await card.getByRole('link', { name: /backup.txt/ }).getAttribute('href')
  expect(await (await page.request.get(href!)).text()).toBe('backup bytes')
})

test('backup request and download failures remain visible and retryable', async ({ page }) => {
  await login(page)
  await page.goto('/settings/data')
  await page.route('**/api/v1/bbtalk/data/backups/', route => route.request().method() === 'POST' ? route.fulfill({ status: 500, json: { error: '备份创建失败' } }) : route.continue())
  await page.getByRole('button', { name: '创建完整备份' }).click()
  await expect(page.getByRole('alert')).toContainText('备份创建失败')
  await page.unroute('**/api/v1/bbtalk/data/backups/')
  await page.getByRole('button', { name: '创建完整备份' }).click()
  await expect(page.getByRole('status')).toContainText('完整备份已创建')
  await page.route('**/api/v1/bbtalk/data/backups/*.zip/', route => route.abort())
  await page.getByRole('button', { name: /^下载备份 / }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('button', { name: /^下载备份 / })).toBeEnabled()
})

test('partial import keeps an explicit report instead of announcing complete success', async ({ page }) => {
  await login(page)
  await page.goto('/settings/data')
  const content = { version: '1.0', tags: [], bbtalks: [{ uid: 'partial', content: '有效记录', tags: [] }], comments: [{ bbtalk_uid: 'missing', content: '无法关联的评论' }] }
  await page.getByLabel('选择导入文件').setInputFiles({ name: 'partial.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(content)) })
  await page.getByRole('button', { name: '开始导入' }).click()
  await expect(page.getByRole('heading', { name: '导入部分完成，请核对' })).toBeVisible()
  await expect(page.getByRole('region', { name: '导入结果' })).toContainText('1 条评论')
  await expect(page).toHaveURL(/\/settings\/data$/)
})
