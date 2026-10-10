import Icon from './ui/Icon'
import React from 'react'
import { usePrivacyMode } from '../hooks/usePrivacyMode'

interface PrivacyCountdownButtonProps {
  timeoutMs: number
  enabled: boolean
  onActivate: () => void
}

/**
 * 独立的防偷窥倒计时按钮组件
 * 将 1s 一次的倒计时 state 更新局限在当前组件内部，彻底消除因倒计时引起的页面级全局重渲染。
 */
export default React.memo(function PrivacyCountdownButton({
  timeoutMs,
  enabled,
  onActivate,
}: PrivacyCountdownButtonProps) {
  const { remainingSeconds } = usePrivacyMode({
    timeout: timeoutMs,
    enabled,
    persistOnRefresh: false,
    trackCountdown: true,
  })

  if (!enabled || remainingSeconds === null) {
    return null
  }

  return (
    <button
      onClick={onActivate}
      className="fixed bottom-20 right-4 lg:bottom-8 lg:right-8 z-40 min-h-11 shrink-0 bg-blue-600 text-white px-3 py-2 rounded-full shadow-lg hover:bg-blue-700 flex items-center justify-center gap-2 text-sm font-medium"
      aria-label="立即锁定记录"
      title="点击立即进入防偷窥模式"
    >
      <Icon className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </Icon>
      <span>
        {remainingSeconds >= 60
          ? `${Math.floor(remainingSeconds / 60)}:${(remainingSeconds % 60).toString().padStart(2, '0')}`
          : `${remainingSeconds}s`}
      </span>
    </button>
  )
})
