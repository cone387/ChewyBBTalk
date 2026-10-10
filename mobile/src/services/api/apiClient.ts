import { apiErrorMessage } from '../apiErrorMessage';
/**
 * API Client (React Native 版)
 * 与 Web 版逻辑一致，但 getAccessToken 是异步的
 */
import { getAccessToken, refreshAccessToken } from '../auth';
import { getApiBaseUrl } from '../../config';
import { getSession, isCurrentSession } from '../session';

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string, public current?: unknown) { super(message); }
}

class ApiClient {
  private getBaseUrl(): string {
    return getApiBaseUrl();
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const session = getSession();
    const baseUrl = this.getBaseUrl();
    const assertSession = () => {
      if (!isCurrentSession(session) || baseUrl !== this.getBaseUrl()) throw new Error('会话已改变，请重新操作');
    };
    const assertNotAborted = () => {
      if (options.signal?.aborted) throw Object.assign(new Error('请求已取消'), { name: 'AbortError' });
    };
    assertNotAborted();
    const token = await getAccessToken();
    assertNotAborted();
    assertSession();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const fetchAttempt = async (): Promise<Response> => {
      assertNotAborted();
      const controller = new AbortController();
      const abort = () => controller.abort();
      options.signal?.addEventListener('abort', abort, { once: true });
      const timeoutId = setTimeout(abort, 15000);
      try {
        return await fetch(`${baseUrl}${endpoint}`, { ...options, headers, signal: controller.signal });
      } catch (error: any) {
        assertNotAborted();
        if (error.name === 'AbortError') throw new Error('请求超时，请检查网络连接');
        throw new Error('网络连接失败，请检查网络设置');
      } finally {
        clearTimeout(timeoutId);
        options.signal?.removeEventListener('abort', abort);
      }
    };
    let response = await fetchAttempt();
    assertNotAborted();

    assertSession();
    // 401 -> 尝试刷新 token
    if (response.status === 401) {
      if (endpoint.includes('/auth/token')) {
        throw new Error('用户名或密码错误');
      }

      try {
        const success = await refreshAccessToken();
        assertSession();
        if (success) {
          const newToken = await getAccessToken();
          assertSession();
          if (newToken) {
            headers['Authorization'] = `Bearer ${newToken}`;
            response = await fetchAttempt();
          }
        } else {
          // refresh 失败但不一定是 token 过期（可能是网络问题）
          // refreshAccessToken 内部只在 401/403 时才 clearAuth
          throw new Error('会话刷新失败，请稍后重试');
        }
      } catch (error) {
        assertNotAborted();
        if ((error as Error).message === '网络连接失败，请检查网络设置' ||
            (error as Error).message === '会话刷新失败，请稍后重试') {
          throw error;
        }
        throw new Error('认证失败，请重新登录');
      }
    }

    assertSession();
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const serverMessage = apiErrorMessage(errorData, `服务器错误 (${response.status})，请稍后重试`);
      assertSession();
      throw new ApiError(serverMessage || `服务器错误 (${response.status})，请稍后重试`, response.status, errorData.code, errorData.current);
    }

    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return undefined as T;
    }

    const data = await response.json();
    assertNotAborted();
    assertSession();
    return data;
  }

  async get<T>(endpoint: string, params?: Record<string, any>, options?: { signal?: AbortSignal }): Promise<T> {
    let url = endpoint;
    if (params) {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        const values = Array.isArray(value) ? value : [value];
        for (const item of values) {
          if (item !== undefined && item !== null && item !== '') query.append(key, String(item));
        }
      }
      if (query.size > 0) url = `${endpoint}${endpoint.includes('?') ? '&' : '?'}${query}`;
    }
    return this.request<T>(url, { method: 'GET', ...options });
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
}

export const apiClient = new ApiClient();
