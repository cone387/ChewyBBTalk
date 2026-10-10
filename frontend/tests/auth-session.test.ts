import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const accessKey = 'bbtalk_access_token', refreshKey = 'bbtalk_refresh_token', userKey = 'bbtalk_user_info'
const user = { id: 1, username: 'alice', display_name: 'Alice' }
const fetchMock = vi.fn()
const jwt = (expiresIn = 3600) => `header.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expiresIn }))}.signature`
const jwtWithoutExp = `header.${btoa(JSON.stringify({ sub: 'alice' }))}.signature`
function response(data: unknown, status = 200) { return { ok: status >= 200 && status < 300, status, json: vi.fn().mockResolvedValue(data) } }
function seed() { localStorage.setItem(accessKey, jwt()); localStorage.setItem(refreshKey, 'refresh-old'); localStorage.setItem(userKey, JSON.stringify(user)) }

let navigatedTo: string | undefined;
const realLocation = window.location;

beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks(); vi.useFakeTimers(); localStorage.clear()
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  vi.stubGlobal('fetch', fetchMock)
  delete window.__POWERED_BY_WUJIE__; delete window.__WUJIE; delete window.__AUTH_BRIDGE__
  navigatedTo = undefined
  Object.defineProperty(window, 'location', {
    value: {
      get search() { return realLocation.search },
      get pathname() { return realLocation.pathname },
      get href() { return realLocation.href },
      set href(value: string) { navigatedTo = value },
      assign: vi.fn(),
    },
    writable: true, configurable: true,
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(globalThis, 'setTimeout')
})
afterEach(() => {
  vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks()
  Object.defineProperty(window, 'location', { value: realLocation, writable: true, configurable: true })
})

describe('login and register error contracts', () => {
  it('keeps profile edits in the same session but invalidates cross-tab account changes', async () => {
    seed()
    const auth = await import('../src/services/auth')
    const initial = auth.getAuthSessionScope()
    const changed = vi.fn()
    const unsubscribe = auth.subscribeAuthSession(changed)
    const before = localStorage.getItem(userKey)
    const after = JSON.stringify({ ...user, display_name: 'Updated profile' })
    localStorage.setItem(userKey, after)
    window.dispatchEvent(new StorageEvent('storage', { key: userKey, oldValue: before, newValue: after }))
    expect(auth.getAuthSessionScope()).toBe(initial)
    expect(changed).not.toHaveBeenCalled()
    const other = JSON.stringify({ id: 2, username: 'bob' })
    localStorage.setItem(userKey, other)
    window.dispatchEvent(new StorageEvent('storage', { key: userKey, oldValue: after, newValue: other }))
    expect(auth.getAuthSessionScope()).not.toBe(initial)
    expect(changed).toHaveBeenCalledTimes(1)
    unsubscribe()
  })
  it('rotates same-account login sessions while preserving the scope during token refresh', async () => {
    const auth = await import('../src/services/auth')
    const changed = vi.fn()
    const unsubscribe = auth.subscribeAuthSession(changed)
    fetchMock.mockResolvedValue(response({ access: jwt(), refresh: 'refresh-old', user }))
    await auth.login('alice', 'password')
    const first = auth.getAuthSessionScope()
    fetchMock.mockResolvedValue(response({ access: jwt(7200), refresh: 'refresh-new' }))
    await auth.refreshAccessToken()
    expect(auth.getAuthSessionScope()).toBe(first)
    fetchMock.mockResolvedValue(response({ access: jwt(), refresh: 'refresh-old', user }))
    await auth.login('alice', 'password')
    expect(auth.getAuthSessionScope()).not.toBe(first)
    expect(changed).toHaveBeenCalledTimes(2)
    unsubscribe()
  })
  it.each(['login', 'register'] as const)('falls back to a generic %s message when the server sends no error field', async (method) => {
    const auth = await import('../src/services/auth')
    fetchMock.mockResolvedValue(response({}, 400))
    const run = () => method === 'login' ? auth.login('alice', 'x') : auth.register({ username: 'alice', password: 'x' })
    expect(await run()).toMatchObject({ success: false, error: method === 'login' ? '登录失败' : '注册失败' })
  })
})

describe('JWT parsing and refresh scheduling', () => {
  // Fake-timer internals schedule their own short timeouts; only long-lived auth schedules matter.
  const longDelays = () => vi.mocked(setTimeout).mock.calls
    .map(call => call[1] as number)
    .filter(delay => typeof delay === 'number' && delay >= 30000)

  it('skips refresh scheduling when the stored token cannot be parsed', async () => {
    const auth = await import('../src/services/auth')
    fetchMock.mockResolvedValue(response({ access: 'garbage-without-segments', refresh: 'r', user }))
    expect(await auth.login('alice', 'password')).toEqual({ success: true })
    expect(auth.getAccessToken()).toBe('garbage-without-segments')
    expect(longDelays()).toEqual([])
  })

  it('skips refresh scheduling when the token payload carries no expiry', async () => {
    const auth = await import('../src/services/auth')
    fetchMock.mockResolvedValue(response({ access: jwtWithoutExp, refresh: 'r', user }))
    expect(await auth.login('alice', 'password')).toEqual({ success: true })
    expect(longDelays()).toEqual([])
    // initAuth treats the token as valid and falls through to the user restore.
    fetchMock.mockResolvedValue(response(user))
    expect(await auth.initAuth()).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/user/me'), expect.anything())
  })

  it('refreshes immediately when the issued token is already within the refresh window', async () => {
    const auth = await import('../src/services/auth')
    const rotated = jwt(3600)
    fetchMock.mockResolvedValue(response({ access: rotated }))
    fetchMock.mockResolvedValueOnce(response({ access: jwt(-60), refresh: 'r', user }))
    expect(await auth.login('alice', 'password')).toEqual({ success: true })
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toContain('/auth/token/refresh')
    expect(auth.getAccessToken()).toBe(rotated)
    // The rotated token is far from expiring, so the next refresh is scheduled ahead of time.
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 3300000)
  })

  it('retries a failed scheduled refresh from the timer callback', async () => {
    const auth = await import('../src/services/auth')
    fetchMock.mockResolvedValueOnce(response({ access: jwt(400), refresh: 'r', user }))
    await auth.login('alice', 'password')
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 100000)
    fetchMock.mockResolvedValue(response({}, 503))
    await vi.advanceTimersByTimeAsync(100000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // The retry timer replaces the failed refresh schedule.
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 30000)
    const recovered = jwt(3600)
    fetchMock.mockResolvedValue(response({ access: recovered }))
    await vi.advanceTimersByTimeAsync(30000)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(auth.getAccessToken()).toBe(recovered)
  })

  it('ignores a late network failure after the account changed underneath', async () => {
    seed(); const auth = await import('../src/services/auth')
    let rejectRefresh!: (reason: Error) => void
    fetchMock.mockImplementationOnce(() => new Promise((_, reject) => { rejectRefresh = reject }))
    const pending = auth.refreshAccessToken()
    localStorage.setItem(refreshKey, 'new-refresh')
    rejectRefresh(new Error('offline'))
    expect(await pending).toBe(false)
    expect(setTimeout).not.toHaveBeenCalledWith(expect.any(Function), 30000)
    expect(localStorage.getItem(refreshKey)).toBe('new-refresh')
  })
})

describe('parent application bridges', () => {
  it('prefers the token handed over through wujie props', async () => {
    window.__POWERED_BY_WUJIE__ = true
    window.__WUJIE = { props: { getToken: () => 'parent-token' } }
    const auth = await import('../src/services/auth')
    expect(auth.getAccessToken()).toBe('parent-token')
    expect(auth.isAuthenticated()).toBe(true)
  })

  it('falls back to the auth bridge when props provide no token', async () => {
    window.__POWERED_BY_WUJIE__ = true
    window.__WUJIE = { props: { getToken: () => '' } }
    window.__AUTH_BRIDGE__ = { getToken: () => 'bridge-token' }
    const auth = await import('../src/services/auth')
    expect(auth.getAccessToken()).toBe('bridge-token')
  })

  it('reads user info from wujie props during init', async () => {
    window.__POWERED_BY_WUJIE__ = true
    window.__WUJIE = { props: { getToken: () => jwt(), getUserInfo: async () => user } }
    const auth = await import('../src/services/auth')
    expect(await auth.initAuth()).toBe(true)
    expect(auth.getCurrentUser()).toEqual(user)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('restores the user from the auth bridge inside getUserInfo', async () => {
    window.__POWERED_BY_WUJIE__ = true
    window.__AUTH_BRIDGE__ = { getUserInfo: async () => user }
    const auth = await import('../src/services/auth')
    expect(await auth.getUserInfo()).toEqual(user)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await auth.getUserInfo()).toEqual(user) // served from the module cache
  })

  it('survives throwing bridges and falls back to the backend', async () => {
    seed(); // the backend fallback still needs a locally stored token
    window.__POWERED_BY_WUJIE__ = true
    window.__WUJIE = { props: { getUserInfo: async () => { throw new Error('bridge down') } } }
    window.__AUTH_BRIDGE__ = { getUserInfo: async () => { throw new Error('bridge down') } }
    const auth = await import('../src/services/auth')
    fetchMock.mockResolvedValue(response(user))
    expect(await auth.getUserInfo()).toEqual(user)
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/user/me'), expect.anything())
  })

  it('returns null from getUserInfo when no credentials remain', async () => {
    const auth = await import('../src/services/auth')
    expect(await auth.getUserInfo()).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('falls back to the backend when parent bridges report no user', async () => {
    seed()
    window.__POWERED_BY_WUJIE__ = true
    window.__WUJIE = { props: { getUserInfo: async () => null } }
    const auth = await import('../src/services/auth')
    fetchMock.mockResolvedValue(response(user))
    expect(await auth.getUserInfo()).toEqual(user)
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/user/me'), expect.anything())
  })

  it('swallows backend errors while fetching the current user', async () => {
    seed(); const auth = await import('../src/services/auth')
    fetchMock.mockRejectedValue(new Error('offline'))
    expect(await auth.getUserInfo()).toBeNull()
  })
})

describe('initAuth with an expired token', () => {
  function seedExpired(userValue: string | null) {
    localStorage.setItem(accessKey, jwt(-60))
    localStorage.setItem(refreshKey, 'refresh-expired')
    if (userValue !== null) localStorage.setItem(userKey, userValue)
  }

  it('keeps the cached user when the refresh cannot reach the server', async () => {
    seedExpired(JSON.stringify(user))
    const auth = await import('../src/services/auth')
    fetchMock.mockRejectedValue(new Error('offline'))
    expect(await auth.initAuth()).toBe(true)
    expect(auth.getCurrentUser()).toEqual(user)
  })

  it('treats a corrupt cached user as signed out', async () => {
    seedExpired('{broken json')
    const auth = await import('../src/services/auth')
    fetchMock.mockRejectedValue(new Error('offline'))
    expect(await auth.initAuth()).toBe(false)
  })

  it('returns false when no cached user exists either', async () => {
    seedExpired(null)
    const auth = await import('../src/services/auth')
    fetchMock.mockRejectedValue(new Error('offline'))
    expect(await auth.initAuth()).toBe(false)
  })
})

describe('initAuth robustness', () => {
  it.each(['initAuth', 'getUserInfo'] as const)('ignores a late me response from %s after another login', async method => {
    seed(); const auth = await import('../src/services/auth')
    let finish!: (value: ReturnType<typeof response>) => void
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const pending = auth[method]()
    const newerUser = { ...user, id: 2, username: 'bob' }
    fetchMock.mockResolvedValueOnce(response({ access: jwt(), refresh: 'refresh-new', user: newerUser }))
    await auth.login('bob', 'password')
    finish(response(user))
    await pending
    expect(auth.getCurrentUser()).toEqual(newerUser)
    expect(JSON.parse(localStorage.getItem(userKey)!)).toEqual(newerUser)
    expect(localStorage.getItem(refreshKey)).toBe('refresh-new')
  })

  it('ignores an old me body that finishes parsing after logout', async () => {
    seed(); const auth = await import('../src/services/auth')
    let finish!: (value: typeof user) => void
    const oldResponse = response(user)
    oldResponse.json.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    fetchMock.mockResolvedValueOnce(oldResponse).mockResolvedValueOnce(response({}))
    const pending = auth.initAuth()
    await Promise.resolve()
    await auth.logout()
    finish(user)
    expect(await pending).toBe(false)
    expect(auth.getCurrentUser()).toBeNull()
    expect(localStorage.getItem(userKey)).toBeNull()
  })

  it.each(['initAuth', 'getUserInfo'] as const)('ignores a late host user from %s after another login', async method => {
    seed(); const auth = await import('../src/services/auth')
    let finish!: (value: typeof user) => void
    window.__POWERED_BY_WUJIE__ = true
    window.__WUJIE = { props: { getUserInfo: () => new Promise(resolve => { finish = resolve }) } }
    const pending = auth[method]()
    const newerUser = { ...user, id: 2, username: 'bob' }
    fetchMock.mockResolvedValueOnce(response({ access: jwt(), refresh: 'refresh-new', user: newerUser }))
    await auth.login('bob', 'password')
    finish(user)
    await pending
    expect(auth.getCurrentUser()).toEqual(newerUser)
    expect(JSON.parse(localStorage.getItem(userKey)!)).toEqual(newerUser)
  })

  it('returns false when local storage itself fails', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('quota exceeded') })
    const auth = await import('../src/services/auth')
    expect(await auth.initAuth()).toBe(false)
    expect(await auth.getUserInfo()).toBeNull()
  })
})

describe('logout', () => {
  it('does not clear or redirect a newer login when an old blacklist request finishes', async () => {
    seed(); const auth = await import('../src/services/auth')
    let finish!: (value: ReturnType<typeof response>) => void
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const pending = auth.logout()
    const newerUser = { ...user, id: 2, username: 'bob' }
    fetchMock.mockResolvedValueOnce(response({ access: jwt(), refresh: 'refresh-new', user: newerUser }))
    await auth.login('bob', 'password')
    const currentScope = auth.getAuthSessionScope()
    finish(response({}))
    await pending
    expect(auth.getCurrentUser()).toEqual(newerUser)
    expect(localStorage.getItem(refreshKey)).toBe('refresh-new')
    expect(auth.getAuthSessionScope()).toBe(currentScope)
    expect(navigatedTo).toBeUndefined()
  })

  it('blacklists the refresh token, clears local state and redirects to the login page', async () => {
    seed(); const auth = await import('../src/services/auth')
    fetchMock.mockResolvedValue(response({}))
    await auth.logout()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain('/auth/token/blacklist')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ refresh: 'refresh-old' })
    expect(auth.getAccessToken()).toBeNull()
    expect(auth.getCurrentUser()).toBeNull()
    expect(navigatedTo).toBe('/login')
  })

  it('skips the blacklist call when no refresh token is stored', async () => {
    const auth = await import('../src/services/auth')
    await auth.logout()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(navigatedTo).toBe('/login')
  })

  it('still signs out locally when the blacklist request fails', async () => {
    seed(); const auth = await import('../src/services/auth')
    fetchMock.mockRejectedValue(new Error('offline'))
    await auth.logout()
    expect(auth.getAccessToken()).toBeNull()
    expect(navigatedTo).toBe('/login')
  })
})

describe('password verification', () => {
  it('prefers the server error message over the generic mismatch text', async () => {
    seed(); const auth = await import('../src/services/auth')
    fetchMock.mockResolvedValueOnce(response(user)); await auth.initAuth()
    fetchMock.mockResolvedValueOnce(response({ error: '密码不匹配' }, 400))
    expect(await auth.verifyPassword('wrong')).toMatchObject({ success: false, error: '密码不匹配' })
  })

  it('distinguishes rate limits, generic mismatches and network failures', async () => {
    seed(); const auth = await import('../src/services/auth')
    fetchMock.mockResolvedValueOnce(response(user)); await auth.initAuth()
    fetchMock.mockResolvedValueOnce(response({}, 429))
    expect(await auth.verifyPassword('again')).toMatchObject({ success: false, error: '请求过于频繁，请稍后重试' })
    fetchMock.mockResolvedValueOnce(response({}, 400))
    expect(await auth.verifyPassword('wrong')).toMatchObject({ success: false, error: '密码错误' })
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    expect(await auth.verifyPassword('offline')).toMatchObject({ success: false, error: '网络错误，请稍后重试' })
  })
})
