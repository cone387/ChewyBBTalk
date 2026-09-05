import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { Provider } from 'react-redux'
import { lazy, Suspense, useEffect, useState } from 'react'
import { store } from './store'
import { initAuth } from './services/auth'

const BBTalkPage = lazy(() => import('./pages/BBTalkPage'))
const PublicBBTalkPage = lazy(() => import('./pages/PublicBBTalkPage'))
const BBTalkDetailPage = lazy(() => import('./pages/BBTalkDetailPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const PrivacyLockPage = lazy(() => import('./pages/PrivacyLockPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const PrivacySettingsPage = lazy(() => import('./pages/PrivacySettingsPage'))
const StorageSettingsPage = lazy(() => import('./pages/StorageSettingsPage'))
const S3ConfigListPage = lazy(() => import('./pages/S3ConfigListPage'))
const DataManagementPage = lazy(() => import('./pages/DataManagementPage'))

interface AppProps {
  basename?: string;
}

// 全局状态，防止 HMR/StrictMode 重复初始化
let authPromise: Promise<{ ready: boolean; authenticated: boolean; error: string | null }> | null = null;

const PRIVACY_STATE_KEY = 'bbtalk_privacy_mode'

function RouteLoading() {
  return (
    <div className="flex h-full min-h-48 items-center justify-center text-sm text-gray-500" role="status" aria-live="polite">
      页面加载中…
    </div>
  )
}

// 防窥模式检查组件
function PrivacyModeChecker({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  
  useEffect(() => {
    // 检查是否处于防窥模式
    const isLocked = localStorage.getItem(PRIVACY_STATE_KEY) === 'true'
    // 避免在 /locked 和 /login 页面重复跳转，防止死循环
    const currentPath = window.location.pathname
    if (isLocked && currentPath !== '/locked' && currentPath !== '/login') {
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
    authPromise = (async () => {
      try {
        // 如果是子应用，直接使用主应用认证
        if (isWujie) {
          console.log('[BBTalk] 子应用模式，使用主应用认证')
          return { ready: true, authenticated: true, error: null }
        }

        // 独立运行模式，检查认证状态
        console.log('[BBTalk] 独立运行模式，检查认证状态')
        
        const authenticated = await initAuth()
        console.log('[BBTalk] 认证结果:', authenticated)
        
        return { ready: true, authenticated, error: null }
      } catch (error) {
        console.error('[BBTalk] 初始化错误:', error)
        return { ready: true, authenticated: false, error: null }
      }
    })()

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
          <Suspense fallback={<RouteLoading />}>
          <Routes>
            {/* 登录页面 */}
            <Route path="/login" element={<LoginPage />} />
            
            {/* 防窥锁定页面 - 不要求认证状态，因为长时间不活动后 token 可能已过期 */}
            {/* 用户通过密码解锁时会重新获取 token */}
            <Route 
              path="/locked" 
              element={<PrivacyLockPage />} 
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
            
            <Route 
              path="/settings/privacy" 
              element={
                isAuthenticated 
                  ? <PrivacySettingsPage /> 
                  : <Navigate to="/login" replace />
              } 
            />
            
            <Route 
              path="/settings/storage" 
              element={
                isAuthenticated 
                  ? <StorageSettingsPage /> 
                  : <Navigate to="/login" replace />
              } 
            />
                        
            <Route 
              path="/settings/storage/s3" 
              element={
                isAuthenticated 
                  ? <S3ConfigListPage /> 
                  : <Navigate to="/login" replace />
              } 
            />
            
            <Route 
              path="/settings/data" 
              element={
                isAuthenticated 
                  ? <DataManagementPage /> 
                  : <Navigate to="/login" replace />
              } 
            />
            
          </Routes>
          </Suspense>
        </PrivacyModeChecker>
      </BrowserRouter>
    </Provider>
  )
}
