import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Provider } from 'react-redux'
import { useEffect, useState } from 'react'
import { store } from './store'
import BBTalkPage from './pages/BBTalkPage'
import PublicBBTalkPage from './pages/PublicBBTalkPage'
import BBTalkDetailPage from './pages/BBTalkDetailPage'
import CallbackPage from './pages/CallbackPage'
import { initAuth, login } from './services/auth'

interface AppProps {
  basename?: string;
}

// 登录重定向组件 - 未登录时启动 OIDC 登录流程
function LoginRedirect() {
  useEffect(() => {
    login();
  }, []);
  
  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh',
      color: '#666'
    }}>
      正在跳转登录...
    </div>
  );
}

// 全局状态，防止 HMR/StrictMode 重复初始化
let authPromise: Promise<{ ready: boolean; authenticated: boolean; error: string | null }> | null = null;

// 检查是否在 callback 页面（用于跳过认证检查）
function isCallbackPage(): boolean {
  return window.location.pathname === '/callback' || 
         window.location.pathname.endsWith('/callback');
}

export default function App({ basename = '/' }: AppProps) {
  const [authReady, setAuthReady] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const isWujie = !!window.__POWERED_BY_WUJIE__

  useEffect(() => {
    // 如果已经有初始化在进行，等待它完成
    if (authPromise) {
      authPromise.then(result => {
        setAuthReady(result.ready)
        setIsAuthenticated(result.authenticated)
        if (result.error) setAuthError(result.error)
      })
      return
    }

    // 创建初始化 Promise
    authPromise = new Promise(async (resolve) => {
      try {
        // 0. 如果是 callback 页面，跳过认证检查，直接展示页面
        if (isCallbackPage()) {
          console.log('[BBTalk] Callback 页面，跳过认证检查')
          resolve({ ready: true, authenticated: false, error: null })
          return
        }
        
        // 1. 如果是子应用，直接使用主应用认证
        if (isWujie) {
          console.log('[BBTalk] 子应用模式，使用主应用认证')
          resolve({ ready: true, authenticated: true, error: null })
          return
        }

        // 2. 独立运行模式，检查认证状态（不强制跳转）
        console.log('[BBTalk] 独立运行模式，检查认证状态')
        
        const authenticated = await initAuth()
        console.log('[BBTalk] 认证结果:', authenticated)
        
        // 不管是否认证都允许访问，由路由层决定显示内容
        resolve({ ready: true, authenticated, error: null })
      } catch (error) {
        console.error('[BBTalk] 初始化错误:', error)
        resolve({ ready: true, authenticated: false, error: null })
      }
    })

    authPromise.then(result => {
      setAuthReady(result.ready)
      setIsAuthenticated(result.authenticated)
      if (result.error) setAuthError(result.error)
    })
  }, [isWujie])

  // 错误状态
  if (authError) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        color: '#f56565',
        gap: '10px'
      }}>
        <div>{authError}</div>
        <button onClick={() => window.location.reload()} style={{
          padding: '8px 16px',
          background: '#3182ce',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}>
          重新加载
        </button>
      </div>
    )
  }

  // 认证就绪前显示 loading
  if (!authReady) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        color: '#666'
      }}>
        加载中...
      </div>
    )
  }

  return (
    <Provider store={store}>
      <BrowserRouter 
        basename={basename}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true
        }}
      >
        <Routes>
          {/* OIDC 回调页面 */}
          <Route path="/callback" element={<CallbackPage />} />
          
          {/* 公开页面 - 无需登录 */}
          <Route path="/public" element={<PublicBBTalkPage />} />
          
          {/* 私有页面 - 未登录启动登录流程 */}
          <Route 
            path="/" 
            element={
              isAuthenticated 
                ? <BBTalkPage /> 
                : <LoginRedirect />
            } 
          />
          
          <Route path="/detail/:id" element={<BBTalkDetailPage />} />
        </Routes>
      </BrowserRouter>
    </Provider>
  )
}
