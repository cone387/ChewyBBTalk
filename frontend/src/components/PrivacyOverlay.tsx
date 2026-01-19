import { useState, useEffect } from 'react'
import { verifyPassword, getCurrentUser } from '../services/auth'

/**
 * 防窥解锁组件
 * 
 * 在防窥模式下显示解锁界面
 */

interface PrivacyOverlayProps {
  /** 是否处于防窥模式 */
  isPrivacyMode: boolean
  /** 解锁成功回调 */
  onUnlock?: () => void
}

export default function PrivacyOverlay({
  isPrivacyMode,
  onUnlock,
}: PrivacyOverlayProps) {
  const [password, setPassword] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isBiometricSupported, setIsBiometricSupported] = useState(false)
  const [isBiometricVerifying, setIsBiometricVerifying] = useState(false)
  
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
  
  // 重置状态当防窥模式变化时
  useEffect(() => {
    if (!isPrivacyMode) {
      setPassword('')
      setError(null)
    }
  }, [isPrivacyMode])
  
  // 非防窥模式不渲染
  if (!isPrivacyMode) {
    return null
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
        onUnlock?.()
      } else {
        setError(result.error || '密码错误')
      }
    } catch {
      setError('验证失败，请重试')
    } finally {
      setIsVerifying(false)
    }
  }
  
  // 生物识别解锁
  const handleBiometricUnlock = async () => {
    if (!isBiometricSupported) return
    
    setIsBiometricVerifying(true)
    setError(null)
    
    try {
      const challenge = new Uint8Array(32)
      crypto.getRandomValues(challenge)
      
      const user = getCurrentUser()
      if (!user) {
        setError('用户未登录')
        return
      }
      
      const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
        challenge,
        timeout: 60000,
        userVerification: 'required',
        rpId: window.location.hostname,
      }
      
      const credential = await navigator.credentials.get({
        publicKey: publicKeyCredentialRequestOptions,
      })
      
      if (credential) {
        onUnlock?.()
      } else {
        setError('生物识别验证失败')
      }
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setError('用户取消了验证')
      } else if (err.name === 'InvalidStateError') {
        // 没有已注册的凭证，创建临时凭证验证
        try {
          const challenge = new Uint8Array(32)
          crypto.getRandomValues(challenge)
          
          const createOptions: PublicKeyCredentialCreationOptions = {
            challenge,
            rp: {
              name: 'ChewyBBTalk',
              id: window.location.hostname,
            },
            user: {
              id: new TextEncoder().encode(getCurrentUser()?.username || 'user'),
              name: getCurrentUser()?.username || 'user',
              displayName: getCurrentUser()?.display_name || getCurrentUser()?.username || 'user',
            },
            pubKeyCredParams: [
              { type: 'public-key', alg: -7 },
              { type: 'public-key', alg: -257 },
            ],
            authenticatorSelection: {
              authenticatorAttachment: 'platform',
              userVerification: 'required',
            },
            timeout: 60000,
          }
          
          const newCredential = await navigator.credentials.create({
            publicKey: createOptions,
          })
          
          if (newCredential) {
            onUnlock?.()
          }
        } catch {
          setError('生物识别不可用，请使用密码解锁')
        }
      } else {
        setError('生物识别验证失败，请使用密码解锁')
      }
    } finally {
      setIsBiometricVerifying(false)
    }
  }
  
  // 防窥模式：显示解锁界面
  return (
    <div className="bg-white rounded-2xl shadow-sm p-8">
      <div className="max-w-sm mx-auto text-center">
        {/* 锁图标 */}
        <div className="flex justify-center mb-6">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center">
            <svg
              className="w-7 h-7 text-gray-500"
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
        
        {/* 密码输入表单 */}
        <form onSubmit={handlePasswordUnlock} className="space-y-3">
          <div className="relative">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码以继续"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center text-sm"
              disabled={isVerifying}
              autoFocus
            />
          </div>
          
          {/* 错误提示 */}
          {error && (
            <p className="text-red-500 text-sm">{error}</p>
          )}

          {/* 密码解锁按钮 */}
          <button
            type="submit"
            disabled={isVerifying}
            className="w-full px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {isVerifying ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                验证中...
              </>
            ) : (
              '确定'
            )}
          </button>
        </form>
        
        {/* 生物识别解锁按钮 */}
        {isBiometricSupported && (
          <>
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-400">或</span>
              </div>
            </div>
            
            <button
              onClick={handleBiometricUnlock}
              disabled={isBiometricVerifying}
              className="w-full px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {isBiometricVerifying ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  验证中...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                  </svg>
                  指纹/面容解锁
                </>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
