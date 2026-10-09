import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/services/auth', () => ({ getAccessToken: vi.fn() }))
import { getAccessToken } from '../src/services/auth'
const client = vi.hoisted(() => ({ get: vi.fn(), delete: vi.fn() }))
vi.mock('../src/services/api/apiClient', () => ({ apiClient: client }))
import { attachmentApi, mediaApi } from '../src/services/mediaApi'

const fetchMock = vi.fn()
function file(size = 8, name = 'photo.png') {
  return new File(['x'.repeat(size)], name, { type: 'image/png' })
}
function ok(data: unknown) { return { ok: true, status: 201, json: vi.fn().mockResolvedValue(data) } }
function failure(data: unknown, status: number) {
  const response = ok(data); response.ok = false; response.status = status; return response
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  vi.mocked(getAccessToken).mockReturnValue('token')
})
afterEach(() => vi.unstubAllGlobals())

describe('upload validation', () => {
  it('rejects non-file payloads before touching the network', async () => {
    await expect(attachmentApi.upload(null as unknown as File)).rejects.toThrow('无效的文件对象')
    await expect(attachmentApi.upload({} as unknown as File)).rejects.toThrow('无效的文件对象')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects empty files before touching the network', async () => {
    await expect(attachmentApi.upload(file(0, 'empty.png'))).rejects.toThrow('文件为空')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('upload request shape', () => {
  it('posts multipart form data with auth, defaults to public, and passes the abort signal', async () => {
    fetchMock.mockResolvedValue(ok({ id: 'a1', url: 'https://cdn.example.com/a.png' }))
    const signal = new AbortController().signal
    const result = await attachmentApi.upload(file(), {
      media_type: 'image', description: '一朵云', is_public: false, signal,
    })
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/attachments/files/')
    expect(options.method).toBe('POST')
    expect(options.credentials).toBe('include')
    expect(options.signal).toBe(signal)
    expect(options.headers.Authorization).toBe('Bearer token')
    expect(options.body.get('file').name).toBe('photo.png')
    expect(options.body.get('media_type')).toBe('image')
    expect(options.body.get('description')).toBe('一朵云')
    expect(options.body.get('is_public')).toBe('false')
    expect(result).toMatchObject({ uid: 'a1', url: 'https://cdn.example.com/a.png' })
  })

  it('falls back to a generic file name and public upload without extra parameters', async () => {
    fetchMock.mockResolvedValue(ok({ uid: 'u9', file: 'https://cdn.example.com/anonymous.bin' }))
    const nameless = new File(['data'], '', { type: 'application/octet-stream' })
    const result = await attachmentApi.upload(nameless)
    const options = fetchMock.mock.calls[0][1]
    expect(options.body.get('file').name).toBe('upload')
    expect(options.body.get('is_public')).toBe('true')
    expect(options.body.has('media_type')).toBe(false)
    expect(result).toMatchObject({ uid: 'u9', url: 'https://cdn.example.com/anonymous.bin' })
  })

  it('sends uploads without an access token when the session is anonymous', async () => {
    vi.mocked(getAccessToken).mockReturnValue(null)
    fetchMock.mockResolvedValue(ok({ id: 'anon' }))
    await attachmentApi.upload(file())
    const options = fetchMock.mock.calls[0][1]
    expect(options.headers).not.toHaveProperty('Authorization')
  })
})

describe('upload error mapping', () => {
  async function rejectedWith(data: unknown, status = 400) {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(failure(data, status))
    try {
      await attachmentApi.upload(file())
      throw new Error('expected the upload to fail')
    } catch (error) {
      return error as Error & { status?: number; response?: { status: number; data: unknown } }
    }
  }

  it('surfaces the DRF detail message with status metadata', async () => {
    const error = await rejectedWith({ detail: '存储空间不足' }, 507)
    expect(error.message).toBe('存储空间不足')
    expect(error.status).toBe(507)
    expect(error.response).toEqual({ status: 507, data: { detail: '存储空间不足' } })
  })

  it('joins field-level serializer errors', async () => {
    const error = await rejectedWith({ file: ['格式不支持', '超过限制'] })
    expect(error.message).toBe('格式不支持; 超过限制')
  })

  it('stringifies a scalar field-level error', async () => {
    const error = await rejectedWith({ file: '病毒文件' })
    expect(error.message).toBe('病毒文件')
  })

  it('joins non_field_errors', async () => {
    const error = await rejectedWith({ non_field_errors: ['字段组合无效'] })
    expect(error.message).toBe('字段组合无效')
    const scalar = await rejectedWith({ non_field_errors: '整体被拒绝' })
    expect(scalar.message).toBe('整体被拒绝')
  })

  it('falls back to the first unknown field error', async () => {
    const error = await rejectedWith({ media_type: ['取值非法'] })
    expect(error.message).toBe('取值非法')
    const scalar = await rejectedWith({ media_type: '不支持' })
    expect(scalar.message).toBe('不支持')
  })

  it('suggests compression for oversized uploads and a generic retry otherwise', async () => {
    expect((await rejectedWith({ detail: undefined }, 413)).message).toBe('文件太大，请压缩后重试')
    expect((await rejectedWith({}, 500)).message).toBe('上传失败，请重试')
  })

  it('tolerates non-JSON error bodies', async () => {
    const html = failure({}, 502)
    html.json.mockRejectedValue(new Error('html'))
    fetchMock.mockResolvedValue(html)
    await expect(attachmentApi.upload(file())).rejects.toThrow('上传失败，请重试')
  })

  it('propagates network failures unchanged', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    await expect(attachmentApi.upload(file())).rejects.toThrow('fetch failed')
  })
})

describe('attachment transformations', () => {
  async function uploadReturns(data: unknown) {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(ok(data))
    return attachmentApi.upload(file())
  }

  it('maps legacy field names onto the attachment model', async () => {
    const result = await uploadReturns({
      id: 'legacy', preview_url: 'https://cdn.example.com/preview.jpg',
      original_name: '原名.jpg', mime_type: 'image/jpeg', file_size: 1234,
    })
    expect(result).toEqual({
      uid: 'legacy', url: 'https://cdn.example.com/preview.jpg', type: 'image',
      filename: '原名.jpg', originalFilename: '原名.jpg', fileSize: 1234, mimeType: 'image/jpeg',
    })
  })

  it('prefers the explicit uid and infers the media type from the mime type', async () => {
    expect(await uploadReturns({ uid: 'pic', url: 'https://x/y.png', mime_type: 'image/png' }))
      .toMatchObject({ uid: 'pic', type: 'image' })
    expect(await uploadReturns({ uid: 'clip', url: 'https://x/y.mp4', mime_type: 'video/mp4' }))
      .toMatchObject({ type: 'video' })
    expect(await uploadReturns({ uid: 'sound', url: 'https://x/y.mp3', mime_type: 'audio/mpeg' }))
      .toMatchObject({ type: 'audio' })
    expect(await uploadReturns({ uid: 'doc', url: 'https://x/y.pdf', mime_type: 'application/pdf' }))
      .toMatchObject({ type: 'file' })
  })

  it('keeps an explicitly declared media_type and maps the plain file field', async () => {
    expect(await uploadReturns({ uid: 'm', file: 'https://x/y.bin', media_type: 'video' }))
      .toMatchObject({ url: 'https://x/y.bin', type: 'video' })
    expect(await uploadReturns({ uid: 'n', file: 'https://x/z.bin', type: 'image' }))
      .toMatchObject({ type: 'image' })
  })

  it('maps remaining field aliases for filename and size', async () => {
    expect(await uploadReturns({
      uid: 'f', url: 'https://x/f.zip', original_filename: '导出.zip', size: 99,
    })).toMatchObject({ originalFilename: '导出.zip', filename: undefined, fileSize: 99 })
    // No uid or id at all falls back to an empty identifier.
    expect(await uploadReturns({ url: 'https://x/anon.bin' })).toMatchObject({ uid: '', url: 'https://x/anon.bin' })
  })

  it('prefixes relative media URLs with the API base', async () => {
    const relative = await uploadReturns({ id: 'r1', url: '/media/r1.png' })
    expect(relative.url).toBe('/media/r1.png')
    expect(relative.url.startsWith('/')).toBe(true)
    const nested = await uploadReturns({ id: 'r2', file: '/api/v1/attachments/files/r2/download/' })
    expect(nested.url).toBe('/api/v1/attachments/files/r2/download/')
  })

  it('rewrites the protocol only when VITE_MEDIA_URL_PROTOCOL is configured', async () => {
    vi.stubEnv('VITE_MEDIA_URL_PROTOCOL', 'https')
    expect((await uploadReturns({ id: 's1', url: 'http://cdn.example.com/s1.png' })).url)
      .toBe('https://cdn.example.com/s1.png')
    expect((await uploadReturns({ id: 's2', url: 'https://cdn.example.com/s2.png' })).url)
      .toBe('https://cdn.example.com/s2.png')
    vi.stubEnv('VITE_MEDIA_URL_PROTOCOL', 'http')
    expect((await uploadReturns({ id: 's3', url: 'https://cdn.example.com/s3.png' })).url)
      .toBe('http://cdn.example.com/s3.png')
    vi.unstubAllEnvs()
    expect((await uploadReturns({ id: 's4', url: 'http://cdn.example.com/s4.png' })).url)
      .toBe('http://cdn.example.com/s4.png')
  })
})

describe('delete and list', () => {
  it('deletes through the shared API client', async () => {
    client.delete.mockResolvedValue(undefined)
    await attachmentApi.delete('uid-1')
    expect(client.delete).toHaveBeenCalledWith('/api/v1/attachments/files/uid-1/')
  })

  it('lists attachments from a paginated payload', async () => {
    client.get.mockResolvedValue({ results: [{ id: 'p1', url: '/media/p1.png' }] })
    expect(await attachmentApi.list()).toEqual([
      expect.objectContaining({ uid: 'p1', url: '/media/p1.png' }),
    ])
    expect(client.get).toHaveBeenCalledWith('/api/v1/attachments/files/')
  })

  it('accepts a bare array and falls back to an empty list for malformed payloads', async () => {
    client.get.mockResolvedValue([{ id: 'bare' }])
    expect(await attachmentApi.list()).toEqual([expect.objectContaining({ uid: 'bare' })])
    client.get.mockResolvedValue({ unexpected: true })
    expect(await attachmentApi.list()).toEqual([])
  })

  it('keeps the legacy mediaApi aliases wired to the same functions', () => {
    expect(mediaApi.uploadMedia).toBe(attachmentApi.upload)
    expect(mediaApi.deleteMedia).toBe(attachmentApi.delete)
    expect(mediaApi.uploadMedia.name).toBe('upload')
  })
})
