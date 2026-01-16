import { ReactNode } from 'react'

/**
 * 防窥遮罩组件
 * 
 * 在防窥模式下，模糊显示内容并显示解锁提示
 */

interface PrivacyOverlayProps {
  /** 是否处于防窥模式 */
  isPrivacyMode: boolean
  /** 子内容 */
  children: ReactNode
  /** 点击解锁回调 */
  onUnlock?: () => void
  /** 是否允许子内容交互（即使在防窥模式下），默认 false */
  allowInteraction?: boolean
}

export default function PrivacyOverlay({
  isPrivacyMode,
  children,
  onUnlock,
  allowInteraction = false,
}: PrivacyOverlayProps) {
  // 非防窥模式，直接渲染子内容
  if (!isPrivacyMode) {
    return <>{children}</>
  }

  // 防窥模式：显示模糊内容 + 解锁提示
  return (
    <div className="relative">
      {/* 模糊内容 */}
      <div
        className={`transition-all duration-300 ${
          allowInteraction ? '' : 'pointer-events-none'
        }`}
        style={{
          filter: 'blur(10px)',
          userSelect: 'none',
        }}
      >
        {children}
      </div>

      {/* 遮罩层 + 解锁提示 */}
      <div
        className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-30 backdrop-blur-sm cursor-pointer"
        onClick={onUnlock}
      >
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md mx-4 text-center transform hover:scale-105 transition-transform">
          {/* 锁图标 */}
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
              <svg
                className="w-8 h-8 text-blue-600"
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

          {/* 标题 */}
          <h2 className="text-2xl font-bold text-gray-900 mb-2">隐私保护已启用</h2>

          {/* 说明 */}
          <p className="text-gray-600 mb-6">
            由于长时间未操作，内容已自动加密显示
          </p>

          {/* 解锁按钮 */}
          <button
            onClick={onUnlock}
            className="w-full px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"
              />
            </svg>
            点击任意位置解锁
          </button>

          {/* 提示文字 */}
          <p className="text-xs text-gray-500 mt-4">
            任何鼠标或键盘操作都会自动解锁
          </p>
        </div>
      </div>
    </div>
  )
}
