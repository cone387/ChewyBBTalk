import { test, expect } from '@playwright/test'

test('a delayed single image keeps its reserved height while scrolling', async ({ page }) => {
  let release!: () => void
  const imageReady = new Promise<void>(resolve => { release = resolve })
  await page.route('**/scroll-image.svg', async route => {
    await imageReady
    await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><rect width="900" height="1200" fill="steelblue"/></svg>' })
  })
  await page.route('**/api/v1/bbtalk/public?*', route => route.fulfill({ json: {
    total: 2, total_count: 2, page: 1, page_size: 20, has_more: false,
    items: [
      { uid: 'photo', content: 'Delayed photo', visibility: 'public', tags: [], create_time: '2026-01-01T00:00:00Z', update_time: '2026-01-01T00:00:00Z', comment_count: 0, comment_preview: [], attachments: [{ uid: 'picture', type: 'image', url: '/scroll-image.svg', filename: 'scroll-image.svg' }] },
      { uid: 'following', content: 'Following record', visibility: 'public', tags: [], create_time: '2026-01-01T00:00:00Z', update_time: '2026-01-01T00:00:00Z', comment_count: 0, comment_preview: [], attachments: [] },
    ],
  } }))
  try {
    await page.goto('/public')
    const card = page.locator('[data-record-id="photo"]')
    await expect(card).toBeVisible()
    const before = await card.boundingBox()
    release()
    const image = card.getByRole('button', { name: 'scroll-image.svg', exact: true })
    await expect(image).toBeVisible()
    await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(900)
    const after = await card.boundingBox()
    expect(Math.abs(after!.height - before!.height)).toBeLessThanOrEqual(1)
  } finally { release() }
})
