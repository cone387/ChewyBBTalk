import { test, expect } from '@playwright/test'

test('desktop keeps its sidebar and authenticated login visits return to the feed', async ({ page }, info) => {
  const username = `layout_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const password = 'layout-regression-2026'
  expect((await page.request.post('/api/v1/bbtalk/auth/register/', { data: { username, password } })).status()).toBe(201)
  await page.addInitScript(() => localStorage.setItem('show_privacy_countdown', 'true'))
  await page.goto('/login')
  await page.getByLabel('用户名', { exact: true }).fill(username)
  await page.getByLabel('密码', { exact: true }).fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByLabel('记录内容')).toBeVisible()
  await page.goto('/login')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByLabel('记录内容')).toBeVisible()
  await expect(page.getByRole('heading', { name: '登录 BBTalk' })).toHaveCount(0)

  await page.route('**/api/v1/bbtalk/tags/', route => route.fulfill({ json: Array.from({ length: 40 }, (_, index) => ({
    uid: `layout-tag-${index}`, name: index === 0 ? '一个用于验证布局的超长标签名称' : `日常记录 ${index + 1}`,
    color: '#2563eb', sort_order: index, bbtalk_count: index + 1,
  })) }))
  await page.reload()

  for (const width of [1440, 1024, 768, 375]) {
    await page.setViewportSize({ width, height: 900 })
    const sidebar = page.getByRole('complementary', { name: '桌面侧栏' })
    if (width >= 1024) {
      await expect(sidebar).toBeVisible()
      await expect(sidebar.getByRole('searchbox')).toBeVisible()
      await expect(sidebar.getByRole('button', { name: '账户与设置' })).toBeVisible()
      const editor = await page.getByLabel('记录内容').boundingBox()
      const side = await sidebar.boundingBox()
      const tags = sidebar.getByRole('region', { name: '标签列表' })
      await expect(tags).toBeVisible()
      const tagBox = await tags.boundingBox()
      expect(tagBox!.x + tagBox!.width).toBeLessThan(editor!.x)
      expect(side!.width).toBe(256)
      const feedBounds = await page.locator('.feed-scroll').boundingBox()
      expect(feedBounds!.x + feedBounds!.width).toBeCloseTo(width, 0)
      expect(tagBox!.height).toBeGreaterThan(600)
      await expect(tags.locator('.tag-list-row')).toHaveCount(40)
      const allIcon = await tags.locator('.tag-all-button .tag-symbol').boundingBox()
      const firstIcon = await tags.locator('.tag-list-row .tag-symbol').first().boundingBox()
      const allCount = await tags.locator('.tag-all-button .tag-count').boundingBox()
      const firstCount = await tags.locator('.tag-list-row .tag-count').first().boundingBox()
      expect(firstIcon!.x).toBeCloseTo(allIcon!.x, 0)
      expect(firstCount!.x + firstCount!.width).toBeCloseTo(allCount!.x + allCount!.width, 0)
      const visibleRows = await tags.locator('.tag-list-row').evaluateAll(rows => rows.filter(row => {
        const bounds = row.getBoundingClientRect()
        return bounds.top >= 0 && bounds.bottom <= innerHeight
      }).length)
      // Touch devices keep taller targets within the restored inset sidebar.
      expect(visibleRows).toBeGreaterThanOrEqual(12)
      const scroll = sidebar.locator('.feed-tags-scroll')
      expect(await scroll.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
      await expect(scroll.getByRole('searchbox')).toBeVisible()
      await expect(sidebar.locator('.classic-feed-account')).toHaveCSS('border-top-width', '0px')
      const searchBefore = await sidebar.getByRole('searchbox').boundingBox()
      const accountBefore = await sidebar.getByRole('button', { name: '账户与设置' }).boundingBox()
      await scroll.evaluate(el => { el.scrollTop = 100 })
      const searchAfter = await sidebar.getByRole('searchbox').boundingBox()
      const accountAfter = await sidebar.getByRole('button', { name: '账户与设置' }).boundingBox()
      expect(searchBefore!.y - searchAfter!.y).toBeCloseTo(100, 0)
      expect(accountAfter!.y).toBeCloseTo(accountBefore!.y, 0)
      await tags.locator('.tag-list-row').last().getByRole('button').first().focus()
      await expect(tags.locator('.tag-list-row').last()).toBeInViewport()
      await page.getByLabel('记录内容').focus()
      await scroll.evaluate(el => { el.scrollTop = 0 })
      expect(editor!.x).toBeGreaterThan(side!.x + side!.width)
      if (width === 1440) expect(editor!.width).toBeGreaterThan(700)
      await expect(page.getByRole('navigation', { name: '移动导航' })).toBeHidden()
    } else {
      await expect(sidebar).toBeHidden()
      await expect(page.getByRole('region', { name: '标签列表' })).toBeHidden()
      await expect(page.getByRole('navigation', { name: '移动导航' })).toBeVisible()
    }
    const countdown = page.getByRole('button', { name: '立即锁定记录' })
    await expect(countdown).toBeVisible()
    const lock = await countdown.boundingBox()
    await expect(countdown).toHaveCount(1)
    await expect(countdown).toHaveCSS('position', 'fixed')
    expect(width - lock!.x - lock!.width).toBeCloseTo(width >= 1024 ? 32 : 16, 0)
    expect(900 - lock!.y - lock!.height).toBeCloseTo(width >= 1024 ? 32 : 80, 0)
    const tools = page.locator('.composer-tools > button')
    await expect(tools).toHaveCount(5)
    for (const tool of await tools.all()) {
      const button = (await tool.boundingBox())!
      const icon = (await tool.locator('svg').boundingBox())!
      expect(Math.abs(button.x + button.width / 2 - icon.x - icon.width / 2)).toBeLessThan(1)
      expect(Math.abs(button.y + button.height / 2 - icon.y - icon.height / 2)).toBeLessThan(1)
    }
    await expect(sidebar.getByRole('button', { name: '立即锁定记录' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /筛选与排序/ })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`feed-${width}.png`) })
  }
})


test('settings keep a desktop workspace and adapt only when the window narrows', async ({ page }, info) => {
  // This case navigates every settings section across five successive resizes.
  test.setTimeout(90_000)
  const username = 'settings_layout_' + Date.now()
  const password = 'settings-layout-2026'
  expect((await page.request.post('/api/v1/bbtalk/auth/register/', { data: { username, password } })).status()).toBe(201)
  await page.goto('/login')
  await page.getByLabel('用户名', { exact: true }).fill(username)
  await page.getByLabel('密码', { exact: true }).fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByLabel('记录内容')).toBeVisible()
  for (const width of [1440, 1024, 768, 375, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/settings')
    const expectNavigation = async () => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      if (width >= 1024) {
        await expect(page.locator('.workspace-topbar')).toBeHidden()
        await expect(page.getByRole('button', { name: /^返回/ })).toHaveCount(0)
        expect((await page.getByRole('heading', { level: 1 }).boundingBox())!.y).toBeLessThan(80)
      } else {
        await expect(page.locator('.workspace-topbar')).toBeVisible()
        await expect(page.getByRole('button', { name: /^返回/ })).toBeVisible()
      }
    }
    await expectNavigation()
    await page.getByRole('button', { name: /账户设置 显示名称/ }).click()
    const sidebar = page.getByRole('complementary', { name: '桌面侧栏' })
    const profile = page.locator('form').filter({ has: page.getByRole('heading', { name: '个人资料' }) })
    const passwordForm = page.locator('form').filter({ has: page.getByRole('heading', { name: '修改密码', exact: true }) })
    await expect(profile).toBeVisible()
    await expectNavigation()
    const a = await profile.boundingBox()
    const b = await passwordForm.boundingBox()
    if (width >= 1024) {
      await expect(sidebar).toBeVisible()
      expect(a!.y).toBeCloseTo(b!.y, 0)
      expect(b!.x).toBeGreaterThanOrEqual(a!.x + a!.width)
    } else {
      await expect(sidebar).toBeHidden()
      expect(b!.y).toBeGreaterThanOrEqual(a!.y + a!.height)
    }
    await page.screenshot({ path: info.outputPath('account-' + width + '.png') })
    for (const [label, path, title] of [
      ['隐私', '/settings/privacy', '防窥设置'], ['存储', '/settings/storage', '存储设置'],
      ['数据', '/settings/data', '数据管理'], ['状态', '/settings/status', '运行状态'],
    ]) {
      if (width >= 1024) await sidebar.getByRole('button', { name: label, exact: true }).click()
      else await page.goto(path)
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
      await expectNavigation()
      if (width >= 1024) await expect(sidebar).toBeVisible()
      else await expect(sidebar).toBeHidden()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    await page.goto('/settings/storage')
    await page.getByRole('button', { name: /S3 兼容存储/ }).click()
    await expect(page.getByRole('heading', { name: 'S3 配置管理' })).toBeVisible()
    await expectNavigation()
    if (width >= 1024) await sidebar.getByRole('button', { name: '存储', exact: true }).click()
    else await page.getByRole('button', { name: '返回存储设置' }).click()
    await expect(page.getByRole('heading', { name: '存储设置', exact: true })).toBeVisible()
    if (width >= 1024) await sidebar.getByRole('button', { name: '设置', exact: true }).click()
    else await page.getByRole('button', { name: '返回设置', exact: true }).click()
    await expect(page).toHaveURL(/\/settings$/)
  }
})
