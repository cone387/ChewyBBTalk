/**
 * Authelia 认证服务
 * 
 * Authelia 通过反向代理进行认证，前端不需要处理 token
 * - 独立运行：用户未认证时会被重定向到 Authelia 登录页
 * - 子应用模式：从主应用获取用户信息
 */

import type { User as _User } from '../types';

interface UserInfo {
  id: number;
  username: string;
  email?: string;
  displayName?: string;
  avatar?: string;
  groups?: string[];
}

let currentUser: UserInfo | null = null;

/**
 * 获取开发环境的认证请求头
 */
export function getDevAuthHeaders(): Record<string, string> {
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

/**
 * 初始化认证（检查用户是否已认证）
 */
export async function initAuth(): Promise<boolean> {
  try {
    // 如果是子应用，从主应用获取用户信息
    if (window.__POWERED_BY_WUJIE__) {
      const userInfo = await getUserInfoFromParent();
      if (userInfo) {
        currentUser = userInfo;
        return true;
      }
    }
    
    // 独立运行模式：尝试获取当前用户信息
    const userInfo = await fetchCurrentUser();
    if (userInfo) {
      currentUser = userInfo;
      return true;
    }
    
    // 未认证，由 Authelia 反向代理处理重定向
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
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...getDevAuthHeaders(),
    };
    
    const response = await fetch(`${apiBaseUrl}/api/v1/bbtalk/user/me/`, {
      credentials: 'include',
      headers,
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        id: data.id,
        username: data.username,
        email: data.email,
        displayName: data.display_name,
        avatar: data.avatar,
        groups: data.groups,
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
 * 登出（重定向到 Authelia 登出页）
 */
export function logout() {
  const autheliaUrl = import.meta.env.VITE_AUTHELIA_URL || '';
  if (autheliaUrl) {
    window.location.href = `${autheliaUrl}/api/logout`;
  } else {
    // 如果没有配置 Authelia URL，尝试相对路径
    window.location.href = '/api/logout';
  }
}

/**
 * 设置开发环境用户（用于本地测试）
 */
export function setDevUser(userId: string, username: string, email?: string, groups?: string): void {
  localStorage.setItem('dev_user_id', userId);
  localStorage.setItem('dev_username', username);
  if (email) localStorage.setItem('dev_email', email);
  if (groups) localStorage.setItem('dev_groups', groups);
  
  // 清除当前缓存，下次会重新获取
  currentUser = null;
}

/**
 * 清除开发环境用户
 */
export function clearDevUser(): void {
  localStorage.removeItem('dev_user_id');
  localStorage.removeItem('dev_username');
  localStorage.removeItem('dev_email');
  localStorage.removeItem('dev_groups');
  currentUser = null;
}

/**
 * 获取认证 Token（优先级：主应用桥接 > null）
 * 
 * Authelia 通过 cookie 认证，前端不需要显式的 token
 */
export function getAuthToken(): string | null {
  // 如果是子应用，尝试从主应用获取 token
  if (window.__POWERED_BY_WUJIE__) {
    // 从 wujie props 获取
    const propsToken = window.__WUJIE?.props?.getToken?.();
    if (propsToken) return propsToken;
    
    // 从 __AUTH_BRIDGE__ 获取
    if (window.__AUTH_BRIDGE__?.getToken) {
      const token = window.__AUTH_BRIDGE__.getToken();
      if (token) return token;
    }
  }
  
  // Authelia 不使用 token，返回 null
  return null;
}

/**
 * 检查是否已认证
 */
export function isAuthenticated(): boolean {
  return currentUser !== null;
}
