import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { usePersistentDraft } from '../src/hooks/usePersistentDraft'
import { draftKey, readDraft, writeDraft, type DraftData, type DraftRecord } from '../src/services/drafts'

vi.mock('../src/services/drafts', async importOriginal => ({ ...await importOriginal<object>(), readDraft: vi.fn(), writeDraft: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
const empty: DraftData = { content: '', tags: [], visibility: 'private', attachments: [], uploads: [], location: null }

it('normalizes server paths while isolating accounts and editing records', () => {
  expect(draftKey('https://a.test/api/', 1)).toBe(draftKey('https://a.test/api', 1))
  const keys = [draftKey('https://a.test', 1), draftKey('https://b.test', 1), draftKey('https://a.test', 2), draftKey('https://a.test', 1, 1), draftKey('https://a.test', 1, 2)]
  expect(new Set(keys).size).toBe(5)
})

it('flushes the last edit on unmount before the debounce fires', async () => {
  vi.mocked(readDraft).mockResolvedValue(undefined)
  vi.mocked(writeDraft).mockResolvedValue({ revision: 'one', updatedAt: 1, data: empty })
  const { result, rerender, unmount } = renderHook(({ data }) => usePersistentDraft('scope', data, vi.fn()), { initialProps: { data: empty } })
  await waitFor(() => expect(result.current.loaded).toBe(true))
  rerender({ data: { ...empty, content: 'last keystroke' } })
  unmount()
  await waitFor(() => expect(writeDraft).toHaveBeenCalledWith('scope', expect.objectContaining({ content: 'last keystroke' }), null))
})

it('serializes successful clearing after an in-flight write and does not resurrect on unmount', async () => {
  vi.mocked(readDraft).mockResolvedValue(undefined)
  let finish!: (record: DraftRecord) => void
  vi.mocked(writeDraft).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    .mockResolvedValueOnce({ revision: 'deleted', updatedAt: 2, data: null })
  const { result, rerender, unmount } = renderHook(({ data }) => usePersistentDraft('scope', data, vi.fn()), { initialProps: { data: empty } })
  await waitFor(() => expect(result.current.loaded).toBe(true))
  const snapshot = { ...empty, content: 'about to publish' }
  rerender({ data: snapshot })
  act(() => { void result.current.retry() })
  await waitFor(() => expect(writeDraft).toHaveBeenCalledTimes(1))
  let clearing!: Promise<void>
  act(() => { clearing = result.current.clear() })
  unmount()
  await act(async () => { finish({ revision: 'saved', updatedAt: 1, data: snapshot }); await clearing })
  expect(writeDraft).toHaveBeenCalledTimes(2)
  expect(vi.mocked(writeDraft).mock.calls[1]).toEqual(['scope', null, 'saved'])
})

it('warns before leaving unsaved input and retries storage failure', async () => {
  vi.mocked(readDraft).mockResolvedValue(undefined)
  vi.mocked(writeDraft).mockRejectedValueOnce(new Error('quota exceeded')).mockResolvedValueOnce({ revision: 'saved', updatedAt: 1, data: empty })
  const { result, rerender } = renderHook(({ data }) => usePersistentDraft('scope', data, vi.fn()), { initialProps: { data: empty } })
  await waitFor(() => expect(result.current.loaded).toBe(true))
  rerender({ data: { ...empty, content: 'keep me' } })
  await act(async () => { await result.current.retry() })
  expect(result.current.error).toBe(true)
  const event = new Event('beforeunload', { cancelable: true })
  await act(async () => { window.dispatchEvent(event) })
  expect(event.defaultPrevented).toBe(true)
  await waitFor(() => expect(result.current.status).toContain('草稿已保存'))
  expect(result.current.error).toBe(false)
})

it('persists a reverted input even when an older write finishes afterwards', async () => {
  vi.mocked(readDraft).mockResolvedValue(undefined)
  let finish!: (record: DraftRecord) => void
  vi.mocked(writeDraft).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    .mockResolvedValueOnce({ revision: 'reverted', updatedAt: 2, data: empty })
  const { result, rerender } = renderHook(({ data }) => usePersistentDraft('scope', data, vi.fn()), { initialProps: { data: empty } })
  await waitFor(() => expect(result.current.loaded).toBe(true))
  const snapshot = { ...empty, content: 'temporary input' }
  rerender({ data: snapshot })
  act(() => { void result.current.retry() })
  await waitFor(() => expect(writeDraft).toHaveBeenCalledTimes(1))
  rerender({ data: empty })
  await act(async () => finish({ revision: 'temporary', updatedAt: 1, data: snapshot }))
  await waitFor(() => expect(writeDraft).toHaveBeenCalledTimes(2))
  expect(vi.mocked(writeDraft).mock.calls[1]).toEqual(['scope', empty, 'temporary'])
})
