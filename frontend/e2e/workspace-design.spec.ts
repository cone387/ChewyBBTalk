import { test, expect } from '@playwright/test'

test('workspace navigation stays consistent and S3 uses an accessible shared dialog', async ({ page }, info) => {
  const username = `workspace_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const password = 'workspace-design-2026'
  expect((await page.request.post('/api/v1/bbtalk/auth/register', {
    data: { username, password, display_name: '林间' },
  })).status()).toBe(201)
  await page.goto('/login')
  await page.getByLabel('用户名', { exact: true }).fill(username)
  await page.getByLabel('密码', { exact: true }).fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByLabel('记录内容')).toBeVisible()
  await page.getByLabel('记录内容').focus()
  await expect(page.getByLabel('记录内容')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  for (const content of [
    '把零散的想法记下来。\n\n走路时想到的一个点子、今天读到的一句话，都值得留在这里。 #日常 ',
    '周五，给自己留一点空白。\n\n先把手上的事做好，再慢慢整理下一步。 #想法 ',
    '读书摘记｜把注意力留给重要的事\n\n> 记录的意义，不只是保存过去，也是在看清自己。\n\n读到这里停了一下。下周试着少开几个窗口，一次只做一件事。 #阅读 ',
    '周末散步，发现街角开了一家新的面包店。\n\n买了一只刚出炉的可颂，在公园长椅上坐了半小时。没有特别的计划，反而记住了很多小事。 #日常 #生活 ',
  ]) {
    await page.getByLabel('记录内容').fill(content)
    await page.getByRole('button', { name: '发布', exact: true }).click()
    await expect(page.getByLabel('记录内容')).toHaveValue('')
  }
  await expect(page.locator('.bbtalk-item')).toHaveCount(4)
  await page.screenshot({ path: info.outputPath('workspace.png'), fullPage: true })
  const originalViewport = page.viewportSize()!
  await page.setViewportSize({ width: originalViewport.width, height: 600 })
  // Scrolling must not collapse the composer and change the scrollbar geometry.
  const scrollGeometry = await page.locator('.feed-scroll').evaluate(async el => {
    const initialHeight = el.scrollHeight
    const samples: { height: number; top: number; target: number }[] = []
    for (const target of [120, 220, 160, 20]) {
      el.scrollTop = target
      const end = performance.now() + 400
      while (performance.now() < end) {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
        samples.push({ height: el.scrollHeight, top: el.scrollTop, target })
      }
    }
    el.scrollTop = 0
    return { initialHeight, samples }
  })
  for (const sample of scrollGeometry.samples) {
    expect(sample.height).toBe(scrollGeometry.initialHeight)
    expect(sample.top).toBeCloseTo(sample.target, 0)
  }
  await expect(page.locator('.composer-toolbar')).toHaveCSS('border-top-width', '0px')
  await page.setViewportSize(originalViewport)
  const sidebar = page.getByRole('complementary', { name: '桌面侧栏' })
  if (info.project.name === 'desktop') await sidebar.getByRole('button', { name: '账户与设置' }).click()
  for (const [label, path, title] of [
    ['设置', '/settings', '设置'], ['隐私', '/settings/privacy', '防窥设置'],
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
