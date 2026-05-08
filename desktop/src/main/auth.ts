/**
 * JWT 认证管理。
 *
 * - access token 保存在主进程内存（不落盘）
 * - refresh token 保存在 electron-store（后续可改 keytar）
 * - 距过期 < 5 分钟自动 refresh
 */
import { store } from './store';

interface TokenPair {
  access: string;
  refresh: string;
}

let accessToken: string | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function parseJwtExp(token: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return payload.exp ?? null;
  } catch {
    return null;
  }
}

function getApiUrl(): string {
  return store.get('auth.apiUrl') ?? 'https://bbtalk.cone387.top';
}

function scheduleRefresh(token: string) {
  if (refreshTimer) clearTimeout(refreshTimer);
  const exp = parseJwtExp(token);
  if (!exp) return;
  const delay = exp * 1000 - Date.now() - 5 * 60 * 1000;
  if (delay > 0) {
    refreshTimer = setTimeout(() => refreshAccessToken(), delay);
  } else {
    refreshAccessToken();
  }
}

export async function login(
  username: string,
  password: string,
  apiUrl?: string,
): Promise<{ ok: boolean; error?: string }> {
  const url = apiUrl || getApiUrl();
  if (apiUrl) store.set('auth.apiUrl', apiUrl);

  try {
    const res = await fetch(`${url}/api/v1/bbtalk/auth/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { ok: false, error: err.error || err.detail || `HTTP ${res.status}` };
    }
    const data: TokenPair & { user?: unknown } = await res.json();
    accessToken = data.access;
    store.set('auth.username', username);
    // 简单存 refresh（后续可改 keytar）
    store.set('auth' as any, { ...store.get('auth'), refreshToken: data.refresh });
    scheduleRefresh(data.access);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : '网络错误' };
  }
}

export async function refreshAccessToken(): Promise<boolean> {
  const auth = store.get('auth') as any;
  const refreshToken = auth?.refreshToken;
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${getApiUrl()}/api/v1/bbtalk/auth/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: refreshToken }),
    });
    if (!res.ok) {
      accessToken = null;
      return false;
    }
    const data = await res.json();
    accessToken = data.access;
    if (data.refresh) {
      store.set('auth' as any, { ...store.get('auth'), refreshToken: data.refresh });
    }
    scheduleRefresh(data.access);
    return true;
  } catch {
    accessToken = null;
    return false;
  }
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function isLoggedIn(): boolean {
  return !!accessToken;
}

export function logout(): void {
  accessToken = null;
  if (refreshTimer) clearTimeout(refreshTimer);
  const auth = store.get('auth') as any;
  if (auth) {
    delete auth.refreshToken;
    store.set('auth', auth);
  }
}

/** 启动时尝试用 refresh token 恢复登录态 */
export async function tryRestoreSession(): Promise<boolean> {
  const auth = store.get('auth') as any;
  if (!auth?.refreshToken) return false;
  return refreshAccessToken();
}
