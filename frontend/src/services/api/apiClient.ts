import { getAuthToken } from '../auth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

/**
 * 获取开发环境的认证请求头
 * 用于本地开发时模拟 Authelia 认证
 */
function getDevAuthHeaders(): Record<string, string> {
  // 开发环境：从环境变量或 localStorage 获取测试用户信息
  const devUserId = import.meta.env.VITE_DEV_USER_ID || localStorage.getItem('dev_user_id');
  const devUsername = import.meta.env.VITE_DEV_USERNAME || localStorage.getItem('dev_username');
  
  if (devUserId && devUsername) {
    return {
      'X-Authelia-User-Id': devUserId,
      'X-Username': devUsername,
      'X-Email': import.meta.env.VITE_DEV_EMAIL || localStorage.getItem('dev_email') || '',
      'X-Groups': import.meta.env.VITE_DEV_GROUPS || localStorage.getItem('dev_groups') || '',
    };
  }
  
  return {};
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = getAuthToken();
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    // Bearer token 认证（wujie 子应用模式）
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    // 开发环境认证头
    const devHeaders = getDevAuthHeaders();
    Object.assign(headers, devHeaders);

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include', // 重要：支持 cookie 认证
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `请求失败: ${response.status}`);
    }

    // 204 No Content 或没有响应体时不解析 JSON
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return undefined as T;
    }

    return response.json();
  }

  async get<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    let url = endpoint;
    if (params) {
      // 过滤掉 undefined 和 null 值
      const filteredParams = Object.entries(params)
        .filter(([_, value]) => value !== undefined && value !== null && value !== '')
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
      
      if (Object.keys(filteredParams).length > 0) {
        url = `${endpoint}?${new URLSearchParams(filteredParams)}`;
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

export const apiClient = new ApiClient(API_BASE_URL);
