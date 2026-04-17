/**
 * JWT Token 认证服务 (React Native 版)
 * 原生端用 expo-secure-store，Web 端 fallback 到 localStorage
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBaseUrl } from '../config';
import type { User } from '../types';

// Web 端 SecureStore 不可用，fallback 到 localStorage
const storage = {
  async getItemAsync(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return localStorage.getItem(key);
    return SecureStore.getItemAsync(key);
  },
  async setItemAsync(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') { localStorage.setItem(key, value); return; }
    return SecureStore.setItemAsync(key, value);
  },
  async deleteItemAsync(key: string): Promise<void> {
    if (Platform.OS === 'web') { localStorage.removeItem(key); return; }
    return SecureStore.deleteItemAsync(key);
  },
};

interface LoginResponse {
  access: string;
  refresh: string;
  user: User;
}

const ACCESS_TOKEN_KEY = 'bbtalk_access_token';
const REFRESH_TOKEN_KEY = 'bbtalk_refresh_token';
const USER_INFO_KEY = 'bbtalk_user_info';

let currentUser: User | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let refreshPromise: Promise<boolean> | null = null;

// --- Token 存储 ---

export async function getAccessToken(): Promise<string | null> {
  return storage.getItemAsync(ACCESS_TOKEN_KEY);
}

async function getRefreshToken(): Promise<string | null> {
  return storage.getItemAsync(REFRESH_TOKEN_KEY);
}

async function storeAuth(response: LoginResponse): Promise<void> {
  await storage.setItemAsync(ACCESS_TOKEN_KEY, response.access);
  await storage.setItemAsync(REFRESH_TOKEN_KEY, response.refresh);
  await storage.setItemAsync(USER_INFO_KEY, JSON.stringify(response.user));
  currentUser = response.user;
  startTokenRefresh(response.access);
}

async function clearAuth(): Promise<void> {
  await storage.deleteItemAsync(ACCESS_TOKEN_KEY);
  await storage.deleteItemAsync(REFRESH_TOKEN_KEY);
  await storage.deleteItemAsync(USER_INFO_KEY);
  currentUser = null;
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

// --- JWT 解析 ---

function parseJwt(token: string): { exp: number } | null {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = atob(base64);
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

// --- Token 刷新 (带并发控制) ---

export async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = doRefresh().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

async function doRefresh(): Promise<boolean> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${getApiBaseUrl()}/api/v1/bbtalk/auth/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: refreshToken }),
    });

    if (response.ok) {
      const data = await response.json();
      await storage.setItemAsync(ACCESS_TOKEN_KEY, data.access);
      if (data.refresh) {
        await storage.setItemAsync(REFRESH_TOKEN_KEY, data.refresh);
      }
      startTokenRefresh(data.access);
      return true;
    }

    await clearAuth();
    return false;
  } catch {
    await clearAuth();
    return false;
  }
}

function startTokenRefresh(accessToken: string): void {
  if (refreshTimer) clearTimeout(refreshTimer);

  const payload = parseJwt(accessToken);
  if (!payload?.exp) return;

  const delay = payload.exp * 1000 - Date.now() - 5 * 60 * 1000;

  if (delay > 0) {
    refreshTimer = setTimeout(() => refreshAccessToken(), delay);
  } else {
    refreshAccessToken();
  }
}

// --- 登录 / 注册 / 登出 ---

export async function login(
  username: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/v1/bbtalk/auth/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      signal: controller.signal,
    });

    if (response.ok) {
      const data: LoginResponse = await response.json();
      await storeAuth(data);
      await AsyncStorage.setItem('privacy_locked', 'false');
      return { success: true };
    }

    const err = await response.json().catch(() => ({}));
    return { success: false, error: err.error || '登录失败' };
  } catch (e: any) {
    if (e.name === 'AbortError') {
      return { success: false, error: '连接超时，请检查服务地址是否正确' };
    }
    return { success: false, error: '网络错误，请检查网络连接或服务地址' };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function register(data: {
  username: string;
  password: string;
  email?: string;
  display_name?: string;
}): Promise<{ success: boolean; error?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/v1/bbtalk/auth/register/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: controller.signal,
    });

    if (response.ok) {
      const resData: LoginResponse = await response.json();
      await storeAuth(resData);
      return { success: true };
    }

    const err = await response.json().catch(() => ({}));
    return { success: false, error: err.error || '注册失败' };
  } catch (e: any) {
    if (e.name === 'AbortError') {
      return { success: false, error: '连接超时，请检查服务地址是否正确' };
    }
    return { success: false, error: '网络错误，请检查网络连接或服务地址' };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function logout(): Promise<void> {
  const refreshToken = await getRefreshToken();
  if (refreshToken) {
    const accessToken = await getAccessToken();
    try {
      await fetch(`${getApiBaseUrl()}/api/v1/bbtalk/auth/token/blacklist/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh: refreshToken }),
      });
    } catch {}
  }
  await clearAuth();
}

// --- 用户信息 ---

export async function initAuth(): Promise<boolean> {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) return false;

    const payload = parseJwt(accessToken);
    if (payload?.exp) {
      if (payload.exp < Date.now() / 1000) {
        const refreshed = await refreshAccessToken();
        if (!refreshed) return false;
      } else {
        startTokenRefresh(accessToken);
      }
    }

    // 恢复缓存的用户信息
    const saved = await storage.getItemAsync(USER_INFO_KEY);
    if (saved) {
      try { currentUser = JSON.parse(saved); } catch {}
    }

    // 获取最新用户信息
    const userInfo = await fetchCurrentUser();
    if (userInfo) {
      currentUser = userInfo;
      await storage.setItemAsync(USER_INFO_KEY, JSON.stringify(userInfo));
      return true;
    }

    await clearAuth();
    return false;
  } catch {
    return false;
  }
}

async function fetchCurrentUser(): Promise<User | null> {
  try {
    const token = await getAccessToken();
    if (!token) return null;

    const response = await fetch(`${getApiBaseUrl()}/api/v1/bbtalk/user/me/`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      return response.json();
    }
    return null;
  } catch {
    return null;
  }
}

export function getCurrentUser(): User | null {
  return currentUser;
}

export async function updateCachedUser(user: User): Promise<void> {
  currentUser = user;
  await storage.setItemAsync(USER_INFO_KEY, JSON.stringify(user));
}

export async function isAuthenticated(): Promise<boolean> {
  return (await getAccessToken()) !== null;
}
