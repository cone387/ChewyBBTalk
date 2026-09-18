import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const executablePath = require('../../desktop/node_modules/electron') as string
const server = 'http://127.0.0.1:14175'

test('browser authorization, screenshots, partial retry, close/restart drafts, IME and settings', async ({ page: web, request }, testInfo) => {
  test.setTimeout(120000)
  const png = await readFile(resolve('../desktop/resources/icon.png'))
  const profile = await mkdtemp(resolve(tmpdir(), 'chewy-reliability-'))
  let application: ElectronApplication | undefined
  const username = `reliability_${Date.now()}`
  const password = 'isolated-desktop-password'
  const registration = await request.post(server + '/api/v1/bbtalk/auth/register/', { data: { username, password } })
  expect(registration.status()).toBe(201)
  const owner = await registration.json()
  const launch = async (offline = false) => {
    application = await electron.launch({ executablePath, args: [resolve('../desktop/out/main/integration.js'), '--no-sandbox'],
      env: { ...process.env, CHEWY_INTEGRATION_USER_DATA: profile, CHEWY_INTEGRATION_OFFLINE: offline ? '1' : '0' } })
    return application.firstWindow()
  }
  try {
    let compose = await launch()
    // Keep OS browser launch at a test seam; the actual consent page, loopback
    // HTTP listener, token exchange and secure credential store are real.
    await application!.evaluate(({ shell }) => {
      shell.openExternal = async url => { (globalThis as any).__authorizationUrl = url }
    })
    await compose.evaluate(apiUrl => {
      (window as any).__browserResult = (window as any).desktop.auth.browserLogin(apiUrl)
    }, server)
    await expect.poll(() => application!.evaluate(() => (globalThis as any).__authorizationUrl)).toBeTruthy()
    const authorization = await application!.evaluate(() => (globalThis as any).__authorizationUrl)
    await web.goto(authorization)
    await web.getByRole('link', { name: '登录并继续' }).click()
    await web.getByPlaceholder('请输入用户名').fill(username)
    await web.getByPlaceholder('请输入密码').fill(password)
    await web.getByRole('button', { name: '登录', exact: true }).click()
    await expect(web.getByRole('button', { name: '确认登录桌面端' })).toBeVisible()
    await web.screenshot({ path: testInfo.outputPath('browser-consent.png') })
    await web.getByRole('button', { name: '确认登录桌面端' }).click()
    await expect(web.locator('body')).toContainText('登录成功')
    expect((await compose.evaluate(() => (window as any).__browserResult)).ok).toBe(true)
    await expect(compose.getByRole('button', { name: /^发布/ })).toBeVisible()
    expect(await application!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isAlwaysOnTop())).toBe(false)
    await compose.getByRole('button', { name: '固定置顶' }).click()
    expect(await application!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isAlwaysOnTop())).toBe(true)
    await compose.getByRole('button', { name: '固定置顶' }).click()

    await application!.evaluate(() => {
      const original = globalThis.fetch
      let fail = true
      globalThis.fetch = async (url, init) => {
        if (fail && String(url).endsWith('/api/v1/attachments/files/') && init?.method === 'POST') {
          fail = false; return new Response('{"detail":"临时上传失败"}', { status: 503 })
        }
        return original(url, init)
      }
    })
    await compose.locator('input[type=file]').setInputFiles([
      { name: 'first.png', mimeType: 'image/png', buffer: png },
      { name: 'second.png', mimeType: 'image/png', buffer: png },
    ])
    await expect(compose.locator('.upload-failed')).toHaveCount(1)
    await expect(compose.locator('.upload-uploaded')).toHaveCount(1)
    await expect.poll(() => compose.locator('.file-preview-img').evaluateAll(images => images.every(image => (image as HTMLImageElement).naturalWidth > 0))).toBe(true)
    await compose.getByPlaceholder('你要BB什么？').fill('立即关闭也保留的截图草稿')
    const settingsPromise = application!.waitForEvent('window')
    await compose.getByRole('button', { name: '设置', exact: true }).click()
    const settings = await settingsPromise
    await settings.waitForLoadState()
    await compose.getByRole('button', { name: '关闭', exact: true }).click()
    await expect.poll(() => compose.isClosed()).toBe(true)
    const nextWindow = application!.waitForEvent('window')
    await settings.evaluate(() => (window as any).desktop.compose.show())
    compose = await nextWindow
    await expect(compose.getByPlaceholder('你要BB什么？')).toHaveValue('立即关闭也保留的截图草稿')
    await expect(compose.locator('.upload-failed')).toHaveCount(1)
    await compose.getByRole('button', { name: '重试', exact: true }).click()
    await expect(compose.locator('.upload-uploaded')).toHaveCount(2)
    const textarea = compose.getByPlaceholder('你要BB什么？')
    await textarea.dispatchEvent('compositionstart')
    await textarea.press('Enter')
    const before = await request.get(server + '/api/v1/bbtalk/', { headers: { Authorization: `Bearer ${owner.access}` } })
    expect((await before.json()).count).toBe(0)
    await textarea.dispatchEvent('compositionend')
    await textarea.fill('立即关闭也保留的截图草稿')
    const image = await application!.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('/compose/'))!
      return (await window.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG().toString('base64')
    })
    await writeFile(testInfo.outputPath('desktop-attachments.png'), Buffer.from(image, 'base64'))
    await application!.close(); application = undefined
    const config = JSON.parse(await readFile(resolve(profile, 'chewybbtalk.json'), 'utf8'))
    expect(config.auth.refreshToken).toBeUndefined()
    expect(config.auth.encryptedRefreshToken).toBeTruthy()
    compose = await launch(true)
    await expect(compose.getByPlaceholder('你要BB什么？')).toHaveValue('立即关闭也保留的截图草稿')
    await expect(compose.locator('.upload-uploaded')).toHaveCount(2)
    await expect(compose.locator('.session-notice')).toContainText('当前离线')
    await application!.evaluate(() => { globalThis.fetch = (globalThis as any).__onlineFetch })
    await compose.getByRole('button', { name: '重新连接' }).click()
    await expect.poll(() => compose.evaluate(() => (window as any).desktop.auth.getState().then((state: any) => state.status))).toBe('authenticated')
    await compose.getByRole('button', { name: /^发布/ }).click()
    await expect(compose.getByPlaceholder('你要BB什么？')).toHaveValue('')
    const after = await request.get(server + '/api/v1/bbtalk/', { headers: { Authorization: `Bearer ${owner.access}` } })
    const post = (await after.json()).results[0]
    expect(post.attachments).toHaveLength(2)
    expect(post.attachments[0].url).toContain('/preview/')
    expect((await request.get(server + post.attachments[0].url)).status()).toBe(404)

    // Browser feed and full-size preview must both fetch private media with auth.
    await web.goto(server)
    await expect(web.locator('.bbtalk-item').first()).toContainText('立即关闭也保留的截图草稿')
    await expect.poll(() => web.locator('.bbtalk-item img').evaluateAll(images => images.some(image => (image as HTMLImageElement).naturalWidth > 0))).toBe(true)
    await web.locator('.bbtalk-item img').first().click()
    await expect.poll(() => web.locator('img.object-contain').evaluateAll(images => images.some(image => (image as HTMLImageElement).naturalWidth > 0))).toBe(true)
    await web.keyboard.press('Escape')

    const settingsAgain = application!.waitForEvent('window')
    await compose.getByRole('button', { name: '设置', exact: true }).click()
    const settings2 = await settingsAgain
    await settings2.locator('input').fill('http://127.0.0.1:18020')
    await settings2.getByRole('button', { name: '保存设置' }).click()
    await expect(settings2.getByRole('button', { name: '已保存 ✓' })).toBeVisible()
    expect(await settings2.evaluate(() => (window as any).desktop.compose.getApiUrl())).toBe('http://127.0.0.1:18020')
    expect((await settings2.evaluate(() => (window as any).desktop.auth.getState())).status).toBe('signed-out')
  } finally {
    await application?.close()
    await rm(profile, { recursive: true, force: true })
  }
})
