import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Provider } from 'react-redux'
import { useEffect, useState } from 'react'
import { store } from './store'
import BBTalkPage from './pages/BBTalkPage'
import BBTalkDetailPage from './pages/BBTalkDetailPage'
import { initAuth } from './services/auth'

interface AppProps {
  basename?: string;
}

// 全局状态，防止 HMR/StrictMode 重复初始化
let authPromise: Promise<{ ready: boolean; error: string | null }> | null = null;

export default function App({ basename = '/' }: AppProps) {
  const [authReady, setAuthReady] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const isWujie = !!window.__POWERED_BY_WUJIE__

  useEffect(() => {
    // 如果已经有初始化在进行，等待它完成
    if (authPromise) {
      authPromise.then(result => {
        setAuthReady(result.ready)
        if (result.error) setAuthError(result.error)
      })
      return
    }

    // 创建初始化 Promise
    authPromise = new Promise(async (resolve) => {
      try {
        // 1. 如果是子应用，直接使用主应用认证
        if (isWujie) {
          console.log('[BBTalk] 子应用模式，使用主应用认证')
          resolve({ ready: true, error: null })
          return
        }

        // 2. 独立运行模式，初始化 Authelia 认证
        console.log('[BBTalk] 独立运行模式，检查 Authelia 认证')
        
        const authenticated = await initAuth()
        console.log('[BBTalk] Authelia 认证结果:', authenticated)
        
        if (authenticated) {
          resolve({ ready: true, error: null })
        } else {
          // 未认证，由 Authelia 反向代理处理重定向
          console.log('[BBTalk] 未认证，等待 Authelia 重定向...')
          resolve({ ready: false, error: '未认证，请等待重定向到登录页' })
        }
      } catch (error) {
        console.error('[BBTalk] 初始化错误:', error)
        resolve({ ready: false, error: '初始化失败: ' + (error as Error).message })
      }
    })

    authPromise.then(result => {
      setAuthReady(result.ready)
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
        认证中...
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
          <Route path="/" element={<BBTalkPage />} />
          <Route path="/detail/:id" element={<BBTalkDetailPage />} />
        </Routes>
      </BrowserRouter>
    </Provider>
  )
}
