import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'

for (const scale of [1, 1.25, 1.5]) {
test(`compose size stays stable at ${scale * 100}% scaling`, async () => {
  const profile = await mkdtemp(join(tmpdir(), 'chewy-window-sizing-'))
  const application = await electron.launch({
    executablePath: resolve('../desktop/node_modules/electron/dist/electron.exe'),
    args: [resolve('../desktop/out/main/integration.js'), '--no-sandbox', `--force-device-scale-factor=${scale}`],
    env: { ...process.env, CHEWY_INTEGRATION_USER_DATA: profile },
  })
  try {
    const page = await application.firstWindow()
    const textarea = page.getByPlaceholder('你要BB什么？')
    await expect(textarea).toBeVisible()
    await application.evaluate(async ({ BrowserWindow }) => {
      await new Promise(resolve => setTimeout(resolve, 500))
      const window = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('/compose/'))!
      ;(globalThis as any).__resizeBounds = []
      window.on('resize', () => (globalThis as any).__resizeBounds.push(window.getBounds()))
    })
    for (const text of ['很多行内容\n'.repeat(24), '短内容']) {
      await application.evaluate(() => { (globalThis as any).__resizeBounds = [] })
      await textarea.fill(text)
      const changes = await application.evaluate(async () => {
        await new Promise(resolve => setTimeout(resolve, 1000))
        return (globalThis as any).__resizeBounds as Array<{ height: number }>
      })
      expect(changes.length, JSON.stringify(changes)).toBeLessThanOrEqual(2)
      expect(changes.length).toBeGreaterThan(0)
      const previous = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('/compose/'))!.getBounds())
      expect(previous.width).toBe(440)
      await page.evaluate(async () => { await new Promise(resolve => setTimeout(resolve, 500)) })
      expect(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('/compose/'))!.getBounds())).toEqual(previous)
    }
  } finally {
    await application.close()
    await rm(profile, { recursive: true, force: true })
  }
})
}
