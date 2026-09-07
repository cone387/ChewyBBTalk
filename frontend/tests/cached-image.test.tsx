import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import CachedImage from '../src/components/CachedImage'
import { imageCacheService } from '../src/services/cache/imageCache'

vi.mock('../src/services/cache/imageCache', () => ({ imageCacheService: { getOrFetch: vi.fn() } }))
beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} })
  URL.createObjectURL = vi.fn(() => 'blob:test')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllGlobals() })

it('retries with custom fallback and reports success only after decoding', async () => {
  vi.mocked(imageCacheService.getOrFetch).mockResolvedValueOnce(null).mockResolvedValueOnce(new Blob(['ok']))
  const onLoad = vi.fn()
  render(<CachedImage src="/picture.png" alt="图片" loading="eager" fallback={<span>自定义错误</span>} onLoad={onLoad} />)
  await screen.findByText('自定义错误')
  fireEvent.click(screen.getByRole('button', { name: '重试加载图片 图片' }))
  const img = await screen.findByRole('img')
  expect(imageCacheService.getOrFetch).toHaveBeenLastCalledWith('/picture.png', true)
  expect(onLoad).not.toHaveBeenCalled()
  fireEvent.load(img)
  expect(onLoad).toHaveBeenCalledOnce()
})

it('handles decode failure and does not reload when callback identities change', async () => {
  vi.mocked(imageCacheService.getOrFetch).mockResolvedValue(new Blob(['broken']))
  const { rerender } = render(<CachedImage src="/picture.png" alt="图片" loading="eager" onLoad={() => {}} />)
  const img = await screen.findByRole('img')
  rerender(<CachedImage src="/picture.png" alt="图片" loading="eager" onLoad={() => {}} />)
  expect(imageCacheService.getOrFetch).toHaveBeenCalledTimes(1)
  fireEvent.error(img)
  await screen.findByRole('button', { name: '重试加载图片 图片' })
})

it('ignores old requests after source changes and revokes URLs on unmount', async () => {
  let finish!: (blob: Blob) => void
  vi.mocked(imageCacheService.getOrFetch).mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValueOnce(new Blob(['new']))
  const { rerender, unmount } = render(<CachedImage src="/old.png" alt="图片" loading="eager" />)
  rerender(<CachedImage src="/new.png" alt="图片" loading="eager" />)
  await screen.findByRole('img')
  await act(async () => finish(new Blob(['old'])))
  await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1))
  unmount()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test')
})
