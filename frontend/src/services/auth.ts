/**
 * OIDC 认证服务
 * 
 * 使用 Authelia 作为 OIDC Provider，实现 Authorization Code Flow with PKCE
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

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
}

// OIDC 配置
const OIDC_CONFIG = {
  authority: import.meta.env.VITE_AUTHELIA_URL || '/authelia',
  client_id: 'bbtalk',
  redirect_uri: `${window.location.origin}/callback`,
  scope: 'openid profile email groups',
  response_type: 'code',
};

// Token 存储 key
const TOKEN_KEY = 'bbtalk_access_token';
const REFRESH_TOKEN_KEY = 'bbtalk_refresh_token';
const TOKEN_EXPIRY_KEY = 'bbtalk_token_expiry';
const CODE_VERIFIER_KEY = 'bbtalk_code_verifier';

let currentUser: UserInfo | null = null;

/**
 * 生成随机字符串（用于 PKCE code_verifier）
 */
function generateRandomString(length: number): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  return Array.from(randomValues, (v) => charset[v % charset.length]).join('');
}

/**
 * 生成 PKCE code_challenge
 */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * 获取存储的 access token
 */
export function getAuthToken(): string | null {
  // 检查 token 是否过期
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
  if (expiry && Date.now() > parseInt(expiry)) {
    // Token 已过期，清除
    clearTokens();
    return null;
  }
  
  // 子应用模式：从主应用获取 token
  if (window.__POWERED_BY_WUJIE__) {
    const propsToken = window.__WUJIE?.props?.getToken?.();
    if (propsToken) return propsToken;
    
    if (window.__AUTH_BRIDGE__?.getToken) {
      const token = window.__AUTH_BRIDGE__.getToken();
      if (token) return token;
    }
  }
  
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * 存储 tokens
 * 注意：Authelia 的 access_token 不是 JWT 格式，需要使用 id_token 进行认证
 */
function storeTokens(tokenResponse: TokenResponse): void {
  // 优先使用 id_token（JWT 格式），因为 Authelia 的 access_token 不是 JWT
  const tokenToStore = tokenResponse.id_token || tokenResponse.access_token;
  localStorage.setItem(TOKEN_KEY, tokenToStore);
  
  console.log('[Auth] Token stored, using:', tokenResponse.id_token ? 'id_token' : 'access_token');
  
  if (tokenResponse.refresh_token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, tokenResponse.refresh_token);
  }
  // 计算过期时间（提前 60 秒过期以确保安全）
  const expiryTime = Date.now() + (tokenResponse.expires_in - 60) * 1000;
  localStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString());
}

/**
 * 清除 tokens
 */
function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
  localStorage.removeItem(CODE_VERIFIER_KEY);
}

/**
 * 启动 OIDC 登录流程
 */
export async function login(): Promise<void> {
  // 生成 PKCE code_verifier 和 code_challenge
  const codeVerifier = generateRandomString(64);
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  
  // 存储 code_verifier 供回调时使用
  localStorage.setItem(CODE_VERIFIER_KEY, codeVerifier);
  
  // 生成 state 防止 CSRF
  const state = generateRandomString(32);
  sessionStorage.setItem('oidc_state', state);
  
  // 构建授权 URL（处理相对路径）
  const authority = OIDC_CONFIG.authority.startsWith('http') 
    ? OIDC_CONFIG.authority 
    : `${window.location.origin}${OIDC_CONFIG.authority}`;
  
  const authUrl = new URL(`${authority}/api/oidc/authorization`);
  authUrl.searchParams.set('client_id', OIDC_CONFIG.client_id);
  authUrl.searchParams.set('redirect_uri', OIDC_CONFIG.redirect_uri);
  authUrl.searchParams.set('response_type', OIDC_CONFIG.response_type);
  authUrl.searchParams.set('scope', OIDC_CONFIG.scope);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  
  // 重定向到 Authelia 登录页
  window.location.href = authUrl.toString();
}

/**
 * 处理 OIDC 回调
 */
export async function handleCallback(code: string, state: string): Promise<boolean> {
  // 验证 state
  const savedState = sessionStorage.getItem('oidc_state');
  if (state !== savedState) {
    console.error('[Auth] State mismatch');
    return false;
  }
  sessionStorage.removeItem('oidc_state');
  
  // 获取 code_verifier
  const codeVerifier = localStorage.getItem(CODE_VERIFIER_KEY);
  if (!codeVerifier) {
    console.error('[Auth] Code verifier not found');
    return false;
  }
  localStorage.removeItem(CODE_VERIFIER_KEY);
  
  try {
    // 用 code 换取 token（处理相对路径）
    const authority = OIDC_CONFIG.authority.startsWith('http') 
      ? OIDC_CONFIG.authority 
      : `${window.location.origin}${OIDC_CONFIG.authority}`;
    
    const tokenUrl = `${authority}/api/oidc/token`;
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: OIDC_CONFIG.client_id,
        code: code,
        redirect_uri: OIDC_CONFIG.redirect_uri,
        code_verifier: codeVerifier,
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error('[Auth] Token exchange failed:', error);
      return false;
    }
    
    const tokenResponse: TokenResponse = await response.json();
    storeTokens(tokenResponse);
    
    console.log('[Auth] Login successful');
    return true;
  } catch (error) {
    console.error('[Auth] Token exchange error:', error);
    return false;
  }
}

/**
 * 初始化认证（检查用户是否已认证）
 */
export async function initAuth(): Promise<boolean> {
  try {
    // 检查是否有有效的 token
    const token = getAuthToken();
    if (!token) {
      return false;
    }

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
    
    // Token 无效，清除
    clearTokens();
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
    const token = getAuthToken();
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
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
 * 登出
 */
export function logout(): void {
  // 清除本地 tokens
  clearTokens();
  currentUser = null;
  
  // 重定向到 Authelia 登出页（处理相对路径）
  const authority = OIDC_CONFIG.authority.startsWith('http') 
    ? OIDC_CONFIG.authority 
    : `${window.location.origin}${OIDC_CONFIG.authority}`;
  
  const postLogoutRedirectUri = window.location.origin;
  window.location.href = `${authority}/api/logout?rd=${encodeURIComponent(postLogoutRedirectUri)}`;
}

/**
 * 检查是否已认证
 */
export function isAuthenticated(): boolean {
  return getAuthToken() !== null;
}
