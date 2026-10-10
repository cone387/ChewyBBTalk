import { test, expect, type Locator } from '@playwright/test'

async function touchTarget(control: Locator) {
  const bounds = await control.boundingBox()
  expect(bounds?.height).toBeGreaterThanOrEqual(44)
  expect(bounds?.width).toBeGreaterThanOrEqual(44)
}

async function expectNeutralFocus(field: Locator) {
  await field.evaluate(element => (element as HTMLElement).blur())
  const before = await field.evaluate(element => {
    const style = getComputedStyle(element)
    const container = element.closest('.bbtalk-composer')
    return { border: style.borderColor, background: style.backgroundColor,
      containerBorder: container ? getComputedStyle(container).borderColor : null }
  })
  await field.click()
  await expect(field).toBeFocused()
  await expect(field).toHaveCSS('border-color', before.border)
  await expect(field).toHaveCSS('background-color', before.background)
  await expect(field).toHaveCSS('outline-style', 'none')
  await expect(field).toHaveCSS('box-shadow', 'none')
  if (before.containerBorder) {
    await expect(field.locator('xpath=ancestor::*[contains(@class,"bbtalk-composer")]')).toHaveCSS('border-color', before.containerBorder)
  }
}

test('form errors identify fields and controls retain usable geometry', async ({ page }, info) => {
  const username = `controls_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const password = 'control-consistency-2026'
  expect((await page.request.post('/api/v1/bbtalk/auth/register', { data: { username, password } })).status()).toBe(201)
  await page.goto('/login')
  await expectNeutralFocus(page.getByLabel('用户名', { exact: true }))
  await expectNeutralFocus(page.getByLabel('密码', { exact: true }))
  await page.getByLabel('用户名', { exact: true }).fill(username)
  await page.getByLabel('密码', { exact: true }).fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByLabel('记录内容')).toBeVisible()
  await expectNeutralFocus(page.getByRole('searchbox').filter({ visible: true }))
  await expectNeutralFocus(page.getByLabel('记录内容'))

  await page.getByLabel('记录内容').fill('控件验收 #规范 ')
  await page.getByRole('button', { name: '发布', exact: true }).click()
  const card = page.locator('[data-record-id]').first()
  await expect(card).toContainText('控件验收')
  await card.getByRole('button', { name: '更多操作' }).click()
  for (const name of ['复制链接', '置顶', '编辑', '删除']) {
    const action = card.getByRole('button', { name, exact: true })
    await touchTarget(action)
    await expect(action.locator('svg')).toHaveAttribute('stroke-width', '2')
  }
  await page.screenshot({ path: info.outputPath('menu.png') })
  await card.getByRole('button', { name: '更多操作' }).click()
  await card.getByRole('button', { name: '写评论' }).click()
  const comment = card.getByLabel('评论内容')
  await expectNeutralFocus(comment)
  await expect(comment).toHaveCSS('border-radius', '8px')
  await touchTarget(card.getByRole('button', { name: '发送', exact: true }))
  await expect(card.getByRole('button', { name: '发送', exact: true })).toBeDisabled()
  await page.screenshot({ path: info.outputPath('comment.png') })

  await page.getByTitle('添加标签', { exact: true }).click()
  const suggestion = page.locator('.app-menu-item').filter({ hasText: '规范' })
  await touchTarget(suggestion)
  await suggestion.click()
  await touchTarget(page.getByRole('button', { name: '移除标签：规范', exact: true }))
  await page.getByLabel('记录内容').fill('')

  await expect(page.getByRole('button', { name: /筛选与排序/ })).toHaveCount(0)
  await expect(page.getByRole('region', { name: '当前筛选条件' })).toHaveCount(0)

  await page.goto('/settings/account')
  await expect(page.getByLabel('显示名称', { exact: true })).toBeVisible()
  for (const field of await page.locator('main input, main textarea').all()) await expectNeutralFocus(field)

  await page.goto('/settings/storage/s3')
  const trigger = page.getByRole('button', { name: '新建配置' })
  await trigger.click()
  const s3 = page.getByRole('dialog', { name: '创建 S3 配置' })
  await expect(s3).toBeVisible()
  for (const field of await s3.locator('input:not([type="checkbox"])').all()) await expectNeutralFocus(field)
  await s3.getByRole('button', { name: '保存', exact: true }).click()
  const configName = s3.getByLabel('配置名称 *', { exact: true })
  await expect(configName).toBeFocused()
  await expect(configName).toHaveAccessibleDescription('请输入配置名称')
  await expect(configName).toHaveCSS('border-color', 'rgb(220, 38, 38)')
  await expect(configName).toHaveCSS('box-shadow', 'none')
  await expect(configName).toHaveAttribute('required', '')
  await page.screenshot({ path: info.outputPath('s3-field-errors.png') })
  await configName.fill('校验示例')
  await expect(configName).not.toHaveAttribute('aria-invalid', 'true')
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()

  // Exercise the populated state too: all four actions must fit a phone card.
  await trigger.click()
  await s3.getByLabel('配置名称 *', { exact: true }).fill('控件验证存储')
  await s3.getByLabel('Access Key ID *', { exact: true }).fill('test-access')
  await s3.getByLabel('Secret Access Key *', { exact: true }).fill('test-secret')
  await s3.getByLabel('Bucket 名称 *', { exact: true }).fill('test-bucket')
  await s3.getByLabel('端点 URL', { exact: true }).fill('invalid-endpoint')
  await s3.getByRole('button', { name: '保存', exact: true }).click()
  await expect(s3.getByLabel('端点 URL', { exact: true })).toHaveAccessibleDescription('请输入完整的 http:// 或 https:// 端点 URL')
  await s3.getByLabel('端点 URL', { exact: true }).fill('https://storage.example.invalid')
  await s3.getByRole('button', { name: '保存', exact: true }).click()
  await expect(s3).toHaveCount(0)
  for (const name of ['激活', '测试', '编辑', '删除']) {
    await touchTarget(page.getByRole('button', { name, exact: true }))
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('s3-populated.png') })

  await page.goto('/settings/privacy')
  const slider = page.getByRole('slider', { name: '防窥超时时长' })
  await touchTarget(slider)
  const checkbox = page.getByRole('checkbox')
  const label = checkbox.locator('xpath=ancestor::label')
  await touchTarget(label)
  await slider.focus()
  const before = Number(await slider.inputValue())
  await page.keyboard.press('ArrowRight')
  await expect(slider).toHaveValue(String(before + 1))
  await page.keyboard.press('Tab')
  await expect(checkbox).toBeFocused()
  await page.screenshot({ path: info.outputPath('privacy-controls.png') })
  await checkbox.check()
  await page.goto('/')
  await page.getByRole('button', { name: '立即锁定记录' }).click()
  await expect(page).toHaveURL(/\/locked$/)
  await expectNeutralFocus(page.getByLabel('解锁密码', { exact: true }))
})
