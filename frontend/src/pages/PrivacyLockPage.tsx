import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppDispatch } from '../store/hooks'
import { createBBTalkAsync } from '../store/slices/bbtalkSlice'
import { verifyPassword, getCurrentUser } from '../services/auth'
import BBTalkEditor from '../components/BBTalkEditor'
import type { BBTalkFormData } from '../types'

/**
 * 防窥锁定页面
 * 
 * 当用户长时间无操作进入防窥模式时显示此页面
 * 需要输入密码或生物识别验证后才能返回主页
 * 
 * 支持：
 * - 密码验证
 * - 生物识别（Face ID / Touch ID / 指纹）
 * - 移动端响应式布局
 */

const PRIVACY_STATE_KEY = 'bbtalk_privacy_mode'

export default function PrivacyLockPage() {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const [password, setPassword] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isBiometricSupported, setIsBiometricSupported] = useState(false)
  const [isBiometricVerifying, setIsBiometricVerifying] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [publishSuccess, setPublishSuccess] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const biometricAttempted = useRef(false)
  
  // 检测是否是移动端
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])
  
  // 检查是否真的处于防窥模式，如果不是则跳转回首页
  useEffect(() => {
    const isLocked = localStorage.getItem(PRIVACY_STATE_KEY) === 'true'
    if (!isLocked) {
      navigate('/', { replace: true })
    }
  }, [navigate])
  
  // 检测是否支持 WebAuthn 生物识别
  useEffect(() => {
    const checkBiometricSupport = async () => {
      if (window.PublicKeyCredential) {
        try {
          const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
          setIsBiometricSupported(available)
        } catch {
          setIsBiometricSupported(false)
        }
      }
    }
    checkBiometricSupport()
  }, [])
  
  // 解锁成功
  const handleUnlock = () => {
    // 清除防窥状态
    localStorage.removeItem(PRIVACY_STATE_KEY)
    localStorage.removeItem('bbtalk_privacy_timestamp')
    // 跳转回首页
    navigate('/', { replace: true })
  }
  
  // 密码验证解锁
  const handlePasswordUnlock = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim()) {
      setError('请输入密码')
      return
    }
    
    setIsVerifying(true)
    setError(null)
    
    try {
      const result = await verifyPassword(password)
      if (result.success) {
        setPassword('')
        handleUnlock()
      } else {
        setError(result.error || '密码错误')
      }
    } catch {
      setError('验证失败，请重试')
    } finally {
      setIsVerifying(false)
    }
  }
  
  // 生物识别解锁 - 优化移动端 Face ID 支持
  const handleBiometricUnlock = async () => {
    if (!isBiometricSupported) return
    
    setIsBiometricVerifying(true)
    setError(null)
    biometricAttempted.current = true
    
    try {
      const user = getCurrentUser()
      if (!user) {
        setError('用户未登录')
        return
      }
      
      const challenge = new Uint8Array(32)
      crypto.getRandomValues(challenge)
      
      // 对于防窥模式解锁，我们直接创建一个临时凭证来验证用户身份
      // 这样可以在移动端触发 Face ID / Touch ID 验证
      // 而不需要事先注册凭证
      const createOptions: PublicKeyCredentialCreationOptions = {
        challenge,
        rp: {
          name: 'ChewyBBTalk',
          id: window.location.hostname,
        },
        user: {
          id: new TextEncoder().encode(`${user.username}_${Date.now()}`),
          name: user.username || 'user',
          displayName: user.display_name || user.username || 'user',
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },   // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform', // 只使用平台验证器（Face ID/Touch ID/指纹）
          userVerification: 'required',        // 必须用户验证
          residentKey: 'discouraged',          // 不需要存储凭证
        },
        timeout: 60000,
        attestation: 'none', // 不需要证明
      }
      
      // 创建凭证时会触发生物识别验证
      const credential = await navigator.credentials.create({
        publicKey: createOptions,
      })
      
      if (credential) {
        // 生物识别验证成功
        handleUnlock()
      } else {
        setError('生物识别验证失败')
      }
    } catch (err: any) {
      console.error('[Biometric] 验证失败:', err.name, err.message)
      
      if (err.name === 'NotAllowedError') {
        setError('验证已取消')
      } else if (err.name === 'SecurityError') {
        setError('安全错误，请使用密码解锁')
      } else if (err.name === 'NotSupportedError') {
        setError('设备不支持生物识别')
        setIsBiometricSupported(false)
      } else {
        setError('验证失败，请使用密码解锁')
      }
    } finally {
      setIsBiometricVerifying(false)
    }
  }
  
  // 移动端自动弹出生物识别（页面加载后）
  useEffect(() => {
    if (isMobile && isBiometricSupported && !biometricAttempted.current) {
      // 延迟一点执行，确保页面已完全渲染
      const timer = setTimeout(() => {
        handleBiometricUnlock()
      }, 500)
      return () => clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, isBiometricSupported])
  
  // 发布 BBTalk
  const handlePublish = async (data: BBTalkFormData) => {
    setIsPublishing(true)
    try {
      await dispatch(createBBTalkAsync(data)).unwrap()
      setPublishSuccess(true)
      setTimeout(() => setPublishSuccess(false), 3000)
    } catch (err) {
      console.error('发布失败:', err)
    } finally {
      setIsPublishing(false)
    }
  }
  
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-3 sm:p-4 gap-3 sm:gap-4">
      {/* BBTalk 编辑器 */}
      <div className="w-full max-w-xl">
        <BBTalkEditor 
          onPublish={handlePublish} 
          isPublishing={isPublishing}
        />
        {publishSuccess && (
          <div className="mt-3 text-center text-green-600 text-sm flex items-center justify-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            发布成功
          </div>
        )}
      </div>
      
      {/* 解锁卡片 - 响应式布局 */}
      <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-5 w-full max-w-xl">
        {/* 移动端垂直布局，桌面端水平布局 */}
        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-5">
          {/* 锁图标 - 移动端居中显示 */}
          <div className="flex-shrink-0">
            <div className="w-14 h-14 sm:w-12 sm:h-12 bg-gray-100 rounded-full flex items-center justify-center">
              <svg
                className="w-7 h-7 sm:w-6 sm:h-6 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
          </div>
          
          {/* 解锁表单区域 */}
          <div className="flex-1 w-full">
            {/* 移动端：优先显示生物识别按钮 */}
            {isMobile && isBiometricSupported && (
              <button
                type="button"
                onClick={handleBiometricUnlock}
                disabled={isBiometricVerifying}
                className="w-full mb-3 py-3.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isBiometricVerifying ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>验证中...</span>
                  </>
                ) : (
                  <>
                    {/* Face ID 图标 */}
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="4" y="4" width="16" height="16" rx="3" />
                      <circle cx="9" cy="10" r="1" fill="currentColor" />
                      <circle cx="15" cy="10" r="1" fill="currentColor" />
                      <path d="M9 15c1.5 1.5 4.5 1.5 6 0" strokeLinecap="round" />
                    </svg>
                    <span>面容/指纹解锁</span>
                  </>
                )}
              </button>
            )}
            
            {/* 移动端分隔线 */}
            {isMobile && isBiometricSupported && (
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1 h-px bg-gray-200"></div>
                <span className="text-xs text-gray-400">或使用密码</span>
                <div className="flex-1 h-px bg-gray-200"></div>
              </div>
            )}
            
            {/* 密码表单 */}
            <form onSubmit={handlePasswordUnlock} className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isMobile ? '输入密码' : '请输入密码以继续'}
                className="flex-1 px-4 py-3 sm:py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                disabled={isVerifying}
                autoFocus={!isMobile}
              />
              <div className="flex gap-2 sm:gap-3">
                <button
                  type="submit"
                  disabled={isVerifying}
                  className="flex-1 sm:flex-none px-5 py-3 sm:py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm whitespace-nowrap"
                >
                  {isVerifying ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    '解锁'
                  )}
                </button>
                {/* 桌面端：生物识别小按钮 */}
                {!isMobile && isBiometricSupported && (
                  <button
                    type="button"
                    onClick={handleBiometricUnlock}
                    disabled={isBiometricVerifying}
                    className="px-3 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                    title="指纹/面容解锁"
                  >
                    {isBiometricVerifying ? (
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
            </form>
            
            {/* 错误提示 */}
            {error && (
              <p className="text-red-500 text-xs mt-2 text-center sm:text-left">{error}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
