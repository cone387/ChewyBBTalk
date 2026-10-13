import { getApiBaseUrl } from '../config';
import { getAccessToken, refreshAccessToken } from './auth';
import { apiErrorMessage } from './apiErrorMessage';
import { getSession, isCurrentSession, onSessionChange } from './session';

/** Capture before opening a picker or reading a file, not after it completes. */
export function createFileRequest() {
  const session = getSession();
  const base = getApiBaseUrl();
  const isCurrent = () => isCurrentSession(session) && base === getApiBaseUrl();
  const assertCurrent = () => {
    if (!isCurrent()) throw new Error('会话已改变，请重新操作');
  };

  async function request<T>(endpoint: string, options: RequestInit, read: (response: Response) => Promise<T>,
    timeoutMs = 120_000, fallback = '文件请求失败', timeoutMessage = '请求超时，请先核对操作结果再重试'): Promise<T> {
    assertCurrent();
    const controller = new AbortController();
    let stopped: Error | undefined;
    let rejectStopped!: (error: Error) => void;
    const interrupted = new Promise<never>((_resolve, reject) => { rejectStopped = reject; });
    const stop = (error: Error) => {
      if (stopped) return;
      stopped = error; rejectStopped(error); controller.abort();
    };
    const check = () => { if (stopped) throw stopped; assertCurrent(); };
    const unsubscribe = onSessionChange(() => stop(new Error('会话已改变，请重新操作')));
    const abort = () => stop(Object.assign(new Error('请求已取消'), { name: 'AbortError' }));
    const timer = setTimeout(() => stop(new Error(timeoutMessage)), timeoutMs);
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    const work = async () => {
      const send = async () => {
        check();
        const token = await getAccessToken();
        check();
        const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
        if (token) headers.Authorization = `Bearer ${token}`;
        return fetch(`${base}${endpoint}`, { ...options, headers, signal: controller.signal });
      };
      let response = await send();
      check();
      if (response.status === 401) {
        const refreshed = await refreshAccessToken();
        check();
        if (!refreshed) throw new Error('会话刷新失败，请稍后重试或重新登录');
        response = await send();
        check();
      }
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        check();
        throw Object.assign(new Error(apiErrorMessage(data, `${fallback} (${response.status})`)), { status: response.status });
      }
      const data = await read(response);
      check();
      return data;
    };
    try { return await Promise.race([interrupted, work()]); }
    finally {
      clearTimeout(timer); unsubscribe();
      options.signal?.removeEventListener('abort', abort);
    }
  }
  return { request, assertCurrent, isCurrent };
}
