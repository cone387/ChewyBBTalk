import { EventEmitter } from 'node:events';
import { store } from './store';
import { readRefreshToken, saveRefreshToken, persistentCredentialsAvailable } from './credentials';
import type { AuthState } from '../shared/ipc-types';

let sessionGeneration = 0;
let accessToken: string | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let refreshPromise: Promise<boolean> | null = null;
let status: AuthState['status'] = 'restoring';
export const authEvents = new EventEmitter();

function payload(token: string) {
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()); } catch { return {}; }
}
export function normalizeServer(value: string): string {
  const url = new URL(value.trim());
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('请输入有效的服务器地址，例如 https://bbtalk.example.com');
  }
  return url.origin;
}
export function getApiUrl(): string { return store.get('auth.apiUrl') || 'https://bbtalk.cone387.top'; }
export function getAuthState(): AuthState {
  return { status, username: store.get('auth.username') || '', apiUrl: getApiUrl(), persistent: persistentCredentialsAvailable() };
}
let lastNotification = '';
function notify(next: AuthState['status']) {
  status = next;
  const state = getAuthState();
  const key = JSON.stringify([state, sessionGeneration]);
  if (key !== lastNotification) { lastNotification = key; authEvents.emit('change', state); }
}
function schedule(delay: number) {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => { void refreshAccessToken(); }, Math.max(30_000, delay));
  refreshTimer.unref?.();
}
export function getSessionGeneration() { return sessionGeneration; }
export function acceptTokens(data: { access: string; refresh: string; username?: string }, apiUrl: string, generation: number): void {
  if (generation !== sessionGeneration) throw new Error('会话已改变，请重新登录');
  const info = payload(data.access);
  if (!info.exp || info.exp * 1000 <= Date.now() || !data.refresh) throw new Error('服务器返回了无效会话');
  store.set('auth.apiUrl', normalizeServer(apiUrl));
  store.set('auth.username', data.username || store.get('auth.username') || '');
  if (info.user_id !== undefined) store.set('auth.userId', String(info.user_id));
  saveRefreshToken(data.refresh);
  accessToken = data.access;
  schedule(info.exp * 1000 - Date.now() - 5 * 60_000);
  notify('authenticated');
}
export function beginLogin(): number {
  sessionGeneration++;
  refreshPromise = null;
  if (refreshTimer) clearTimeout(refreshTimer);
  return sessionGeneration;
}
export async function login(username: string, password: string, apiUrl?: string): Promise<{ ok: boolean; error?: string }> {
  const generation = beginLogin();
  try {
    const url = normalizeServer(apiUrl || getApiUrl());
    const res = await fetch(`${url}/api/v1/bbtalk/auth/token/`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }), signal: AbortSignal.timeout(20_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.detail || `登录失败 (${res.status})`);
    acceptTokens({ ...data, username }, url, generation);
    return { ok: true };
  } catch (error) {
    if (generation === sessionGeneration && readRefreshToken()) schedule(30_000);
    return { ok: false, error: error instanceof Error ? error.message : '登录失败' };
  }
}
export async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  const pending = doRefresh().finally(() => { if (refreshPromise === pending) refreshPromise = null; });
  refreshPromise = pending;
  return pending;
}
async function doRefresh(): Promise<boolean> {
  const token = readRefreshToken();
  if (!token) { notify('signed-out'); return false; }
  const generation = sessionGeneration;
  const apiUrl = getApiUrl();
  const current = () => generation === sessionGeneration && apiUrl === getApiUrl();
  if (!accessToken) notify('restoring');
  try {
    const res = await fetch(`${apiUrl}/api/v1/bbtalk/auth/token/refresh/`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: token }), signal: AbortSignal.timeout(20_000),
    });
    if (!current()) return false;
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) { logout(); notify('expired'); }
      else { schedule(30_000); notify('offline'); }
      return false;
    }
    const data = await res.json();
    if (!current()) return false;
    acceptTokens({ ...data, refresh: data.refresh || token }, apiUrl, generation);
    return true;
  } catch {
    if (current()) { schedule(30_000); notify('offline'); }
    return false;
  }
}
export async function getValidAccessToken(): Promise<string | null> {
  const generation = sessionGeneration;
  if (!accessToken || payload(accessToken).exp * 1000 - Date.now() < 60_000) await refreshAccessToken();
  if (generation !== sessionGeneration || !accessToken || payload(accessToken).exp * 1000 <= Date.now()) return null;
  return accessToken;
}
export function getAccessToken() { return accessToken; }
export function isLoggedIn() { return !!accessToken && payload(accessToken).exp * 1000 > Date.now(); }
export function logout(): void {
  beginLogin(); accessToken = null; saveRefreshToken(); notify('signed-out');
}
export async function tryRestoreSession(): Promise<boolean> { return refreshAccessToken(); }
export function getSubmissionSession(): { scope: string; generation: number; apiUrl: string } | null {
  const userId = accessToken ? payload(accessToken).user_id : store.get('auth.userId');
  if (userId === undefined || userId === null || (!accessToken && !readRefreshToken())) return null;
  const apiUrl = getApiUrl().replace(/\/+$/, '');
  return { scope: JSON.stringify([apiUrl, String(userId)]), generation: sessionGeneration, apiUrl };
}
/** Only API-relative paths receive credentials. Replays stay within one session. */
export async function authenticatedFetch(path: string, init: RequestInit = {}, expectedGeneration = sessionGeneration): Promise<Response> {
  if (!path.startsWith('/api/') || path.startsWith('//')) throw new Error('无效的 API 路径');
  const server = getApiUrl();
  const check = () => { if (expectedGeneration !== sessionGeneration || server !== getApiUrl()) throw new Error('账号或服务器已切换'); };
  let token = await getValidAccessToken(); check();
  if (!token) throw new Error(status === 'offline' ? '当前离线，请联网后重试' : '登录已失效，请重新登录');
  const send = async () => {
    try {
      const response = await fetch(`${server}${path}`, {
        ...init, headers: { ...Object.fromEntries(new Headers(init.headers)), Authorization: `Bearer ${token}` },
        signal: init.signal || AbortSignal.timeout(60_000),
      });
      check();
      if (response.ok) notify('authenticated');
      return response;
    } catch (error) {
      check(); schedule(30_000); notify('offline'); throw error;
    }
  };
  let response = await send(); check();
  if (response.status === 401) {
    if (accessToken !== token || await refreshAccessToken()) {
      check(); token = await getValidAccessToken(); check();
      if (token) response = await send();
    }
  }
  check();
  if (response.status === 401) { logout(); notify('expired'); }
  return response;
}
