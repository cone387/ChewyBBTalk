import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const accessKey = 'bbtalk_access_token', refreshKey = 'bbtalk_refresh_token', userKey = 'bbtalk_user_info'
const user = { id: 1, username: 'alice', display_name: 'Alice' }
const fetchMock = vi.fn()
const jwt = (expiresIn = 3600) => `header.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expiresIn }))}.signature`
function response(data: unknown, status = 200) { return { ok: status >= 200 && status < 300, status, json: vi.fn().mockResolvedValue(data) } }
function seed() { localStorage.setItem(accessKey, jwt()); localStorage.setItem(refreshKey, 'refresh-old'); localStorage.setItem(userKey, JSON.stringify(user)) }
beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks(); vi.useFakeTimers(); localStorage.clear()
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  vi.stubGlobal('fetch', fetchMock)
  delete window.__POWERED_BY_WUJIE__; delete window.__WUJIE; delete window.__AUTH_BRIDGE__
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(globalThis, 'setTimeout')
})
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

it.each(['login', 'register'] as const)('persists successful %s credentials and schedules refresh', async (method) => {
  const auth = await import('../src/services/auth')
  const data = { access: jwt(), refresh: 'refresh', user }
  fetchMock.mockResolvedValue(response(data))
  const result = method === 'login' ? await auth.login('alice', 'password') : await auth.register({ username: 'alice', password: 'password' })
  expect(result.success).toBe(true)
  expect(auth.getAccessToken()).toBe(data.access)
  expect(auth.getCurrentUser()).toEqual(user)
  expect(auth.isAuthenticated()).toBe(true)
  expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 3300000)
})

it.each(['login', 'register'] as const)('returns server, invalid JSON and network errors from %s without logging in', async (method) => {
  const auth = await import('../src/services/auth')
  const run = () => method === 'login' ? auth.login('alice', 'bad') : auth.register({ username: 'alice', password: 'bad' })
  fetchMock.mockResolvedValueOnce(response({ error: 'rejected' }, 400))
  expect(await run()).toMatchObject({ success: false, error: 'rejected' })
  const invalid = response({}, 502); invalid.json.mockRejectedValue(new Error('html'))
  fetchMock.mockResolvedValueOnce(invalid)
  expect(await run()).toMatchObject({ success: false, error: expect.stringContaining('502') })
  fetchMock.mockRejectedValueOnce(new Error('offline'))
  expect(await run()).toMatchObject({ success: false, error: expect.stringContaining('网络错误') })
  expect(auth.isAuthenticated()).toBe(false)
})

it('validates registration policy rather than assuming registration is enabled', async () => {
  const auth = await import('../src/services/auth')
  fetchMock.mockResolvedValueOnce(response({ registration_enabled: false }))
  expect(await auth.getAuthPolicy()).toEqual({ registration_enabled: false })
  fetchMock.mockResolvedValueOnce(response({ registration_enabled: 'true' }))
  await expect(auth.getAuthPolicy()).rejects.toThrow('格式错误')
  fetchMock.mockResolvedValueOnce(response({}, 503))
  await expect(auth.getAuthPolicy()).rejects.toThrow('无法读取')
})

it('does not refresh without credentials', async () => {
  const auth = await import('../src/services/auth')
  expect(await auth.refreshAccessToken()).toBe(false)
  expect(fetchMock).not.toHaveBeenCalled()
})

it('shares concurrent refresh calls and persists rotated tokens once', async () => {
  seed(); const auth = await import('../src/services/auth')
  let finish!: (value: ReturnType<typeof response>) => void
  fetchMock.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const first = auth.refreshAccessToken(), second = auth.refreshAccessToken()
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const token = jwt()
  finish(response({ access: token, refresh: 'rotated' }))
  expect(await first).toBe(true); expect(await second).toBe(true)
  expect(auth.getAccessToken()).toBe(token)
  expect(localStorage.getItem(refreshKey)).toBe('rotated')
})

it.each([401, 403])('clears invalid refresh credentials on HTTP %s', async (status) => {
  seed(); const auth = await import('../src/services/auth')
  fetchMock.mockResolvedValue(response({}, status))
  expect(await auth.refreshAccessToken()).toBe(false)
  expect(auth.getAccessToken()).toBeNull()
  expect(localStorage.getItem(refreshKey)).toBeNull()
  expect(setTimeout).not.toHaveBeenCalledWith(expect.any(Function), 30000)
})

it.each(['network', 'server', 'json'])('preserves credentials and schedules retry after %s refresh failure', async (failure) => {
  seed(); const auth = await import('../src/services/auth'); const before = auth.getAccessToken()
  if (failure === 'network') fetchMock.mockRejectedValueOnce(new Error('offline'))
  if (failure === 'server') fetchMock.mockResolvedValueOnce(response({}, 503))
  if (failure === 'json') { const invalid = response({}); invalid.json.mockRejectedValue(new Error('invalid')); fetchMock.mockResolvedValueOnce(invalid) }
  expect(await auth.refreshAccessToken()).toBe(false)
  expect(auth.getAccessToken()).toBe(before)
  expect(localStorage.getItem(refreshKey)).toBe('refresh-old')
  fetchMock.mockResolvedValue(response({ access: jwt() }))
  await vi.advanceTimersByTimeAsync(30000)
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

it.each([200, 401, 503])('ignores a late HTTP %s refresh response after account change', async (status) => {
  seed(); const auth = await import('../src/services/auth')
  let finish!: (value: ReturnType<typeof response>) => void
  fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const old = auth.refreshAccessToken()
  localStorage.setItem(accessKey, 'new-access'); localStorage.setItem(refreshKey, 'new-refresh')
  finish(response({ access: 'old-access', refresh: 'old-refresh' }, status))
  expect(await old).toBe(false)
  expect(auth.getAccessToken()).toBe('new-access')
  expect(localStorage.getItem(refreshKey)).toBe('new-refresh')
  expect(setTimeout).not.toHaveBeenCalledWith(expect.any(Function), 30000)
})

it('does not restore an account without an access token', async () => {
  const auth = await import('../src/services/auth')
  expect(await auth.initAuth()).toBe(false)
  expect(fetchMock).not.toHaveBeenCalled()
})

it('restores valid cached credentials and updates the user from the server', async () => {
  seed(); const auth = await import('../src/services/auth')
  fetchMock.mockResolvedValue(response({ ...user, display_name: 'Updated' }))
  expect(await auth.initAuth()).toBe(true)
  expect(auth.getCurrentUser()?.display_name).toBe('Updated')
  expect(await auth.getUserInfo()).toEqual(auth.getCurrentUser())
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('keeps the cached user available during a server outage', async () => {
  seed(); const auth = await import('../src/services/auth')
  fetchMock.mockRejectedValue(new Error('offline'))
  expect(await auth.initAuth()).toBe(true)
  expect(auth.getCurrentUser()).toEqual(user)
})

it('keeps an expired session during transient refresh failure if a cached user exists', async () => {
  seed(); localStorage.setItem(accessKey, jwt(-10)); const auth = await import('../src/services/auth')
  fetchMock.mockResolvedValue(response({}, 503))
  expect(await auth.initAuth()).toBe(true)
  expect(auth.getCurrentUser()).toEqual(user)
})

it('does not consider corrupt cached user data sufficient when the server is unavailable', async () => {
  seed(); localStorage.setItem(userKey, 'broken'); const auth = await import('../src/services/auth')
  fetchMock.mockResolvedValue(response({}, 503))
  expect(await auth.initAuth()).toBe(false)
  expect(auth.isAuthenticated()).toBe(false)
})

it('supports parent application token and user bridges', async () => {
  window.__POWERED_BY_WUJIE__ = true
  window.__AUTH_BRIDGE__ = { getToken: () => jwt(), getUserInfo: async () => user }
  const auth = await import('../src/services/auth')
  expect(await auth.initAuth()).toBe(true)
  expect(auth.getCurrentUser()).toEqual(user)
  expect(fetchMock).not.toHaveBeenCalled()
})

it('requires a signed-in user for password verification', async () => {
  const auth = await import('../src/services/auth')
  expect(await auth.verifyPassword('password')).toMatchObject({ success: false, error: '用户未登录' })
  expect(fetchMock).not.toHaveBeenCalled()
})

it('verifies passwords, rotates credentials, and reports rate limits', async () => {
  seed(); const auth = await import('../src/services/auth')
  fetchMock.mockResolvedValueOnce(response(user)); await auth.initAuth()
  fetchMock.mockResolvedValueOnce(response({ access: jwt(), refresh: 'verified', user }))
  expect(await auth.verifyPassword('correct')).toEqual({ success: true })
  expect(localStorage.getItem(refreshKey)).toBe('verified')
  fetchMock.mockResolvedValueOnce(response({}, 429))
  expect(await auth.verifyPassword('wrong')).toMatchObject({ success: false, error: expect.stringContaining('频繁') })
  fetchMock.mockRejectedValueOnce(new Error('offline'))
  expect(await auth.verifyPassword('correct')).toMatchObject({ success: false, error: expect.stringContaining('网络错误') })
})

it('keeps the deprecated callback disabled', async () => {
  const auth = await import('../src/services/auth')
  expect(await auth.handleCallback('code', 'state')).toBe(false)
})
