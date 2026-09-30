import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join, dirname, basename } from 'node:path'
import { createRequire } from 'node:module'
const executablePath = createRequire(import.meta.url)('../../desktop/node_modules/electron') as string

async function removeSizingProfile(profile: string) {
  const target = resolve(profile)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('chewy-window-sizing-')) {
    throw new Error('Unexpected test profile path')
  }
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}

for (const scale of [1, 1.25, 1.5]) {
test(`compose size stays stable at ${scale * 100}% scaling`, async () => {
  const profile = await mkdtemp(join(tmpdir(), 'chewy-window-sizing-'))
  const application = await electron.launch({
    executablePath,
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
      // Conversion through physical pixels can round fractional desktop scales by one DIP.
      expect(Math.abs(previous.width - 440)).toBeLessThanOrEqual(1)
      await page.evaluate(async () => { await new Promise(resolve => setTimeout(resolve, 500)) })
      expect(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('/compose/'))!.getBounds())).toEqual(previous)
    }
  } finally {
    await application.close()
    await removeSizingProfile(profile)
  }
})
}
