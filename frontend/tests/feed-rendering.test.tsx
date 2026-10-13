import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import BBTalkPage from '../src/pages/BBTalkPage'
import MarkdownRenderer from '../src/components/MarkdownRenderer'
import bbtalk from '../src/store/slices/bbtalkSlice'
import tag from '../src/store/slices/tagSlice'

const api = vi.hoisted(() => ({ getBBTalks: vi.fn(), getTags: vi.fn() }))
vi.mock('../src/services/api', () => ({ bbtalkApi: api, tagApi: api }))
vi.mock('../src/services/auth', () => ({ getCurrentUser: () => ({ id: 1, username: 'reader' }) }))
vi.mock('../src/components/BBTalkEditor', () => ({ default: () => <div>Composer</div> }))
vi.mock('../src/components/MarkdownRenderer', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/components/MarkdownRenderer')>()
  return { ...actual, default: vi.fn(actual.default) }
})

const records = Array.from({ length: 20 }, (_, index) => ({
  id: `row-${index}`, content: `Record ${index}`, tags: [], attachments: [],
  visibility: 'private', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  commentCount: 0, commentPreview: [],
}))

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  localStorage.setItem('privacy_enabled', 'false')
  api.getTags.mockResolvedValue([])
  api.getBBTalks.mockResolvedValue({ items: records, has_more: true, totalCount: 21 })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

async function feed() {
  const store = configureStore({ reducer: { bbtalk, tag } })
  render(<Provider store={store}><MemoryRouter><BBTalkPage /></MemoryRouter></Provider>)
  await screen.findByText('Record 19')
  const container = screen.getByRole('main')
  Object.defineProperties(container, {
    scrollHeight: { value: 6000, configurable: true },
    clientHeight: { value: 800, configurable: true },
    scrollTop: { value: 500, writable: true, configurable: true },
  })
  vi.mocked(MarkdownRenderer).mockClear()
  return container
}

it('does not reparse existing Markdown when scrolling reveals the back-to-top button', async () => {
  const container = await feed()
  fireEvent.scroll(container)
  await screen.findByTitle('回到顶部')
  expect(MarkdownRenderer).not.toHaveBeenCalled()
})

it('parses only appended records while loading another page', async () => {
  const container = await feed()
  let finish!: (value: unknown) => void
  api.getBBTalks.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  container.scrollTop = 5190
  fireEvent.scroll(container)
  await waitFor(() => expect(api.getBBTalks).toHaveBeenCalledTimes(2))
  await act(async () => { finish({ items: [{ ...records[0], id: 'row-20', content: 'Record 20' }], has_more: false, totalCount: 21 }) })
  await screen.findByText('Record 20')
  expect(vi.mocked(MarkdownRenderer).mock.calls.map(([props]) => props.content)).toEqual(['Record 20'])
})

it('deletes and restores an appended card at its current position', async () => {
  const container = await feed()
  api.getBBTalks.mockResolvedValueOnce({ items: [{ ...records[0], id: 'row-20', content: 'Record 20' }], has_more: false, totalCount: 21 })
  container.scrollTop = 5190
  fireEvent.scroll(container)
  const last = await screen.findByText('Record 20')
  const card = last.closest('[data-record-id]') as HTMLElement
  fireEvent.click(within(card).getByRole('button', { name: '更多操作' }))
  fireEvent.click(within(card).getByRole('button', { name: '删除', exact: true }))
  expect(screen.queryByText('Record 20')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /撤销/ }))
  await screen.findByText('Record 20')
  expect(Array.from(container.querySelectorAll('[data-record-id]')).map(element => element.getAttribute('data-record-id')))
    .toEqual([...records.map(record => record.id), 'row-20'])
})
