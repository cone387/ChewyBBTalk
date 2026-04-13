/**
 * API Client (React Native 版)
 * 与 Web 版逻辑一致，但 getAccessToken 是异步的
 */
import { getAccessToken, refreshAccessToken, logout } from '../auth';
import { getApiBaseUrl } from '../../config';

class ApiClient {
  private getBaseUrl(): string {
    return getApiBaseUrl();
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = await getAccessToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let response: Response;
    try {
      response = await fetch(`${this.getBaseUrl()}${endpoint}`, {
        ...options,
        headers,
      });
    } catch (error) {
      throw new Error('网络连接失败，请检查网络设置');
    }

    // 401 -> 尝试刷新 token
    if (response.status === 401) {
      if (endpoint.includes('/auth/token/')) {
        throw new Error('用户名或密码错误');
      }

      try {
        const success = await refreshAccessToken();
        if (success) {
          const newToken = await getAccessToken();
          if (newToken) {
            headers['Authorization'] = `Bearer ${newToken}`;
            try {
              response = await fetch(`${this.getBaseUrl()}${endpoint}`, {
                ...options,
                headers,
              });
            } catch (error) {
              throw new Error('网络连接失败，请检查网络设置');
            }
          }
        } else {
          await logout();
          throw new Error('会话已过期，请重新登录');
        }
      } catch (error) {
        if ((error as Error).message === '网络连接失败，请检查网络设置' ||
            (error as Error).message === '会话已过期，请重新登录') {
          throw error;
        }
        await logout();
        throw new Error('认证失败，请重新登录');
      }
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const serverMessage = errorData.error || errorData.message;
      throw new Error(serverMessage || `服务器错误 (${response.status})，请稍后重试`);
    }

    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return undefined as T;
    }

    return response.json();
  }

  async get<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    let url = endpoint;
    if (params) {
      const filtered = Object.entries(params)
        .filter(([_, v]) => v !== undefined && v !== null && v !== '')
        .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {});

      if (Object.keys(filtered).length > 0) {
        url = `${endpoint}?${new URLSearchParams(filtered)}`;
      }
    }
    return this.request<T>(url, { method: 'GET' });
  }

  async post<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async patch<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
