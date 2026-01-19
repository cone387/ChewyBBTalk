/**
 * JWT Token 认证服务
 * 
 * 功能：
 * 1. 用户登录/注册
 * 2. Token 存储和管理
 * 3. Token 自动刷新
 * 4. 用户信息管理
 */

import type { User as _User } from '../types';

interface UserInfo {
  id: number;
  username: string;
  email?: string;
  display_name?: string;
  avatar?: string;
  bio?: string;
}

interface LoginResponse {
  access: string;
  refresh: string;
  user: UserInfo;
}

interface RegisterRequest {
  username: string;
  password: string;
  email?: string;
  display_name?: string;
}

// Token 存储 key
const ACCESS_TOKEN_KEY = 'bbtalk_access_token';
const REFRESH_TOKEN_KEY = 'bbtalk_refresh_token';
const USER_INFO_KEY = 'bbtalk_user_info';

let currentUser: UserInfo | null = null;
let refreshTimer: NodeJS.Timeout | null = null;

/**
 * 获取 API 基础 URL
 */
function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL || '';
}

/**
 * 获取 Access Token
 */
export function getAccessToken(): string | null {
  // 子应用模式：从主应用获取 token
  if (window.__POWERED_BY_WUJIE__) {
    const propsToken = window.__WUJIE?.props?.getToken?.();
    if (propsToken) return propsToken;
    
    if (window.__AUTH_BRIDGE__?.getToken) {
      const token = window.__AUTH_BRIDGE__.getToken();
      if (token) return token;
    }
  }
  
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

/**
 * 获取 Refresh Token
 */
function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

/**
 * 存储 tokens 和用户信息
 */
function storeAuth(response: LoginResponse): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, response.access);
  localStorage.setItem(REFRESH_TOKEN_KEY, response.refresh);
  localStorage.setItem(USER_INFO_KEY, JSON.stringify(response.user));
  currentUser = response.user;
  
  // 启动自动刷新
  startTokenRefresh();
}

/**
 * 清除认证信息
 */
function clearAuth(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_INFO_KEY);
  currentUser = null;
  
  // 停止自动刷新
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

/**
 * 解析 JWT Token 获取过期时间
 */
function parseJwt(token: string): { exp: number } | null {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('[Auth] 解析 JWT 失败:', error);
    return null;
  }
}

/**
 * 刷新 Access Token
 */
async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    console.error('[Auth] 没有 refresh token');
    return false;
  }
  
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/v1/bbtalk/auth/token/refresh/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh: refreshToken }),
    });
    
    if (response.ok) {
      const data = await response.json();
      localStorage.setItem(ACCESS_TOKEN_KEY, data.access);
      
      // 如果返回了新的 refresh token，也更新它
      if (data.refresh) {
        localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh);
      }
      
      console.log('[Auth] Token 刷新成功');
      
      // 重新启动自动刷新定时器
      startTokenRefresh();
      return true;
    } else {
      console.error('[Auth] Token 刷新失败:', response.status);
      // Token 刷新失败，清除认证信息
      clearAuth();
      return false;
    }
  } catch (error) {
    console.error('[Auth] Token 刷新错误:', error);
    clearAuth();
    return false;
  }
}

/**
 * 启动 Token 自动刷新定时器
 * 在 token 过期前 5 分钟自动刷新
 */
function startTokenRefresh(): void {
  // 清除现有定时器
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }
  
  const accessToken = getAccessToken();
  if (!accessToken) return;
  
  const payload = parseJwt(accessToken);
  if (!payload || !payload.exp) return;
  
  // 计算到期时间（毫秒）
  const expiresAt = payload.exp * 1000;
  const now = Date.now();
  
  // 提前 5 分钟刷新（300秒）
  const refreshAt = expiresAt - 5 * 60 * 1000;
  const delay = refreshAt - now;
  
  if (delay > 0) {
    console.log(`[Auth] Token 将在 ${Math.round(delay / 1000 / 60)} 分钟后刷新`);
    refreshTimer = setTimeout(() => {
      refreshAccessToken();
    }, delay);
  } else {
    // Token 已经快过期了，立即刷新
    console.log('[Auth] Token 即将过期，立即刷新');
    refreshAccessToken();
  }
}

/**
 * 用户登录
 */
export async function login(username: string, password: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/v1/bbtalk/auth/token/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });
    
    if (response.ok) {
      const data: LoginResponse = await response.json();
      storeAuth(data);
      console.log('[Auth] 登录成功');
      return { success: true };
    } else {
      // 增加 JSON 解析错误处理
      const errorData = await response.json().catch(() => ({ error: `请求失败: ${response.status}` }));
      return { success: false, error: errorData.error || '登录失败' };
    }
  } catch (error) {
    console.error('[Auth] 登录错误:', error);
    return { success: false, error: '网络错误，请稍后重试' };
  }
}

/**
 * 用户注册
 */
export async function register(data: RegisterRequest): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/v1/bbtalk/auth/register/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    
    if (response.ok) {
      const responseData: LoginResponse = await response.json();
      storeAuth(responseData);
      console.log('[Auth] 注册成功');
      return { success: true };
    } else {
      // 增加 JSON 解析错误处理
      const errorData = await response.json().catch(() => ({ error: `注册失败: ${response.status}` }));
      return { success: false, error: errorData.error || '注册失败' };
    }
  } catch (error) {
    console.error('[Auth] 注册错误:', error);
    return { success: false, error: '网络错误，请稍后重试' };
  }
}

/**
 * 初始化认证（检查用户是否已认证）
 */
export async function initAuth(): Promise<boolean> {
  try {
    // 检查是否有 access token
    const accessToken = getAccessToken();
    if (!accessToken) {
      return false;
    }
    
    // 检查 token 是否过期
    const payload = parseJwt(accessToken);
    if (payload && payload.exp) {
      const now = Date.now() / 1000;
      if (payload.exp < now) {
        // Token 已过期，尝试刷新
        console.log('[Auth] Token 已过期，尝试刷新');
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
          return false;
        }
      } else {
        // Token 有效，启动自动刷新
        startTokenRefresh();
      }
    }
    
    // 如果是子应用，从主应用获取用户信息
    if (window.__POWERED_BY_WUJIE__) {
      const userInfo = await getUserInfoFromParent();
      if (userInfo) {
        currentUser = userInfo;
        return true;
      }
    }
    
    // 尝试从 localStorage 恢复用户信息
    const savedUser = localStorage.getItem(USER_INFO_KEY);
    if (savedUser) {
      try {
        currentUser = JSON.parse(savedUser);
      } catch (error) {
        console.error('[Auth] 解析用户信息失败:', error);
      }
    }
    
    // 获取最新用户信息
    const userInfo = await fetchCurrentUser();
    if (userInfo) {
      currentUser = userInfo;
      localStorage.setItem(USER_INFO_KEY, JSON.stringify(userInfo));
      return true;
    }
    
    // Token 无效，清除认证
    clearAuth();
    return false;
  } catch (error) {
    console.error('[Auth] 初始化失败:', error);
    return false;
  }
}

/**
 * 从主应用获取用户信息
 */
async function getUserInfoFromParent(): Promise<UserInfo | null> {
  try {
    // 尝试从 wujie props 获取
    if (window.__WUJIE?.props?.getUserInfo) {
      const userInfo = await window.__WUJIE.props.getUserInfo();
      if (userInfo) return userInfo;
    }
    
    // 尝试从 __AUTH_BRIDGE__ 获取
    if (window.__AUTH_BRIDGE__?.getUserInfo) {
      const userInfo = await window.__AUTH_BRIDGE__.getUserInfo();
      if (userInfo) return userInfo;
    }
    
    return null;
  } catch (error) {
    console.error('[Auth] 获取主应用用户信息失败:', error);
    return null;
  }
}

/**
 * 获取当前用户信息（从后端 API）
 */
async function fetchCurrentUser(): Promise<UserInfo | null> {
  try {
    const token = getAccessToken();
    if (!token) return null;
    
    const response = await fetch(`${getApiBaseUrl()}/api/v1/bbtalk/user/me/`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        id: data.id,
        username: data.username,
        email: data.email,
        display_name: data.display_name,
        avatar: data.avatar,
        bio: data.bio,
      };
    }
    
    return null;
  } catch (error) {
    console.error('[Auth] 获取用户信息失败:', error);
    return null;
  }
}

/**
 * 获取当前用户
 */
export function getCurrentUser(): UserInfo | null {
  return currentUser;
}

/**
 * 获取用户信息
 */
export async function getUserInfo(): Promise<UserInfo | null> {
  if (currentUser) {
    return currentUser;
  }
  
  // 如果是子应用，尝试从主应用获取
  if (window.__POWERED_BY_WUJIE__) {
    const userInfo = await getUserInfoFromParent();
    if (userInfo) {
      currentUser = userInfo;
      return userInfo;
    }
  }
  
  // 尝试从后端获取
  const userInfo = await fetchCurrentUser();
  if (userInfo) {
    currentUser = userInfo;
  }
  
  return userInfo;
}

/**
 * 登出
 */
export async function logout(): Promise<void> {
  const refreshToken = getRefreshToken();
  
  // 如果有 refresh token，将其加入黑名单
  if (refreshToken) {
    try {
      const accessToken = getAccessToken();
      await fetch(`${getApiBaseUrl()}/api/v1/bbtalk/auth/token/blacklist/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh: refreshToken }),
      });
    } catch (error) {
      console.error('[Auth] Token 黑名单失败:', error);
    }
  }
  
  // 清除本地认证信息
  clearAuth();
  
  // 重定向到登录页
  window.location.href = '/login';
}

/**
 * 检查是否已认证
 */
export function isAuthenticated(): boolean {
  return getAccessToken() !== null;
}

/**
 * 处理回调（兼容旧代码，实际不再使用）
 */
export async function handleCallback(_code: string, _state: string): Promise<boolean> {
  console.warn('[Auth] handleCallback 已废弃，使用 JWT Token 认证');
  return false;
}

/**
 * 验证用户密码（用于防窥解锁）
 */
export async function verifyPassword(password: string): Promise<{ success: boolean; error?: string }> {
  try {
    const user = getCurrentUser();
    if (!user) {
      return { success: false, error: '用户未登录' };
    }
    
    // 使用登录 API 验证密码
    const response = await fetch(`${getApiBaseUrl()}/api/v1/bbtalk/auth/token/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username: user.username, password }),
    });
    
    if (response.ok) {
      // 密码正确，更新 token
      const data: LoginResponse = await response.json();
      storeAuth(data);
      return { success: true };
    } else {
      return { success: false, error: '密码错误' };
    }
  } catch (error) {
    console.error('[Auth] 密码验证错误:', error);
    return { success: false, error: '网络错误，请稍后重试' };
  }
}
