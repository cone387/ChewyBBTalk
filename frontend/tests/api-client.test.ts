import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../src/services/auth', () => ({
  getAccessToken: vi.fn(), getCurrentUser: vi.fn(), refreshAccessToken: vi.fn(), logout: vi.fn(),
}))
import { getAccessToken, getCurrentUser, refreshAccessToken, logout } from '../src/services/auth'
import { apiClient } from '../src/services/api/apiClient'

const fetchMock = vi.fn()
function response(status = 200, data: unknown = { id: 1 }, length: string | null = null) {
  return { status, ok: status >= 200 && status < 300, headers: { get: () => length }, json: vi.fn().mockResolvedValue(data), blob: vi.fn().mockResolvedValue(new Blob(['backup'])) }
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  vi.mocked(getAccessToken).mockReturnValue('access')
  vi.mocked(getCurrentUser).mockReturnValue({ id: 1, username: 'alice' })
  vi.mocked(refreshAccessToken).mockResolvedValue(true)
  fetchMock.mockResolvedValue(response())
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('API requests', () => {
  it('does not reuse the browser URL cache for authenticated downloads', async () => {
    await apiClient.download('/api/v1/attachments/files/private/preview')
    expect(fetchMock.mock.calls[0][1].cache).toBe('no-store')
    await apiClient.download('/api/v1/attachments/files/private/preview', { cache: 'reload' })
    expect(fetchMock.mock.calls[1][1].cache).toBe('reload')
  })
  it('rejects an obsolete feed even when its JSON body finishes after cancellation', async () => {
    let finish!: (value: unknown) => void
    const body = new Promise(resolve => { finish = resolve })
    const slow = response()
    slow.json.mockReturnValue(body)
    fetchMock.mockResolvedValueOnce(slow)
    const first = apiClient.get('/api/v1/bbtalk', { search: 'old-body' })
    await Promise.resolve(); await Promise.resolve()
    const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' })
    await apiClient.get('/api/v1/bbtalk', { search: 'new-body' })
    finish({ id: 'old' })
    await rejected
  })
  it('keeps a pending filter read alive during an unrelated comment write', async () => {
    let finish!: (value: ReturnType<typeof response>) => void
    fetchMock.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    const feed = apiClient.get('/api/v1/bbtalk', { tags: ['new'] })
    await apiClient.post('/api/v1/bbtalk/record/comments', { content: 'hello' })
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false)
    finish(response())
    await feed
  })
  it('coalesces simultaneous identical reads and permits a later refresh', async () => {
    let finish!: (value: ReturnType<typeof response>) => void
    fetchMock.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    const first = apiClient.get('/items', { page: 1 })
    const second = apiClient.get('/items', { page: 1 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    finish(response())
    await Promise.all([first, second])
    await apiClient.get('/items', { page: 1 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('aborts obsolete feed filters while retaining the latest query', async () => {
    fetchMock.mockImplementation((_url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      if (String(_url).includes('tags=new')) resolve(response())
    }))
    const old = apiClient.get('/api/v1/bbtalk', { tags: ['old'] })
    const rejected = expect(old).rejects.toMatchObject({ name: 'AbortError' })
    await apiClient.get('/api/v1/bbtalk', { tags: ['new'] })
    await rejected
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true)
  })

  it('encodes array filters and appends them to existing query parameters', async () => {
    await apiClient.get('/items?page=2', { tags: ['work', 'home'], empty: [] })
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/items\?page=2&tags=work&tags=home$/)
  })

  it('renders FastAPI validation errors without exposing input values', async () => {
    fetchMock.mockResolvedValue(response(422, { detail: [{ loc: ['body', 'password'], msg: 'String should have at least 8 characters', input: 'secret', type: 'string_too_short' }] }))
    await expect(apiClient.post('/items', {})).rejects.toMatchObject({ status: 422, message: 'password: String should have at least 8 characters' })
  })

  it('encodes filters, retaining zero and false but omitting empty values', async () => {
    expect(await apiClient.get('/items/', { q: 'a b&c', zero: 0, flag: false, missing: undefined, nil: null, blank: '' })).toEqual({ id: 1 })
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/items\/\?q=a\+b%26c&zero=0&flag=false$/)
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer access')
  })

  it('sends public requests without authorization or an empty query suffix', async () => {
    vi.mocked(getAccessToken).mockReturnValue(null)
    await apiClient.get('/items/', { q: '' })
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/items\/$/)
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization')
  })

  it.each(['post', 'patch'] as const)('sends %s JSON with caller headers', async (method) => {
    await apiClient[method]('/items/', { content: 'hello' }, { 'If-Match': 'revision-1' })
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: method.toUpperCase(), body: '{"content":"hello"}', headers: { 'If-Match': 'revision-1', 'Content-Type': 'application/json' } })
  })

  it.each(['post', 'patch', 'delete'] as const)('does not parse empty %s responses', async (method) => {
    const res = response(204)
    fetchMock.mockResolvedValue(res)
    expect(await apiClient[method]('/items/')).toBeUndefined()
    expect(res.json).not.toHaveBeenCalled()
  })

  it('respects a zero-length response body', async () => {
    const res = response(200, null, '0')
    fetchMock.mockResolvedValue(res)
    expect(await apiClient.get('/items/')).toBeUndefined()
    expect(res.json).not.toHaveBeenCalled()
  })

  it('downloads binary data without JSON parsing', async () => {
    const res = response()
    fetchMock.mockResolvedValue(res)
    const blob = await apiClient.download('/backup/')
    expect(blob.size).toBe(6)
    expect(res.json).not.toHaveBeenCalled()
  })

  it('refreshes once on 401 and retries with the new token', async () => {
    fetchMock.mockResolvedValueOnce(response(401))
    vi.mocked(getAccessToken).mockReturnValueOnce('old').mockReturnValue('new')
    expect(await apiClient.get('/items/')).toEqual({ id: 1 })
    expect(refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer new')
  })

  it('does not refresh failed login requests', async () => {
    fetchMock.mockResolvedValue(response(401))
    await expect(apiClient.post('/auth/token/')).rejects.toThrow('用户名或密码错误')
    expect(refreshAccessToken).not.toHaveBeenCalled()
  })

  it('keeps the account logged in after a transient refresh failure', async () => {
    fetchMock.mockResolvedValue(response(401))
    vi.mocked(refreshAccessToken).mockResolvedValue(false)
    await expect(apiClient.get('/items/')).rejects.toThrow('会话刷新失败')
    expect(logout).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('logs out only after refresh invalidates the access token', async () => {
    fetchMock.mockResolvedValue(response(401))
    vi.mocked(refreshAccessToken).mockImplementation(async () => {
      vi.mocked(getAccessToken).mockReturnValue(null)
      return false
    })
    await expect(apiClient.get('/items/')).rejects.toThrow('会话已过期')
    expect(logout).toHaveBeenCalledTimes(1)
  })

  it('preserves refresh exceptions while credentials still exist', async () => {
    fetchMock.mockResolvedValue(response(401))
    vi.mocked(refreshAccessToken).mockRejectedValue(new Error('offline'))
    await expect(apiClient.get('/items/')).rejects.toThrow('offline')
    expect(logout).not.toHaveBeenCalled()
  })

  it('reports authentication failure for a refresh exception after credentials disappear', async () => {
    fetchMock.mockResolvedValue(response(401))
    vi.mocked(refreshAccessToken).mockImplementation(async () => {
      vi.mocked(getAccessToken).mockReturnValue(null)
      throw new Error('invalid')
    })
    await expect(apiClient.get('/items/')).rejects.toThrow('认证失败')
    expect(logout).toHaveBeenCalledTimes(1)
  })

  it('does not retry indefinitely if the refreshed request also returns 401', async () => {
    fetchMock.mockResolvedValue(response(401))
    await expect(apiClient.get('/items/')).rejects.toMatchObject({ status: 401 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(refreshAccessToken).toHaveBeenCalledTimes(1)
  })

  it.each(['error', 'message'])('preserves server %s and conflict metadata', async (field) => {
    fetchMock.mockResolvedValue(response(409, { [field]: 'changed remotely', code: 'conflict', current: { revision: 2 } }))
    await expect(apiClient.patch('/items/', {})).rejects.toMatchObject({ message: 'changed remotely', status: 409, code: 'conflict', current: { revision: 2 } })
  })

  it('falls back to HTTP status when the error body is not JSON', async () => {
    const res = response(502)
    res.json.mockRejectedValue(new Error('html'))
    fetchMock.mockResolvedValue(res)
    await expect(apiClient.get('/items/')).rejects.toThrow('502')
  })

  it.each(['response', 'body', 'refresh', 'download'])('rejects stale account data at the %s boundary', async (boundary) => {
    const switchUser = () => vi.mocked(getCurrentUser).mockReturnValue({ id: 2, username: 'bob' })
    if (boundary === 'response') fetchMock.mockImplementation(async () => { switchUser(); return response() })
    if (boundary === 'body' || boundary === 'download') {
      const res = response()
      res.json.mockImplementation(async () => { switchUser(); return { private: true } })
      res.blob.mockImplementation(async () => { switchUser(); return new Blob(['private']) })
      fetchMock.mockResolvedValue(res)
    }
    if (boundary === 'refresh') {
      fetchMock.mockResolvedValueOnce(response(401))
      vi.mocked(refreshAccessToken).mockImplementation(async () => { switchUser(); return true })
    }
    await expect(boundary === 'download' ? apiClient.download('/items/') : apiClient.get('/items/')).rejects.toThrow('账号已切换')
    expect(logout).not.toHaveBeenCalled()
  })
})
