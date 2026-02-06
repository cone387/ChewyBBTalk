import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { Provider } from 'react-redux'
import { useEffect, useState } from 'react'
import { store } from './store'
import BBTalkPage from './pages/BBTalkPage'
import PublicBBTalkPage from './pages/PublicBBTalkPage'
import BBTalkDetailPage from './pages/BBTalkDetailPage'
import LoginPage from './pages/LoginPage'
import PrivacyLockPage from './pages/PrivacyLockPage'
import SettingsPage from './pages/SettingsPage'
import { initAuth } from './services/auth'

interface AppProps {
  basename?: string;
}

// 全局状态，防止 HMR/StrictMode 重复初始化
let authPromise: Promise<{ ready: boolean; authenticated: boolean; error: string | null }> | null = null;

const PRIVACY_STATE_KEY = 'bbtalk_privacy_mode'

// 防窥模式检查组件
function PrivacyModeChecker({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  
  useEffect(() => {
    // 检查是否处于防窥模式
    const isLocked = localStorage.getItem(PRIVACY_STATE_KEY) === 'true'
    if (isLocked) {
      console.log('[App] 检测到防窥模式，跳转到锁定页面')
      navigate('/locked', { replace: true })
    }
  }, [navigate])
  
  return <>{children}</>
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
        // 如果是子应用，直接使用主应用认证
        if (isWujie) {
          console.log('[BBTalk] 子应用模式，使用主应用认证')
          resolve({ ready: true, authenticated: true, error: null })
          return
        }

        // 独立运行模式，检查认证状态
        console.log('[BBTalk] 独立运行模式，检查认证状态')
        
        const authenticated = await initAuth()
        console.log('[BBTalk] 认证结果:', authenticated)
        
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
        <PrivacyModeChecker>
          <Routes>
            {/* 登录页面 */}
            <Route path="/login" element={<LoginPage />} />
            
            {/* 防窥锁定页面 */}
            <Route 
              path="/locked" 
              element={
                isAuthenticated 
                  ? <PrivacyLockPage /> 
                  : <Navigate to="/login" replace />
              } 
            />
            
            {/* 公开页面 - 无需登录 */}
            <Route path="/public" element={<PublicBBTalkPage />} />
            
            {/* 私有页面 - 未登录跳转登录 */}
            <Route 
              path="/" 
              element={
                isAuthenticated 
                  ? <BBTalkPage /> 
                  : <Navigate to="/login" replace />
              } 
            />
            
            <Route 
              path="/detail/:id" 
              element={
                isAuthenticated 
                  ? <BBTalkDetailPage /> 
                  : <Navigate to="/login" replace />
              } 
            />
            
            <Route 
              path="/settings" 
              element={
                isAuthenticated 
                  ? <SettingsPage /> 
                  : <Navigate to="/login" replace />
              } 
            />
          </Routes>
        </PrivacyModeChecker>
      </BrowserRouter>
    </Provider>
  )
}
