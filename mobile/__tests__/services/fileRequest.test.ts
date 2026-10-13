jest.mock('../../src/services/auth', () => ({ getAccessToken: jest.fn(), refreshAccessToken: jest.fn() }));
jest.mock('../../src/config', () => ({ getApiBaseUrl: () => 'https://api.test' }));
import { getAccessToken, refreshAccessToken } from '../../src/services/auth';
import { createFileRequest } from '../../src/services/fileRequest';
import { setSession, clearSession } from '../../src/services/session';

const fetchMock = jest.fn();
const originalFetch = global.fetch;
const response = (status = 200, data: any = { done: true }) => ({ status, ok: status < 300, json: jest.fn().mockResolvedValue(data) });
beforeEach(() => {
  jest.useFakeTimers(); jest.resetAllMocks(); global.fetch = fetchMock;
  setSession('https://api.test', 'alice');
  (getAccessToken as jest.Mock).mockResolvedValue('old');
  (refreshAccessToken as jest.Mock).mockResolvedValue(true);
  fetchMock.mockResolvedValue(response());
});
afterEach(() => { global.fetch = originalFetch; jest.useRealTimers(); });

it('replays identical multipart only once after 401 with the fresh token', async () => {
  const body = new FormData(); body.append('file', 'same');
  fetchMock.mockResolvedValueOnce(response(401));
  (getAccessToken as jest.Mock).mockResolvedValueOnce('old').mockResolvedValue('fresh');
  expect(await createFileRequest().request('/upload', { method: 'POST', body }, r => r.json())).toEqual({ done: true });
  expect(refreshAccessToken).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[1][1]).toMatchObject({ body, headers: { Authorization: 'Bearer fresh' } });
  expect(fetchMock.mock.calls[1][1].headers).not.toHaveProperty('Content-Type');
  expect(jest.getTimerCount()).toBe(0);
});
it('does not loop after a second 401 or retry a server error', async () => {
  fetchMock.mockResolvedValue(response(401, { detail: '登录已失效' }));
  await expect(createFileRequest().request('/upload', {}, r => r.json())).rejects.toThrow('登录已失效');
  expect(fetchMock).toHaveBeenCalledTimes(2);
  fetchMock.mockClear().mockResolvedValue(response(503, { detail: '稍后再试' }));
  await expect(createFileRequest().request('/upload', {}, r => r.json())).rejects.toThrow('稍后再试');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it('renders validation details without raw sensitive input', async () => {
  fetchMock.mockResolvedValue(response(422, { detail: [{ loc: ['body', 'file'], msg: 'invalid', input: 'secret' }] }));
  await expect(createFileRequest().request('/upload', {}, r => r.json())).rejects.toThrow('file: invalid');
});
it('bounds the entire response body read and aborts transport', async () => {
  fetchMock.mockResolvedValue({ ...response(), json: () => new Promise(() => {}) });
  const pending = createFileRequest().request('/upload', {}, r => r.json(), 100);
  const rejected = expect(pending).rejects.toThrow('超时');
  await jest.advanceTimersByTimeAsync(101); await rejected;
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
});
it('cancels an in-flight body when the account changes', async () => {
  fetchMock.mockResolvedValue({ ...response(), json: () => new Promise(() => {}) });
  const pending = createFileRequest().request('/export', {}, r => r.json());
  const rejected = expect(pending).rejects.toThrow('会话已改变');
  await jest.advanceTimersByTimeAsync(0); clearSession(); await rejected;
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
});
it('rejects a stale picker context before sending any request', async () => {
  const context = createFileRequest(); clearSession();
  await expect(context.request('/import', {}, r => r.json())).rejects.toThrow('会话已改变');
  expect(fetchMock).not.toHaveBeenCalled();
});
it('never replays on a network failure', async () => {
  fetchMock.mockRejectedValue(new Error('offline'));
  await expect(createFileRequest().request('/import', { method: 'POST' }, r => r.json())).rejects.toThrow('offline');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
