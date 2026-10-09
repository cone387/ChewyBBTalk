import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { createRequire } from 'node:module'
const executablePath = createRequire(import.meta.url)('../../desktop/node_modules/electron') as string

test('opens ready to type and restores a docked ball without replaying hover animation', async () => {
  test.setTimeout(40_000)
  const profile = await mkdtemp(join(tmpdir(), 'chewy-focus-ball-'))
  const application = await electron.launch({
    executablePath,
    args: [resolve('../desktop/out/main/integration.js'), '--no-sandbox'],
    env: { ...process.env, CHEWY_INTEGRATION_USER_DATA: profile, CHEWY_INTEGRATION_WITH_BALL: '1', CHEWY_INTEGRATION_FOCUS: '1' },
  })
  try {
    await expect.poll(() => application.windows().some(page => page.url().includes('/compose/'))).toBe(true)
    let compose = application.windows().find(page => page.url().includes('/compose/'))!
    const ball = application.windows().find(page => page.url().includes('/ball/'))!
    await expect(compose.getByPlaceholder('你要BB什么？')).toBeFocused()
    await compose.keyboard.type('ready to type')
    await expect(compose.getByPlaceholder('你要BB什么？')).toHaveValue('ready to type')
    await compose.getByRole('button', { name: '固定置顶' }).focus()
    await compose.evaluate(() => window.desktop.compose.show())
    await expect(compose.getByPlaceholder('你要BB什么？')).toBeFocused()
    await compose.evaluate(() => window.desktop.compose.hide())
    await expect.poll(() => application.windows().some(page => page.url().includes('/compose/'))).toBe(false)

    const icon = ball.getByRole('button', { name: 'ChewyBBTalk', exact: true })
    const box = (await icon.boundingBox())!
    const y = Math.round(box.y + box.height / 2)
    await ball.mouse.move(box.x + 28, y)
    await ball.mouse.down()
    await ball.mouse.move(10, y, { steps: 10 })
    await ball.mouse.up()
    await expect(icon).toHaveClass(/snapped/)
    await ball.mouse.move(5, y)
    await ball.mouse.move(6, y)
    const openViaBall = async () => {
      await icon.click({ force: true, position: { x: 32, y: 28 } })
      await expect.poll(() => application.windows().some(page => page.url().includes('/compose/'))).toBe(true)
      const page = application.windows().find(p => p.url().includes('/compose/'))!
      await expect(page.getByPlaceholder('你要BB什么？')).toBeFocused()
      return page
    }
    // Some CI runner images close the freshly reopened compose shortly after
    // the ball click; tolerate that by reopening before pinning down state.
    for (let attempt = 0; ; attempt++) {
      compose = await openViaBall()
      await application.waitForTimeout(1_500)
      if (application.windows().includes(compose)) break
      if (attempt >= 2) throw new Error('compose kept closing after the ball reopen')
    }
    await application.evaluate(({ BrowserWindow }) => {
      const overlay = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('/ball/'))!
      ;(globalThis as any).__ballShowCount = 0
      overlay.on('show', () => (globalThis as any).__ballShowCount++)
    })
    const suspended = await application.evaluate(({ BrowserWindow }) => {
      const overlay = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('/ball/'))!
      return process.platform === 'linux' ? !overlay.isVisible() : overlay.getOpacity() === 0
    })
    expect(suspended).toBe(true)
    await expect(icon).not.toHaveClass(/animating/)
    const hiddenTransform = await icon.evaluate(node => getComputedStyle(node).transform)
    await compose.evaluate(() => window.desktop.compose.hide())
    await expect.poll(() => application.windows().some(page => page.url().includes('/compose/'))).toBe(false)
    const transforms = await ball.evaluate(async () => {
      const icon = document.querySelector('.ball')!
      const values = []
      for (let i = 0; i < 45; i++) {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
        values.push(getComputedStyle(icon).transform)
      }
      return values
    })
    expect([...new Set(transforms)]).toEqual([hiddenTransform])
    expect(await application.evaluate(() => (globalThis as any).__ballShowCount)).toBe(process.platform === 'linux' ? 1 : 0)
    await expect(icon).not.toHaveClass(/animating/)
  } finally {
    await application.close()
    await rm(profile, { recursive: true, force: true })
  }
})
