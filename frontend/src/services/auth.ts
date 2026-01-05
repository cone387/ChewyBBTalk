import Keycloak from 'keycloak-js';

let keycloakInstance: Keycloak | null = null;

/**
 * 初始化 Keycloak（仅在配置了环境变量时）
 */
export async function initKeycloak(): Promise<boolean> {
  const keycloakUrl = import.meta.env.VITE_KEYCLOAK_URL;
  const realm = import.meta.env.VITE_KEYCLOAK_REALM;
  const clientId = import.meta.env.VITE_KEYCLOAK_CLIENT_ID;

  console.log('[Keycloak] 配置:', { keycloakUrl, realm, clientId });

  // 如果没有配置 Keycloak，直接返回 false
  if (!keycloakUrl || !realm || !clientId) {
    console.info('[Keycloak] 未配置');
    return false;
  }

  try {
    keycloakInstance = new Keycloak({
      url: keycloakUrl,
      realm: realm,
      clientId: clientId,
    });

    console.log('[Keycloak] 开始初始化...');

    const authenticated = await keycloakInstance.init({
      onLoad: 'check-sso',
      checkLoginIframe: false,
      pkceMethod: 'S256',
    });

    console.log('[Keycloak] 初始化完成, authenticated:', authenticated);

    if (authenticated) {
      console.info('[Keycloak] 认证成功，token:', keycloakInstance.token?.substring(0, 20) + '...');
      setupTokenRefresh();
      
      // 清理 URL hash（延迟执行，确保 Keycloak 处理完毕）
      setTimeout(() => {
        if (window.location.hash.includes('state=') || window.location.hash.includes('code=')) {
          console.info('[Keycloak] 清理认证回调参数');
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }, 100);
    } else {
      console.info('[Keycloak] 未认证');
    }

    return authenticated;
  } catch (error) {
    console.error('[Keycloak] 初始化失败:', error);
    return false;
  }
}

/**
 * 登录跳转（Keycloak）
 */
export function loginWithKeycloak() {
  if (keycloakInstance) {
    keycloakInstance.login();
  }
}

/**
 * 登出（Keycloak）
 */
export function logoutWithKeycloak() {
  if (keycloakInstance) {
    keycloakInstance.logout();
  }
}

/**
 * 刷新 Token
 */
async function refreshToken(): Promise<boolean> {
  if (!keycloakInstance) return false;
  
  try {
    const refreshed = await keycloakInstance.updateToken(30);
    if (refreshed) {
      console.info('Token 已刷新');
    }
    return true;
  } catch (error) {
    console.error('Token 刷新失败:', error);
    return false;
  }
}

/**
 * 设置 Token 自动刷新
 */
function setupTokenRefresh() {
  if (!keycloakInstance) return;
  
  // 每 60 秒检查一次 token
  setInterval(async () => {
    try {
      await keycloakInstance!.updateToken(70);
    } catch (error) {
      console.error('Token 自动刷新失败:', error);
    }
  }, 60000);
}

/**
 * 获取认证 Token（优先级：主应用桥接 > Keycloak > null）
 */
export function getAuthToken(): string | null {
  // 1. wujie 子应用模式：从多个源尝试获取 token
  if (window.__POWERED_BY_WUJIE__) {
    // 1.1 从 props 中获取
    const propsToken = window.__WUJIE?.props?.getToken?.();
    if (propsToken) {
      return propsToken;
    }
    
    // 1.2 尝试当前窗口的 __AUTH_BRIDGE__
    if (window.__AUTH_BRIDGE__?.getToken) {
      const token = window.__AUTH_BRIDGE__.getToken();
      if (token) return token;
    }
    
    // 1.3 尝试从主窗口获取 __AUTH_BRIDGE__
    try {
      const parentBridge = (window.parent as any).__AUTH_BRIDGE__;
      if (parentBridge?.getToken) {
        const token = parentBridge.getToken();
        if (token) return token;
      }
    } catch (e) {
      // 跨域访问可能失败
    }
    
    // 1.4 尝试从 top 窗口获取
    try {
      const topBridge = (window.top as any).__AUTH_BRIDGE__;
      if (topBridge?.getToken) {
        const token = topBridge.getToken();
        if (token) return token;
      }
    } catch (e) {
      // 跨域访问可能失败
    }
    
    console.warn('[Auth] 子应用模式下无法获取 token');
    return null;
  }

  // 2. 独立运行模式：使用 Keycloak
  if (keycloakInstance?.token) {
    return keycloakInstance.token;
  }

  return null;
}

/**
 * 获取用户信息
 */
export async function getUserInfo(): Promise<any> {
  // 优先使用主应用桥接
  if (window.__AUTH_BRIDGE__?.getUserInfo) {
    try {
      return await window.__AUTH_BRIDGE__.getUserInfo();
    } catch (error) {
      console.error('获取用户信息失败:', error);
    }
  }

  // 使用 Keycloak
  if (keycloakInstance) {
    try {
      await keycloakInstance.loadUserProfile();
      return keycloakInstance.profile;
    } catch (error) {
      console.error('加载 Keycloak 用户信息失败:', error);
    }
  }

  return null;
}

/**
 * 检查是否已认证
 */
export function isAuthenticated(): boolean {
  const token = getAuthToken();
  return !!token;
}
