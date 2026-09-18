import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'

test('update settings show development guard, download progress and install readiness', async ({}, testInfo) => {
  const profile = await mkdtemp(join(tmpdir(), 'chewy-update-ui-'))
  const application = await electron.launch({
    executablePath: resolve('../desktop/node_modules/electron/dist/electron.exe'),
    args: [resolve('../desktop/out/main/integration.js'), '--no-sandbox'],
    env: { ...process.env, CHEWY_INTEGRATION_USER_DATA: profile },
  })
  try {
    const compose = await application.firstWindow()
    const opened = application.waitForEvent('window')
    await compose.getByRole('button', { name: '设置', exact: true }).click()
    const settings = await opened
    await settings.getByRole('button', { name: '关于', exact: true }).click()
    await expect(settings.getByRole('status')).toContainText('开发模式不检查更新')
    await expect(settings.getByRole('button', { name: '检查更新', exact: true })).toBeDisabled()
    await application.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('/settings/'))!
      window.webContents.send('updates:changed', { status: 'downloading', version: '0.3.0', percent: 42 })
    })
    await expect(settings.getByRole('progressbar')).toHaveAttribute('value', '42')
    await expect(settings.getByRole('status')).toContainText('42%')
    await application.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('/settings/'))!
      window.webContents.send('updates:changed', { status: 'downloaded', version: '0.3.0' })
    })
    await expect(settings.getByRole('button', { name: '保存草稿并重启安装' })).toBeEnabled()
    await settings.evaluate(async () => {
      await Promise.all(Array.from(document.images).map(image => image.decode().catch(() => {})))
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    })
    const screenshot = await application.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('/settings/'))!
      return (await window.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG().toString('base64')
    })
    await writeFile(testInfo.outputPath('update-settings.png'), Buffer.from(screenshot, 'base64'))
  } finally {
    await application.close()
    await rm(profile, { recursive: true, force: true })
  }
})
