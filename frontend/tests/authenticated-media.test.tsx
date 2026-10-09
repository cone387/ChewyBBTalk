import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AttachmentDownload, AttachmentVideo } from '../src/components/AuthenticatedMedia'
import { apiClient } from '../src/services/api/apiClient'

vi.mock('../src/services/api/apiClient', () => ({ apiClient: { download: vi.fn() } }))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

const createObjectURL = vi.fn(() => 'blob:attachment')
const revokeObjectURL = vi.fn()
beforeEach(() => {
  vi.resetAllMocks()
  createObjectURL.mockReturnValue('blob:attachment')
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = createObjectURL
    static revokeObjectURL = revokeObjectURL
  })
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

it('downloads an authenticated video on demand, prevents duplicate clicks and releases its URL', async () => {
  const request = deferred<Blob>()
  vi.mocked(apiClient.download).mockReturnValue(request.promise)
  const { container, unmount } = render(<AttachmentVideo src="/api/v1/attachments/clip/?original=1" controls />)
  expect(apiClient.download).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '加载视频' }))
  const busy = screen.getByRole('button', { name: '正在加载视频…' }) as HTMLButtonElement
  expect(busy.disabled).toBe(true)
  fireEvent.click(busy)
  expect(apiClient.download).toHaveBeenCalledExactlyOnceWith('/api/v1/attachments/clip/?original=1')
  const blob = new Blob(['video'])
  await act(async () => request.resolve(blob))
  expect(createObjectURL).toHaveBeenCalledWith(blob)
  expect(container.querySelector('video')?.getAttribute('src')).toBe('blob:attachment')
  expect(container.querySelector('video')?.controls).toBe(true)
  unmount()
  expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:attachment')
})

it.each([new Error('permission denied'), null])('shows video errors and allows retry: %s', async error => {
  vi.mocked(apiClient.download).mockRejectedValueOnce(error).mockResolvedValueOnce(new Blob(['video']))
  const { container } = render(<AttachmentVideo src="/api/v1/attachments/clip/" />)
  fireEvent.click(screen.getByRole('button'))
  expect((await screen.findByRole('alert')).textContent).toBe(error?.message ?? '加载失败')
  fireEvent.click(screen.getByRole('button', { name: '加载失败，重试视频' }))
  await act(async () => {})
  expect(container.querySelector('video')?.getAttribute('src')).toBe('blob:attachment')
  expect(screen.queryByRole('alert')).toBeNull()
})

it.each(['resolve', 'reject'] as const)('ignores a video request that %s after unmount', async outcome => {
  const request = deferred<Blob>()
  vi.mocked(apiClient.download).mockReturnValue(request.promise)
  const { unmount } = render(<AttachmentVideo src="/api/v1/attachments/clip/" />)
  fireEvent.click(screen.getByRole('button'))
  unmount()
  await act(async () => {
    if (outcome === 'resolve') request.resolve(new Blob(['late']))
    else request.reject(new Error('late error'))
  })
  expect(createObjectURL).not.toHaveBeenCalled()
  expect(revokeObjectURL).not.toHaveBeenCalled()
})

it.each(['https://other.test/api/v1/attachments/clip/', '/public/clip.mp4', 'http://[invalid'])('leaves external or non-attachment media to the browser: %s', src => {
  const { container } = render(<><AttachmentVideo src={src} /><AttachmentDownload href={src}>download</AttachmentDownload></>)
  expect(container.querySelector('video')?.getAttribute('src')).toBe(src)
  const event = new MouseEvent('click', { bubbles: true, cancelable: true })
  // Observe the component handler without allowing jsdom to navigate.
  const link = screen.getByRole('link')
  let prevented = true
  const stopNavigation = (e: Event) => { prevented = e.defaultPrevented; e.preventDefault() }
  document.addEventListener('click', stopNavigation, { once: true })
  fireEvent(link, event)
  expect(prevented).toBe(false)
  expect(apiClient.download).not.toHaveBeenCalled()
})

it('uses the configured API origin for protected video URLs', async () => {
  vi.stubEnv('VITE_API_BASE_URL', 'https://api.test')
  vi.mocked(apiClient.download).mockResolvedValue(new Blob(['video']))
  render(<AttachmentVideo src="https://api.test/api/v1/attachments/clip/" />)
  fireEvent.click(screen.getByRole('button'))
  await act(async () => {})
  expect(apiClient.download).toHaveBeenCalledWith('/api/v1/attachments/clip/')
})

it.each(['report.pdf', undefined])('downloads one file with the expected filename and releases the URL: %s', async filename => {
  vi.useFakeTimers()
  const request = deferred<Blob>()
  vi.mocked(apiClient.download).mockReturnValue(request.promise)
  const clicks: { href: string; name: string; connected: boolean }[] = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
    clicks.push({ href: this.href, name: this.download, connected: this.isConnected })
  })
  render(<AttachmentDownload href="/api/v1/attachments/file/?original=1" download={filename}>下载</AttachmentDownload>)
  fireEvent.click(screen.getByRole('link'))
  expect(screen.getByRole('link').getAttribute('aria-busy')).toBe('true')
  fireEvent.click(screen.getByRole('link'))
  expect(apiClient.download).toHaveBeenCalledExactlyOnceWith('/api/v1/attachments/file/?original=1')
  await act(async () => request.resolve(new Blob(['file'])))
  expect(clicks).toEqual([{ href: 'blob:attachment', name: filename ?? '附件', connected: true }])
  expect(document.querySelectorAll('a')).toHaveLength(1)
  expect(screen.getByRole('link').getAttribute('aria-busy')).toBe('false')
  expect(revokeObjectURL).not.toHaveBeenCalled()
  await act(async () => vi.advanceTimersByTime(60_000))
  expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:attachment')
})

it.each([new Error('offline'), null])('clears download errors when retried: %s', async error => {
  vi.useFakeTimers()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  vi.mocked(apiClient.download).mockRejectedValueOnce(error).mockResolvedValueOnce(new Blob(['file']))
  render(<AttachmentDownload href="/api/v1/attachments/file/">下载</AttachmentDownload>)
  await act(async () => { fireEvent.click(screen.getByRole('link')) })
  expect(screen.getByRole('alert').textContent).toBe(error?.message ?? '下载失败，请重试')
  await act(async () => { fireEvent.click(screen.getByRole('link')) })
  expect(screen.queryByRole('alert')).toBeNull()
  expect(apiClient.download).toHaveBeenCalledTimes(2)
  await act(async () => vi.advanceTimersByTime(60_000))
})
