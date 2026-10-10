import { readFile, writeFile } from 'node:fs/promises'
import { test, expect, type Page, type Request, type TestInfo } from '@playwright/test'

const BASE = '/api/v1/bbtalk'
const password = 'request-budget-regression-2026'
test.beforeEach(() => {
  test.skip(test.info().config.metadata.productionRequestBudget !== true, 'Requires the production request-budget config')
})
type RequestEvidence = { method: string; path: string; ms: number; status?: number; failure?: string; results?: number }
type Scenario = { name: string; expected: number | [number, number]; requests: RequestEvidence[] }

class BudgetRecorder {
  scenarios: Scenario[] = []
  rows: RequestEvidence[] = []
  byRequest = new Map<Request, RequestEvidence>()
  started = Date.now()

  constructor(private page: Page, private info: TestInfo) {
    page.on('request', request => {
      const url = new URL(request.url())
      if (!url.pathname.startsWith('/api/v1/')) return
      const row = { method: request.method(), path: url.pathname + url.search, ms: Date.now() - this.started }
      this.rows.push(row)
      this.byRequest.set(request, row)
    })
    page.on('response', async response => {
      const row = this.byRequest.get(response.request())
      if (!row) return
      row.status = response.status()
      if (row.path.includes('/comments') && row.method === 'GET' && response.ok()) {
        const body = await response.json().catch(() => null)
        if (body) row.results = Array.isArray(body) ? body.length : body.results?.length
      }
    })
    page.on('requestfailed', request => {
      const row = this.byRequest.get(request)
      if (row) row.failure = request.failure()?.errorText
    })
  }

  async measure(name: string, expected: number | [number, number], action: () => Promise<unknown>, settle = 900) {
    const offset = this.rows.length
    try {
      await action()
      // Include delayed debounce/refresh requests, also in zero-request scenarios.
      await this.page.waitForTimeout(settle)
    } finally {
      this.scenarios.push({ name, expected, requests: this.rows.slice(offset) })
      await writeFile(this.info.outputPath('request-budget.json'), JSON.stringify(this.scenarios, null, 2))
    }
    const rows = this.scenarios.at(-1)!.requests
    const [min, max] = typeof expected === 'number' ? [expected, expected] : expected
    expect(rows.length, `${name}: ${JSON.stringify(rows)}`).toBeGreaterThanOrEqual(min)
    expect(rows.length, `${name}: ${JSON.stringify(rows)}`).toBeLessThanOrEqual(max)
    expect(rows.filter(row => row.status !== undefined && row.status >= 400), name).toEqual([])
    return rows
  }
}

async function createAccount(page: Page) {
  const username = `budget_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const response = await page.request.post(`${BASE}/auth/register`, { data: { username, password } })
  expect(response.status()).toBe(201)
  const session = await response.json()
  return { username, session, headers: { Authorization: `Bearer ${session.access}` } }
}

async function installSession(page: Page, session: { access: string; refresh: string; user: unknown }) {
  await page.addInitScript(value => {
    localStorage.setItem('bbtalk_access_token', value.access)
    localStorage.setItem('bbtalk_refresh_token', value.refresh)
    localStorage.setItem('bbtalk_user_info', JSON.stringify(value.user))
  }, session)
}

async function seedRecords(page: Page, headers: Record<string, string>, count = 6, comments = 1, visibility = 'private') {
  const records: { uid: string; content: string }[] = []
  for (let index = 0; index < count; index++) {
    const response = await page.request.post(BASE, { headers, data: {
      content: `record ${index}`, tags: [index % 2 ? 'B' : 'A'], visibility,
    } })
    expect(response.status()).toBe(201)
    const record = await response.json()
    records.push(record)
    for (let c = 0; c < comments; c++) {
      expect((await page.request.post(`${BASE}/${record.uid}/comments`, {
        headers, data: { content: `note ${index}-${c}` },
      })).status()).toBe(201)
    }
  }
  return records
}

const cards = (page: Page) => page.locator('[data-record-id]')
const tag = (page: Page, name: string) => page.getByRole('region', { name: '标签列表' }).getByRole('button', { name: new RegExp(`^${name}`) })
const recordCard = (page: Page, uid: string) => page.locator(`[data-record-id="${uid}"]`)

test('production login, filters, search and focus meet request budgets', async ({ page }, info) => {
  const account = await createAccount(page)
  await seedRecords(page, account.headers)
  const budget = new BudgetRecorder(page, info)
  await budget.measure('login_page', 1, () => page.goto('/login'))
  await page.getByPlaceholder('请输入用户名').fill(account.username)
  await page.getByPlaceholder('请输入密码').fill(password)
  await budget.measure('login_submit', 4, async () => {
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await expect(cards(page)).toHaveCount(6)
  })
  await budget.measure('cold_home', 3, async () => { await page.reload(); await expect(cards(page)).toHaveCount(6) })
  for (const [name, expected] of [['A', 1], ['A', 0], ['B', 1], ['A', 1], ['全部', 1]] as const) {
    await budget.measure(`tag_${name}_${budget.scenarios.length}`, expected, async () => {
      await tag(page, name).click()
      await expect(cards(page)).toHaveCount(name === '全部' ? 6 : 3)
      if (name !== '全部') await expect(tag(page, name)).toHaveAttribute('aria-pressed', 'true')
    })
  }
  await budget.measure('quick_A_B_A', 1, async () => {
    await tag(page, 'A').click(); await tag(page, 'B').click(); await tag(page, 'A').click()
    await expect(cards(page)).toHaveCount(3)
    await expect(cards(page).filter({ hasText: 'record 1' })).toHaveCount(0)
  })
  await budget.measure('return_all', 1, async () => { await tag(page, '全部').click(); await expect(cards(page)).toHaveCount(6) })
  const search = page.getByPlaceholder('搜索 BBTalk...').filter({ visible: true })
  await budget.measure('search_typing', 1, async () => {
    await search.pressSequentially('record 0', { delay: 20 })
    await expect(cards(page)).toHaveCount(1)
    await expect(cards(page)).toContainText('record 0')
  })
  await budget.measure('search_clear', 1, async () => { await search.fill(''); await expect(cards(page)).toHaveCount(6) })
  await budget.measure('focus_refresh', 2, () => page.evaluate(() => window.dispatchEvent(new Event('focus'))), 150)
  await page.waitForTimeout(350)
  await budget.measure('focus_again_after_500ms', 0, () => page.evaluate(() => window.dispatchEvent(new Event('focus'))))
  await budget.measure('focus_during_pending_tag_debounce', 2, async () => {
    await tag(page, 'B').click()
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(cards(page)).toHaveCount(3)
    await expect(cards(page).filter({ hasText: 'record 0' })).toHaveCount(0)
  })
})

test('production edit, undo and writes do not refetch comments', async ({ page }, info) => {
  const account = await createAccount(page)
  const records = await seedRecords(page, account.headers)
  await installSession(page, account.session)
  await page.goto('/')
  await expect(cards(page)).toHaveCount(6)
  await page.waitForTimeout(900)
  const budget = new BudgetRecorder(page, info)
  const card = recordCard(page, records[0].uid)
  await budget.measure('open_record_editor', 0, async () => {
    await card.getByTitle('更多', { exact: true }).click()
    await card.getByRole('button', { name: '编辑', exact: true }).click()
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeVisible()
  })
  await budget.measure('edit_cancel', 0, async () => {
    await page.getByRole('button', { name: '取消', exact: true }).click()
    await expect(card).toContainText('note 0-0')
  })
  await budget.measure('delete_undo', 0, async () => {
    await card.getByTitle('更多', { exact: true }).click()
    await card.getByRole('button', { name: '删除', exact: true }).click()
    await expect(card).toHaveCount(0)
    await page.getByRole('button', { name: '撤销', exact: true }).click()
    await expect(card).toContainText('note 0-0')
  })
  await budget.measure('save_body_same_tag', [1, 2], async () => {
    await card.getByTitle('更多', { exact: true }).click()
    await card.getByRole('button', { name: '编辑', exact: true }).click()
    await page.getByLabel('记录内容').last().fill('record 0 edited #A ')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(card).toContainText('record 0 edited')
  })
  await budget.measure('publish', [1, 2], async () => {
    await page.getByLabel('记录内容').fill('budget published #A ')
    await page.getByRole('button', { name: '发布', exact: true }).click()
    await expect(cards(page)).toHaveCount(7)
  })
  await budget.measure('pin', [1, 2], async () => {
    await card.getByTitle('更多', { exact: true }).click()
    await card.getByRole('button', { name: '置顶', exact: true }).click()
    await expect(cards(page).first()).toHaveAttribute('data-record-id', records[0].uid)
  })
  await budget.measure('delete_commit', [1, 2], async () => {
    const removed = page.waitForResponse(response => response.request().method() === 'DELETE' && response.url().includes(records[0].uid))
    await card.getByTitle('更多', { exact: true }).click()
    await card.getByRole('button', { name: '删除', exact: true }).click()
    expect((await removed).status()).toBe(204)
    await expect(cards(page)).toHaveCount(6)
  })
  expect(budget.rows.filter(row => row.method === 'GET' && row.path.includes('/comments'))).toEqual([])
})

test('production paged comments, remount cache, public and detail previews', async ({ page }, info) => {
  const account = await createAccount(page)
  const [record] = await seedRecords(page, account.headers, 1, 25, 'public')
  await installSession(page, account.session)
  const budget = new BudgetRecorder(page, info)
  await budget.measure('cold_detail', 2, async () => {
    await page.goto(`/detail/${record.uid}`)
    await expect(recordCard(page, record.uid)).toContainText('note 0-2')
  })
  await budget.measure('cold_public', 2, async () => {
    await page.goto('/public')
    await expect(recordCard(page, record.uid)).toContainText('note 0-2')
  })
  await page.goto('/')
  const card = recordCard(page, record.uid)
  await expect(card).toContainText('note 0-2')
  await page.waitForTimeout(900)
  const first = await budget.measure('expand_comments_page_1', 1, async () => {
    await card.getByRole('button', { name: '查看全部 25 条评论' }).click()
    await expect(card.getByLabel('删除评论：note 0-19', { exact: true })).toBeVisible()
  })
  expect(first[0].path).toMatch(/page=1/)
  expect(first[0].results).toBe(20)
  const second = await budget.measure('comments_page_2', 1, async () => {
    await card.getByRole('button', { name: '加载更多评论' }).click()
    await expect(card.getByLabel('删除评论：note 0-24', { exact: true })).toBeVisible()
  })
  expect(second[0].path).toMatch(/page=2/)
  expect(second[0].results).toBe(5)
  await budget.measure('reexpand_cached_comments', 0, async () => {
    await card.getByRole('button', { name: '收起评论' }).click()
    await card.getByRole('button', { name: '查看全部 25 条评论' }).click()
    await expect(card.getByLabel('删除评论：note 0-24', { exact: true })).toBeVisible()
  })
  await budget.measure('open_comment_input', 0, async () => {
    await card.getByRole('button', { name: '写评论', exact: true }).click()
    await expect(card.getByLabel('评论内容')).toBeVisible()
  })
  await budget.measure('send_comment', 1, async () => {
    await card.getByLabel('评论内容').fill('browser new comment')
    await card.getByRole('button', { name: '发送', exact: true }).click()
    await expect(card.getByLabel('删除评论：browser new comment', { exact: true })).toBeVisible()
  })
  await budget.measure('delete_comment', 1, async () => {
    await card.getByLabel('删除评论：browser new comment', { exact: true }).click()
    await page.getByRole('button', { name: '确认删除', exact: true }).click()
    await expect(card.getByLabel('删除评论：browser new comment', { exact: true })).toHaveCount(0)
  })
})

test('one hundred commented records need no per-card comment requests', async ({ page }, info) => {
  const account = await createAccount(page)
  await seedRecords(page, account.headers, 100)
  await installSession(page, account.session)
  const budget = new BudgetRecorder(page, info)
  const requests = await budget.measure('hundred_commented_records', 3, async () => {
    await page.goto('/')
    await expect(cards(page)).toHaveCount(100)
    await expect(page.getByLabel('删除评论：note 99-0', { exact: true })).toBeVisible()
  })
  expect(requests.filter(row => row.path.includes('/comments'))).toEqual([])
  await budget.measure('scroll_at_end', 0, async () => {
    await cards(page).last().scrollIntoViewIfNeeded()
    await expect(page.getByLabel('删除评论：note 0-0', { exact: true })).toBeVisible()
  })
})

test('shared authenticated images coalesce and survive tag remounts', async ({ page }, info) => {
  const account = await createAccount(page)
  const upload = await page.request.post('/api/v1/attachments/files', { headers: account.headers, multipart: {
    file: { name: 'shared.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=', 'base64') },
  } })
  expect(upload.status()).toBe(201)
  const file = await upload.json()
  for (const name of ['A', 'B']) {
    expect((await page.request.post(BASE, { headers: account.headers, data: {
      content: `image ${name}`, tags: [name], attachments: [{ uid: file.id, type: 'image', filename: 'shared.png', url: file.preview_url }],
    } })).status()).toBe(201)
  }
  await installSession(page, account.session)
  const budget = new BudgetRecorder(page, info)
  const first = await budget.measure('shared_image_cold', 4, async () => {
    await page.goto('/')
    await expect(cards(page)).toHaveCount(2)
    await expect(cards(page).locator('img[alt="shared.png"]')).toHaveCount(2)
  })
  expect(first.filter(row => row.path.startsWith('/api/v1/attachments/'))).toHaveLength(1)
  for (const name of ['A', 'B', 'A']) {
    const requests = await budget.measure(`shared_image_tag_${name}_${budget.scenarios.length}`, 1, async () => {
      await tag(page, name).click()
      await expect(cards(page)).toHaveCount(1)
      await expect(cards(page).locator('img[alt="shared.png"]')).toBeVisible()
    })
    expect(requests.filter(row => row.path.startsWith('/api/v1/attachments/'))).toEqual([])
  }
})

test('record pagination requests one next page and stops at the end', async ({ page }, info) => {
  const account = await createAccount(page)
  await seedRecords(page, account.headers, 105, 0)
  await installSession(page, account.session)
  await page.goto('/')
  await expect(cards(page)).toHaveCount(100)
  await page.waitForTimeout(900)
  const budget = new BudgetRecorder(page, info)
  const requests = await budget.measure('next_page_no_comments', 1, async () => {
    await cards(page).last().scrollIntoViewIfNeeded()
    await expect(cards(page)).toHaveCount(105)
  })
  expect(requests[0].path).toContain('page=2')
  await budget.measure('bottom_again_no_more', 0, async () => {
    await cards(page).last().scrollIntoViewIfNeeded()
    await expect(cards(page).last()).toContainText('record 0')
  })
})

test('settings, attachments, import, export and backup keep their request budgets', async ({ page }, info) => {
  const account = await createAccount(page)
  await seedRecords(page, account.headers, 1)
  await installSession(page, account.session)
  await page.goto('/')
  await expect(cards(page)).toHaveCount(1)
  await page.waitForTimeout(900)
  const budget = new BudgetRecorder(page, info)
  await budget.measure('upload_text_file', 1, async () => {
    await page.getByLabel('上传附件', { exact: true }).setInputFiles({ name: 'budget.txt', mimeType: 'text/plain', buffer: Buffer.from('request budget attachment') })
    await expect(page.getByRole('button', { name: '移除附件 budget.txt', exact: true })).toBeVisible()
  })
  await budget.measure('remove_draft_attachment', 0, async () => {
    await page.getByRole('button', { name: '移除附件 budget.txt', exact: true }).click()
    await expect(page.getByRole('button', { name: '移除附件 budget.txt', exact: true })).toHaveCount(0)
  })
  for (const [name, path, title] of [
    ['settings_storage_cold', '/settings/storage', '存储设置'],
    ['settings_s3_cold', '/settings/storage/s3', 'S3 配置管理'],
    ['settings_status_cold', '/settings/status', '运行状态'],
  ]) {
    await budget.measure(name, 2, async () => {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    })
  }
  await budget.measure('status_manual_refresh', 1, async () => {
    await page.getByRole('button', { name: '重新检查', exact: true }).click()
    await expect(page.getByRole('button', { name: '重新检查', exact: true })).toBeEnabled()
  })
  await budget.measure('settings_data_cold', 2, async () => {
    await page.goto('/settings/data')
    await expect(page.getByRole('button', { name: '创建完整备份', exact: true })).toBeEnabled()
  })
  await budget.measure('export_json', 1, async () => {
    const downloading = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出数据', exact: true }).click()
    const download = await downloading
    const data = JSON.parse(await readFile((await download.path())!, 'utf8'))
    expect(data.bbtalks).toHaveLength(1)
    expect(data.comments).toHaveLength(1)
  })
  await budget.measure('validate_import', 1, async () => {
    await page.getByLabel('选择导入文件').setInputFiles({
      name: 'budget.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
        version: '1.0', tags: [], bbtalks: [{ uid: 'budget-imported-row', content: 'imported budget record', tags: [] }], comments: [],
      })),
    })
    await expect(page.getByRole('dialog', { name: '确认导入', exact: true })).toBeVisible()
  })
  await budget.measure('confirm_import', 1, async () => {
    await page.getByRole('button', { name: '开始导入', exact: true }).click()
    await expect(page.getByRole('region', { name: '导入结果' })).toContainText('新增 1 条内容')
  })
  await budget.measure('create_backup_small', 1, async () => {
    await page.getByRole('button', { name: '创建完整备份', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: '完整备份已创建' })).toBeVisible()
  })
  await budget.measure('download_backup', 1, async () => {
    const downloading = page.waitForEvent('download')
    await page.getByRole('button', { name: /^下载备份 / }).click()
    const download = await downloading
    const data = await readFile((await download.path())!)
    expect(data.subarray(0, 2).toString()).toBe('PK')
  })
  await page.goto('/settings/account')
  await expect(page.getByLabel('显示名称', { exact: true })).toBeVisible()
  await page.waitForTimeout(900)
  await budget.measure('save_profile', 1, async () => {
    await page.getByLabel('显示名称', { exact: true }).fill('Budget Owner')
    await page.getByRole('button', { name: '保存资料', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('账户资料已保存')
  })
})

test('comment writes preserve the selected in-flight feed query', async ({ page }, info) => {
  const account = await createAccount(page)
  const records = await seedRecords(page, account.headers)
  await installSession(page, account.session)
  await page.goto('/')
  await expect(cards(page)).toHaveCount(6)
  await page.waitForTimeout(900)
  const card = recordCard(page, records[0].uid)
  await card.getByRole('button', { name: '写评论', exact: true }).click()
  await card.getByLabel('评论内容').fill('comment during tag change')
  const isTagB = (url: string) => new URL(url).searchParams.getAll('tags').includes('B')
  await page.route('**/api/v1/bbtalk?*', async route => {
    if (isTagB(route.request().url())) await new Promise(resolve => setTimeout(resolve, 700))
    await route.continue()
  })
  const budget = new BudgetRecorder(page, info)
  try {
    await budget.measure('comment_during_inflight_tag_change', 2, async () => {
      const requested = page.waitForRequest(request => isTagB(request.url()))
      await tag(page, 'B').click()
      await requested
      await card.getByRole('button', { name: '发送', exact: true }).click()
      await expect(cards(page)).toHaveCount(3)
      await expect(tag(page, 'B')).toHaveAttribute('aria-pressed', 'true')
      await expect(card).toHaveCount(0)
    })
    expect(budget.rows.filter(row => row.failure)).toEqual([])
  } finally {
    await page.unroute('**/api/v1/bbtalk?*')
  }
})
