jest.mock('../../src/config', () => ({ getApiBaseUrl: jest.fn() }));
import { getApiBaseUrl } from '../../src/config';
import { publicAuthRequest } from '../../src/services/passwordRecovery';
const originalFetch = global.fetch, fetchMock = jest.fn();
beforeEach(() => { jest.useFakeTimers(); jest.resetAllMocks(); global.fetch = fetchMock; (getApiBaseUrl as jest.Mock).mockReturnValue('https://example.com'); fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) }); });
afterEach(() => { global.fetch = originalFetch; jest.useRealTimers(); });
it('sends unauthenticated GET policy and JSON POST recovery requests', async () => {
  expect(await publicAuthRequest('policy')).toEqual({ success: true });
  expect(fetchMock.mock.calls[0][1].method).toBe('GET');
  await publicAuthRequest('recovery', { username: 'alice' });
  expect(fetchMock.mock.calls[1][0]).toBe('https://example.com/api/v1/bbtalk/auth/recovery');
  expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'POST', body: '{"username":"alice"}' });
  expect(fetchMock.mock.calls[1][1].headers).not.toHaveProperty('Authorization');
  expect(jest.getTimerCount()).toBe(0);
});
it.each([{ error: 'denied' }, { detail: 'denied' }, { username: ['denied'] }, {}])('surfaces structured or fallback errors for %j', async body => {
  fetchMock.mockResolvedValue({ ok: false, json: async () => body });
  await expect(publicAuthRequest('recovery', {})).rejects.toThrow(Object.keys(body).length ? 'denied' : '请求失败');
  expect(jest.getTimerCount()).toBe(0);
});
it('rejects a response from the previous server', async () => {
  fetchMock.mockImplementation(async () => { (getApiBaseUrl as jest.Mock).mockReturnValue('https://other.example.com'); return { ok: true, json: async () => ({}) }; });
  await expect(publicAuthRequest('policy')).rejects.toThrow('服务已切换');
});
it('aborts a stalled recovery request and permits the user to retry', async () => {
  fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(Object.assign(new Error(), { name: 'AbortError' })))));
  const check = expect(publicAuthRequest('recovery', {})).rejects.toThrow('请求超时');
  await jest.advanceTimersByTimeAsync(15000); await check;
  expect(jest.getTimerCount()).toBe(0);
});
it('does not hide non-timeout connection errors', async () => {
  fetchMock.mockRejectedValue(new Error('offline'));
  await expect(publicAuthRequest('recovery', {})).rejects.toThrow('offline');
});
