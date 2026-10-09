import { test, expect } from '@playwright/test'

test('workspace navigation stays consistent and S3 uses an accessible shared dialog', async ({ page }, info) => {
  const username = `workspace_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const password = 'workspace-design-2026'
  expect((await page.request.post('/api/v1/bbtalk/auth/register/', {
    data: { username, password, display_name: '林间' },
  })).status()).toBe(201)
  await page.goto('/login')
  await page.getByLabel('用户名', { exact: true }).fill(username)
  await page.getByLabel('密码', { exact: true }).fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByLabel('记录内容')).toBeVisible()
  for (const content of [
    '把零散的想法记下来。\n\n走路时想到的一个点子、今天读到的一句话，都值得留在这里。 #日常 ',
    '周五，给自己留一点空白。\n\n先把手上的事做好，再慢慢整理下一步。 #想法 ',
  ]) {
    await page.getByLabel('记录内容').fill(content)
    await page.getByRole('button', { name: '发布', exact: true }).click()
    await expect(page.getByLabel('记录内容')).toHaveValue('')
  }
  await expect(page.locator('.bbtalk-item')).toHaveCount(2)
  await page.screenshot({ path: info.outputPath('workspace.png'), fullPage: true })
  const sidebar = page.getByRole('complementary', { name: '桌面侧栏' })
  for (const [label, path, title] of [
    ['账户', '/settings', '设置'], ['隐私', '/settings/privacy', '防窥设置'],
    ['存储', '/settings/storage', '存储设置'], ['数据', '/settings/data', '数据管理'],
    ['状态', '/settings/status', '运行状态'],
  ]) {
    if (info.project.name === 'desktop') {
      await sidebar.getByRole('button', { name: label, exact: true }).click()
      await expect(sidebar.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-current', 'page')
    } else await page.goto(path)
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.goto('/settings/storage/s3')
  await page.getByRole('button', { name: '新建配置', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '创建 S3 配置' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('配置名称', { exact: false }).fill('工作资料')
  await dialog.getByLabel('Access Key ID', { exact: false }).fill('test-key')
  await expect(dialog.getByLabel('Secret Access Key', { exact: false })).toHaveAttribute('type', 'password')
  await page.screenshot({ path: info.outputPath('storage-dialog.png'), fullPage: true })
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: '新建配置', exact: true })).toBeFocused()
})
