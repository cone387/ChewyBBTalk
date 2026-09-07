import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { createServer } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const executablePath = require('../../desktop/node_modules/electron') as string
const backend = 'http://127.0.0.1:18020'
const password = 'desktop-integration-only-2026'

test('real Electron restart, lost response retry and wake account isolation', async ({ request }, testInfo) => {
  const profile = await mkdtemp(resolve(tmpdir(), 'chewy-electron-integration-'))
  let application: ElectronApplication | undefined
  let dropResponse = true
  let hideReceipt = true
  const submissionKeys: string[] = []
  const proxy = createServer(async (req, res) => {
    try {
      if (hideReceipt && req.url?.includes('submission-status')) {
        res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{}'); return
      }
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(Buffer.from(chunk))
      const headers = new Headers()
      for (const [key, value] of Object.entries(req.headers)) {
        if (value && !['host', 'connection', 'content-length'].includes(key)) headers.set(key, String(value))
      }
      const upstream = await fetch(backend + req.url, { method: req.method, headers,
        ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) })
      const body = Buffer.from(await upstream.arrayBuffer())
      if (req.method === 'POST' && req.url === '/api/v1/bbtalk/') {
        submissionKeys.push(String(req.headers['idempotency-key']))
        if (dropResponse) { dropResponse = false; res.destroy(); return }
      }
      res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/json' })
      res.end(body)
    } catch { res.writeHead(502); res.end('{}') }
  })
  await new Promise<void>(resolve => proxy.listen(0, '127.0.0.1', resolve))
  const apiUrl = `http://127.0.0.1:${(proxy.address() as { port: number }).port}`
  const username = `desktop_${Date.now()}`
  const register = await request.post(backend + '/api/v1/bbtalk/auth/register/', { data: { username, password } })
  expect(register.status()).toBe(201)
  const owner = await register.json()
  const otherName = username + '_other'
  expect((await request.post(backend + '/api/v1/bbtalk/auth/register/', { data: { username: otherName, password } })).status()).toBe(201)
  const launch = async () => {
    application = await electron.launch({ executablePath, args: [resolve('../desktop/out/main/integration.js'), '--no-sandbox'],
      env: { ...process.env, CHEWY_INTEGRATION_USER_DATA: profile } })
    return application.firstWindow()
  }
  const capture = async (name: string) => {
    const png = await application!.evaluate(async ({ BrowserWindow }) =>
      (await BrowserWindow.getAllWindows()[0].capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG().toString('base64'))
    await writeFile(testInfo.outputPath(name), Buffer.from(png, 'base64'))
  }
  const login = async (page: Page, account: string) => {
    const result = await page.evaluate(async ({ account, password, apiUrl }) =>
      (window as any).desktop.auth.login(account, password, apiUrl), { account, password, apiUrl })
    expect(result.ok).toBe(true)
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  }
  try {
    let page = await launch()
    await login(page, username)
    await page.getByPlaceholder('你要BB什么？').fill('桌面原始内容 #桌面标签 ')
    await page.getByRole('button', { name: /^发布/ }).click()
    await expect(page.getByRole('status')).toContainText('有一份发布结果待核对')
    const pending = await page.evaluate(() => (window as any).desktop.compose.submissionSnapshot())
    expect(pending.intent.state).toBe('pending')
    await application!.close(); application = undefined
    page = await launch()
    await expect(page.getByRole('status')).toContainText('有一份发布结果待核对')
    await expect(page.getByRole('button', { name: '重试原提交' })).toBeInViewport({ ratio: 1 })
    await expect(page.getByRole('button', { name: /^发布/ })).toBeInViewport({ ratio: 1 })
    await expect.poll(async () => (await page.getByPlaceholder('你要BB什么？').boundingBox())!.height).toBeGreaterThanOrEqual(42)
    await capture('desktop-pending.png')
    await page.getByPlaceholder('你要BB什么？').fill('后来输入的新草稿')
    await page.getByRole('button', { name: '重试原提交' }).click()
    await expect(page.getByRole('status')).toContainText('原提交已确认')
    expect(submissionKeys).toEqual([pending.intent.key, pending.intent.key])
    await expect(page.getByPlaceholder('你要BB什么？')).toHaveValue('后来输入的新草稿')
    const records = await request.get(backend + '/api/v1/bbtalk/', { headers: { Authorization: `Bearer ${owner.access}` } })
    const savedRecords = await records.json()
    expect(savedRecords.count).toBe(1)
    expect(savedRecords.results[0].tags.map((tag: any) => tag.name)).toEqual(['桌面标签'])
    await application!.close(); application = undefined
    page = await launch()
    await expect(page.getByPlaceholder('你要BB什么？')).toHaveValue('后来输入的新草稿')
    const ownerSnapshot = await page.evaluate(() => (window as any).desktop.compose.submissionSnapshot())
    await login(page, otherName)
    await expect(page.getByPlaceholder('你要BB什么？')).toHaveValue('')
    await expect(page.getByRole('status')).toHaveCount(0)
    const stale = await page.evaluate(async previous => {
      try { await (window as any).desktop.compose.recoverSubmission(previous.session, true); return 'accepted' }
      catch { return 'rejected' }
    }, ownerSnapshot)
    expect(stale).toBe('rejected')
    await login(page, username)
    await expect(page.getByPlaceholder('你要BB什么？')).toHaveValue('后来输入的新草稿')
    hideReceipt = false
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect(page.getByRole('status')).toContainText('原提交已确认')
    await capture('desktop-confirmed.png')
    // Wake a pending original receipt, including a long expanded recovery panel.
    dropResponse = true
    hideReceipt = true
    await page.getByPlaceholder('你要BB什么？').fill(Array.from({ length: 20 }, (_, index) => `唤醒核对第 ${index + 1} 行`).join('\n'))
    await page.getByRole('button', { name: /^发布/ }).click()
    await expect(page.getByRole('status')).toContainText('有一份发布结果待核对')
    await page.getByText('查看原提交内容', { exact: true }).click()
    await page.getByRole('button', { name: '重试原提交' }).scrollIntoViewIfNeeded()
    await expect(page.getByRole('button', { name: '重试原提交' })).toBeInViewport({ ratio: 1 })
    await expect(page.getByRole('button', { name: /^发布/ })).toBeInViewport({ ratio: 1 })
    await expect.poll(async () => (await page.getByPlaceholder('你要BB什么？').boundingBox())!.height).toBeGreaterThanOrEqual(42)
    await capture('desktop-expanded.png')
    hideReceipt = false
    const requestsBeforeWake = submissionKeys.length
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect(page.getByRole('status')).toContainText('原提交已确认')
    expect(submissionKeys).toHaveLength(requestsBeforeWake)
    const afterWake = await request.get(backend + '/api/v1/bbtalk/', { headers: { Authorization: `Bearer ${owner.access}` } })
    expect((await afterWake.json()).count).toBe(2)
  } finally {
    await application?.close()
    await new Promise<void>(resolve => proxy.close(() => resolve()))
    await rm(profile, { recursive: true, force: true })
  }
})
