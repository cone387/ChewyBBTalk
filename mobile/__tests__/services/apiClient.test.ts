jest.mock('../../src/services/auth', () => ({ getAccessToken: jest.fn(), refreshAccessToken: jest.fn() }));
jest.mock('../../src/config', () => ({ getApiBaseUrl: jest.fn() }));

import { getAccessToken, refreshAccessToken } from '../../src/services/auth';
import { getApiBaseUrl } from '../../src/config';
import { setSession, clearSession } from '../../src/services/session';
import { apiClient, ApiError } from '../../src/services/api/apiClient';

const originalFetch = global.fetch;
const fetchMock = jest.fn();
function response(status = 200, data: unknown = { id: 1 }, length: string | null = null) {
  return { status, ok: status >= 200 && status < 300, headers: { get: () => length }, json: jest.fn().mockResolvedValue(data) };
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.resetAllMocks();
  global.fetch = fetchMock;
  setSession('https://example.com', 'alice');
  (getApiBaseUrl as jest.Mock).mockReturnValue('https://example.com');
  (getAccessToken as jest.Mock).mockResolvedValue('access');
  (refreshAccessToken as jest.Mock).mockResolvedValue(true);
  fetchMock.mockResolvedValue(response());
});
afterEach(() => { global.fetch = originalFetch; jest.useRealTimers(); });

it('encodes query values while preserving zero and false, omitting only empty values', async () => {
  expect(await apiClient.get('/items/', { q: 'a b&c', zero: 0, flag: false, missing: undefined, nil: null, blank: '' })).toEqual({ id: 1 });
  expect(fetchMock).toHaveBeenCalledWith('https://example.com/items/?q=a+b%26c&zero=0&flag=false', expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ Authorization: 'Bearer access' }) }));
  expect(jest.getTimerCount()).toBe(0);
});

it('omits authorization when no token is available and sends no empty query suffix', async () => {
  (getAccessToken as jest.Mock).mockResolvedValue(null);
  await apiClient.get('/items/', { q: '' });
  expect(fetchMock.mock.calls[0][0]).toBe('https://example.com/items/');
  expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
});

it('encodes tag arrays as repeated query parameters', async () => {
  await apiClient.get('/items', { tags: ['work', 'home'], empty: [] });
  expect(fetchMock.mock.calls[0][0]).toBe('https://example.com/items?tags=work&tags=home');
});

it('renders FastAPI validation locations and messages', async () => {
  fetchMock.mockResolvedValue(response(422, { detail: [{ loc: ['body', 'tags', 0], msg: 'String should have at most 50 characters', type: 'string_too_long' }] }));
  await expect(apiClient.post('/items', {})).rejects.toMatchObject({ status: 422, message: 'tags.0: String should have at most 50 characters' });
});

it.each(['post', 'patch'] as const)('sends %s JSON and caller headers', async (method) => {
  await apiClient[method]('/items/', { content: 'hello' }, { 'If-Match': 'revision-1' });
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: method.toUpperCase(), body: '{"content":"hello"}', headers: { 'If-Match': 'revision-1', 'Content-Type': 'application/json' } });
});

it.each(['post', 'patch', 'delete'] as const)('handles an empty %s response without parsing JSON', async (method) => {
  const res = response(204);
  fetchMock.mockResolvedValue(res);
  expect(await apiClient[method]('/items/')).toBeUndefined();
  expect(res.json).not.toHaveBeenCalled();
});

it('does not parse a zero-length response', async () => {
  const res = response(200, undefined, '0');
  fetchMock.mockResolvedValue(res);
  expect(await apiClient.get('/items/')).toBeUndefined();
  expect(res.json).not.toHaveBeenCalled();
});

it('refreshes once on 401 and retries with the new token', async () => {
  fetchMock.mockResolvedValueOnce(response(401));
  (getAccessToken as jest.Mock).mockResolvedValueOnce('old').mockResolvedValue('new');
  expect(await apiClient.get('/items/')).toEqual({ id: 1 });
  expect(refreshAccessToken).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer new');
});

it('does not refresh failed login requests', async () => {
  fetchMock.mockResolvedValue(response(401));
  await expect(apiClient.post('/auth/token/', { password: 'bad' })).rejects.toThrow('用户名或密码错误');
  expect(refreshAccessToken).not.toHaveBeenCalled();
});

it('retains a retryable refresh error rather than retrying indefinitely', async () => {
  fetchMock.mockResolvedValue(response(401));
  (refreshAccessToken as jest.Mock).mockResolvedValue(false);
  await expect(apiClient.get('/items/')).rejects.toThrow('会话刷新失败');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('reports unexpected refresh failures as authentication errors', async () => {
  fetchMock.mockResolvedValue(response(401));
  (refreshAccessToken as jest.Mock).mockRejectedValue(new Error('invalid token'));
  await expect(apiClient.get('/items/')).rejects.toThrow('认证失败');
});

it('does not retry when refresh succeeds without an access token', async () => {
  fetchMock.mockResolvedValue(response(401));
  (getAccessToken as jest.Mock).mockResolvedValueOnce('old').mockResolvedValue(null);
  await expect(apiClient.get('/items/')).rejects.toMatchObject({ status: 401 });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('reports a network failure on the refreshed request', async () => {
  fetchMock.mockResolvedValueOnce(response(401)).mockRejectedValueOnce(new Error('offline'));
  await expect(apiClient.get('/items/')).rejects.toThrow('网络连接失败');
});

it.each(['error', 'message'])('preserves structured server %s and conflict metadata', async (field) => {
  fetchMock.mockResolvedValue(response(409, { [field]: 'changed remotely', code: 'conflict', current: { revision: 2 } }));
  await expect(apiClient.patch('/items/', {})).rejects.toMatchObject({ message: 'changed remotely', status: 409, code: 'conflict', current: { revision: 2 } });
});

it('falls back to status when the error body is not JSON', async () => {
  const res = response(502);
  res.json.mockRejectedValue(new Error('html'));
  fetchMock.mockResolvedValue(res);
  await expect(apiClient.get('/items/')).rejects.toThrow('502');
});

it('aborts at the request deadline and cleans up the timeout', async () => {
  fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  }));
  const request = apiClient.get('/items/');
  const assertion = expect(request).rejects.toThrow('请求超时');
  await jest.advanceTimersByTimeAsync(15000);
  await assertion;
  expect(jest.getTimerCount()).toBe(0);
});

it('translates connection failures and removes the deadline timer', async () => {
  fetchMock.mockRejectedValue(new Error('offline'));
  await expect(apiClient.get('/items/')).rejects.toThrow('网络连接失败');
  expect(jest.getTimerCount()).toBe(0);
});

it.each(['token', 'response', 'body', 'server'] as const)('rejects a stale session at the %s boundary', async (boundary) => {
  if (boundary === 'token') (getAccessToken as jest.Mock).mockImplementation(async () => { clearSession(); return 'old'; });
  if (boundary === 'response') fetchMock.mockImplementation(async () => { clearSession(); return response(); });
  if (boundary === 'body') {
    const res = response();
    res.json.mockImplementation(async () => { clearSession(); return { private: true }; });
    fetchMock.mockResolvedValue(res);
  }
  if (boundary === 'server') (getAccessToken as jest.Mock).mockImplementation(async () => { (getApiBaseUrl as jest.Mock).mockReturnValue('https://other.example.com'); return 'old'; });
  await expect(apiClient.get('/items/')).rejects.toThrow('会话已改变');
  if (boundary === 'token' || boundary === 'server') expect(fetchMock).not.toHaveBeenCalled();
});

it('exposes an ApiError as a normal Error for caller recovery', () => {
  const error = new ApiError('failed', 400);
  expect(error).toBeInstanceOf(Error);
  expect(error.status).toBe(400);
});

it('cancels an obsolete GET through its caller signal', async () => {
  fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), { name: 'AbortError' })));
  }));
  const controller = new AbortController();
  const request = apiClient.get('/items', undefined, { signal: controller.signal });
  const rejected = expect(request).rejects.toMatchObject({ name: 'AbortError' });
  await Promise.resolve(); await Promise.resolve(); controller.abort();
  await rejected; expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
});
