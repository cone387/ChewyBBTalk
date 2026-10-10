import { getAuthSessionScope } from '../authSessionScope';
import { apiErrorMessage } from '../apiErrorMessage';
import { getPublicSetting } from '../../config';
import { getAccessToken, getCurrentUser, refreshAccessToken, logout } from '../auth';

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string, public current?: unknown) { super(message); }
}

const API_BASE_URL = getPublicSetting('VITE_API_BASE_URL') || '';

async function fetchResponse(url: string, options: RequestInit): Promise<Response> {
  try { return await fetch(url, options); }
  catch (error) { if (options.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw error; throw new Error('网络连接失败，请检查网络后重试'); }
}

class ApiClient {
  private baseUrl: string;
  private reads = new Map<string, { promise: Promise<unknown>; controller: AbortController; group?: string }>();

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    responseType: 'json' | 'blob' = 'json'
  ): Promise<T> {
    const token = getAccessToken();
    const userId = getCurrentUser()?.id;
    const session = getAuthSessionScope();
    const checkIdentity = () => {
      options.signal?.throwIfAborted();
      if (getCurrentUser()?.id !== userId || session !== getAuthSessionScope()) throw new Error('账号已切换，此请求的结果不再用于当前会话');
    };
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    // Bearer token 认证
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let response = await fetchResponse(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });
    checkIdentity();

    // 处理 401 未认证：尝试刷新 token 或跳转登录
    if (response.status === 401) {
      if (!token) throw new ApiError('此操作需要登录，请登录后重试', 401);
      console.log('[ApiClient] 未认证 (401)，尝试刷新 token...');
      
      // 如果是登录接口报 401，直接抛出错误
      if (endpoint.includes('/auth/token')) {
        throw new Error('用户名或密码错误');
      }

      // 尝试刷新 token 并重试请求
      try {
        const success = await refreshAccessToken();
        checkIdentity();
        
        if (success) {
          const newToken = getAccessToken();
          if (newToken) {
            headers['Authorization'] = `Bearer ${newToken}`;
            response = await fetchResponse(`${this.baseUrl}${endpoint}`, {
              ...options,
              headers,
            });
          }
        } else {
          // 网络故障时 refreshAccessToken 会保留本地登录态并稍后重试；
          // 只有它已清除 access token（refresh token 明确失效）才跳转登录。
          if (!getAccessToken()) {
            console.log('[ApiClient] Refresh token 已失效，重定向到登录页');
            logout();
            throw new Error('会话已过期，请重新登录');
          }
          throw new Error('会话刷新失败，请稍后重试');
        }
      } catch (error) {
        console.error('[ApiClient] Token 刷新过程中出错:', error);
        if (error instanceof Error && (error.message === '会话刷新失败，请稍后重试' || error.message === '会话已过期，请重新登录')) {
          throw error;
        }
        if (!getAccessToken()) {
          logout();
          throw new Error('认证失败，请重新登录');
        }
        throw error;
      }
    }

    checkIdentity();
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      checkIdentity();
      throw new ApiError(apiErrorMessage(errorData, `请求失败: ${response.status}`), response.status, errorData.code, errorData.current);
    }

    // 204 No Content 或没有响应体时不解析 JSON
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return undefined as T;
    }

    const result = responseType === 'blob' ? await response.blob() : await response.json();
    checkIdentity();
    return result as T;
  }

  async get<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    let url = endpoint;
    if (params) {
      // 过滤掉 undefined 和 null 值
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        const values = Array.isArray(value) ? value : [value];
        for (const item of values) {
          if (item !== undefined && item !== null && item !== '') query.append(key, String(item));
        }
      }
      if (query.size > 0) url = `${endpoint}${endpoint.includes('?') ? '&' : '?'}${query}`;
    }
    const scope = `${getAuthSessionScope()}:${getCurrentUser()?.id ?? 'anonymous'}`;
    const key = `${scope}:${url}`;
    const existing = this.reads.get(key);
    if (existing && !existing.controller.signal.aborted) return existing.promise as Promise<T>;
    // Only feed queries supersede each other. Independent detail/settings reads coexist.
    const group = /^\/api\/v1\/bbtalk(?:\/public)?$/.test(endpoint) ? endpoint : undefined;
    if (group) for (const read of this.reads.values()) {
      if (read.group === group) read.controller.abort();
    }
    const controller = new AbortController();
    const promise = this.request<T>(url, { method: 'GET', signal: controller.signal }).finally(() => {
      if (this.reads.get(key)?.promise === promise) this.reads.delete(key);
    });
    this.reads.set(key, { promise, controller, group });
    return promise;
  }

  async post<T>(endpoint: string, data?: any, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async patch<T>(endpoint: string, data?: any, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  async download(endpoint: string, options: RequestInit = {}): Promise<Blob> {
    // Protected blobs are reused by the session-scoped memory cache. A browser
    // URL cache must not bypass authorization after a later account switch.
    return this.request<Blob>(endpoint, { cache: 'no-store', ...options, method: 'GET' }, 'blob');
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
