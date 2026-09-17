import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { attachmentApi } from '../src/services/mediaApi'
import { useAttachmentUploads } from '../src/hooks/useAttachmentUploads'

vi.mock('../src/services/mediaApi', () => ({ attachmentApi: { upload: vi.fn() } }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
const attachment = { uid: 'ready', url: '/ready.txt', type: 'file' as const }

it('keeps successful files and retries only failed files', async () => {
  vi.mocked(attachmentApi.upload).mockResolvedValueOnce(attachment).mockRejectedValueOnce(new Error('too large')).mockResolvedValueOnce({ ...attachment, uid: 'retried' })
  const { result } = renderHook(useAttachmentUploads)
  act(() => result.current.add([new File(['a'], 'a.txt'), new File(['b'], 'b.txt')], 'auto'))
  await waitFor(() => expect(result.current.items.map(item => item.status)).toEqual(['ready', 'failed']))
  act(() => { result.current.retry(result.current.items[1].id); result.current.retry(result.current.items[1].id) })
  await waitFor(() => expect(result.current.items.map(item => item.status)).toEqual(['ready', 'ready']))
  expect(attachmentApi.upload).toHaveBeenCalledTimes(3)
  expect(vi.mocked(attachmentApi.upload).mock.calls.map(([file]) => file.name)).toEqual(['a.txt', 'b.txt', 'b.txt'])
})

it('aborts removed uploads and ignores late completion after reset', async () => {
  let resolve!: (value: typeof attachment) => void
  vi.mocked(attachmentApi.upload).mockImplementation(() => new Promise(done => { resolve = done }))
  const { result } = renderHook(useAttachmentUploads)
  act(() => result.current.add([new File(['a'], 'a.txt')], 'auto'))
  const signal = vi.mocked(attachmentApi.upload).mock.calls[0][1]?.signal
  act(() => result.current.remove(result.current.items[0].id))
  expect(signal?.aborted).toBe(true)
  await act(async () => resolve(attachment))
  expect(result.current.items).toEqual([])
  act(() => result.current.add([new File(['b'], 'b.txt')], 'auto'))
  act(() => result.current.reset())
  await act(async () => resolve(attachment))
  expect(result.current.items).toEqual([])
})

it('aborts pending requests on unmount', () => {
  vi.mocked(attachmentApi.upload).mockImplementation(() => new Promise(() => {}))
  const { result, unmount } = renderHook(useAttachmentUploads)
  act(() => result.current.add([new File(['a'], 'a.txt')], 'auto'))
  const signal = vi.mocked(attachmentApi.upload).mock.calls[0][1]?.signal
  unmount()
  expect(signal?.aborted).toBe(true)
})

it('restores unfinished files without requests and retries with the original File', async () => {
  vi.mocked(attachmentApi.upload).mockResolvedValue(attachment)
  const file = new File(['restored bytes'], 'restored.txt')
  const { result } = renderHook(useAttachmentUploads)
  act(() => result.current.restore([
    { id: 'old', file, mediaType: 'auto', status: 'uploading' },
    { id: 'ready', file, mediaType: 'auto', status: 'ready', attachment },
  ]))
  expect(attachmentApi.upload).not.toHaveBeenCalled()
  expect(result.current.items.map(item => item.status)).toEqual(['failed', 'ready'])
  act(() => result.current.retry(result.current.items[0].id))
  await waitFor(() => expect(result.current.items[0].status).toBe('ready'))
  expect(vi.mocked(attachmentApi.upload).mock.calls[0][0]).toBe(file)
})
