import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'

test('real ball overlay suspends during editing; rounded corners and moved position survive reopening', async ({}, testInfo) => {
  test.setTimeout(30_000)
  const profile = await mkdtemp(join(tmpdir(), 'chewy-window-input-'))
  const application = await electron.launch({
    executablePath: resolve('../desktop/node_modules/electron/dist/electron.exe'),
    args: [resolve('../desktop/out/main/integration.js'), '--no-sandbox'],
    env: { ...process.env, CHEWY_INTEGRATION_USER_DATA: profile, CHEWY_INTEGRATION_WITH_BALL: '1' },
  })
  try {
    await expect.poll(() => application.windows().some(page => page.url().includes('/compose/'))).toBe(true)
    const page = application.windows().find(page => page.url().includes('/compose/'))!
    const ball = application.windows().find(page => page.url().includes('/ball/'))!
    await expect(page.getByPlaceholder('你要BB什么？')).toBeVisible()
    await page.evaluate(async () => { await new Promise(resolve => setTimeout(resolve, 500)) })
    const initial = await application.evaluate(({ BrowserWindow, screen }) => {
      const compose = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('/compose/'))!
      const overlay = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('/ball/'))!
      ;(globalThis as any).__inputChanges = 0
      compose.on('resize', () => (globalThis as any).__inputChanges++)
      compose.on('move', () => (globalThis as any).__inputChanges++)
      return { bounds: compose.getBounds(), area: screen.getDisplayMatching(compose.getBounds()).workArea, overlayVisible: overlay.isVisible() }
    })
    expect(initial.overlayVisible).toBe(false)
    await ball.evaluate(() => window.desktop.ball.setIgnoreMouseEvents(true))
    expect(await application.evaluate(() => (globalThis as any).__ballForwarding)).toBe(false)
    expect(initial.bounds.x).toBe(Math.round(initial.area.x + (initial.area.width - initial.bounds.width) / 2))
    expect(Math.abs(initial.bounds.y - Math.round(initial.area.y + (initial.area.height - initial.bounds.height) / 2))).toBeLessThanOrEqual(1)
    const mouseStart = Date.now()
    for (let n = 0; n < 50; n++) await page.mouse.move(30 + (n * 17) % 360, 52 + n % 20)
    expect(Date.now() - mouseStart).toBeLessThan(4_000)
    expect(await application.evaluate(() => (globalThis as any).__inputChanges)).toBe(0)
    await page.evaluate(async () => {
      await Promise.all(Array.from(document.images).map(img => img.decode().catch(() => {})))
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    })
    const shot = await application.evaluate(async ({ BrowserWindow }) => {
      const compose = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('/compose/'))!
      const image = await compose.capturePage(undefined, { stayHidden: true, stayAwake: true })
      const pixels = image.toBitmap()
      const size = image.getSize()
      return { png: image.toPNG().toString('base64'), cornerAlpha: pixels[3], centerAlpha: pixels[((Math.floor(size.height / 2) * size.width) + Math.floor(size.width / 2)) * 4 + 3] }
    })
    expect(shot.cornerAlpha).toBe(0)
    expect(shot.centerAlpha).toBe(255)
    await writeFile(testInfo.outputPath('rounded-compose.png'), Buffer.from(shot.png, 'base64'))
    const saved = await application.evaluate(({ BrowserWindow }) => {
      const compose = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('/compose/'))!
      const before = compose.getBounds()
      const moved = { ...before, x: before.x + 40, y: before.y + 30 }
      compose.emit('will-move', {}, moved)
      compose.setBounds(moved)
      compose.emit('moved')
      const actual = compose.getBounds()
      return { x: actual.x, y: actual.y }
    })
    await page.evaluate(() => window.desktop.compose.hide())
    await expect.poll(() => application.windows().some(page => page.url().includes('/compose/'))).toBe(false)
    expect(JSON.parse(await readFile(join(profile, 'chewybbtalk.json'), 'utf8')).windows.compose).toEqual(saved)
    await ball.evaluate(() => window.desktop.compose.show())
    await expect.poll(() => application.windows().some(page => page.url().includes('/compose/'))).toBe(true)
    const reopened = application.windows().find(page => page.url().includes('/compose/'))!
    await expect(reopened.getByPlaceholder('你要BB什么？')).toBeVisible()
    await reopened.evaluate(async () => { await new Promise(resolve => setTimeout(resolve, 400)) })
    const position = await application.evaluate(({ BrowserWindow }) => {
      const { x, y } = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('/compose/'))!.getBounds()
      return { x, y }
    })
    expect(position).toEqual(saved)
  } finally {
    await application.close()
    await rm(profile, { recursive: true, force: true })
  }
})
