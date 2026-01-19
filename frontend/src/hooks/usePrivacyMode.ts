import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * 防窥模式 Hook
 * 
 * 功能：
 * 1. 检测用户活动（鼠标移动、键盘输入、滚动、点击）
 * 2. 长时间不活动后进入防窥模式，模糊显示内容
 * 3. 任意活动恢复显示
 * 4. 防窥状态持久化到 localStorage，刷新后保持
 * 5. 配置超时时长
 */

interface UsePrivacyModeOptions {
  /** 触发防窥的超时时长（毫秒），默认 5 分钟 */
  timeout?: number
  /** 是否启用防窥模式，默认 true */
  enabled?: boolean
  /** 是否在刷新后恢复防窥状态，默认 true */
  persistOnRefresh?: boolean
}

interface UsePrivacyModeReturn {
  /** 是否处于防窥模式 */
  isPrivacyMode: boolean
  /** 手动激活防窥模式 */
  activatePrivacy: () => void
  /** 手动解除防窥模式 */
  deactivatePrivacy: () => void
  /** 重置不活动计时器 */
  resetTimer: () => void
}

const PRIVACY_STATE_KEY = 'bbtalk_privacy_mode'
const PRIVACY_TIMESTAMP_KEY = 'bbtalk_privacy_timestamp'

export function usePrivacyMode(options: UsePrivacyModeOptions = {}): UsePrivacyModeReturn {
  const {
    timeout = 5 * 60 * 1000, // 默认 5 分钟
    enabled = true,
    persistOnRefresh = true,
  } = options

  const [isPrivacyMode, setIsPrivacyMode] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const lastActivityRef = useRef<number>(Date.now())

  // 初始化：从 localStorage 恢复防窥状态
  useEffect(() => {
    if (!enabled || !persistOnRefresh) return

    try {
      const savedState = localStorage.getItem(PRIVACY_STATE_KEY)
      const savedTimestamp = localStorage.getItem(PRIVACY_TIMESTAMP_KEY)
      
      if (savedState === 'true' && savedTimestamp) {
        const timestamp = parseInt(savedTimestamp, 10)
        const elapsedTime = Date.now() - timestamp
        
        // 如果距离上次活动超过超时时长，保持防窥状态
        if (elapsedTime >= timeout) {
          console.log('[Privacy] 恢复防窥状态（距离上次活动 %dms）', elapsedTime)
          setIsPrivacyMode(true)
        } else {
          // 否则清除防窥状态
          console.log('[Privacy] 清除防窥状态（距离上次活动不足）')
          localStorage.removeItem(PRIVACY_STATE_KEY)
          localStorage.removeItem(PRIVACY_TIMESTAMP_KEY)
        }
      }
    } catch (error) {
      console.error('[Privacy] 恢复状态失败:', error)
    }
  }, [enabled, timeout, persistOnRefresh])

  // 激活防窥模式
  const activatePrivacy = useCallback(() => {
    console.log('[Privacy] 激活防窥模式')
    setIsPrivacyMode(true)
    
    if (persistOnRefresh) {
      localStorage.setItem(PRIVACY_STATE_KEY, 'true')
      localStorage.setItem(PRIVACY_TIMESTAMP_KEY, lastActivityRef.current.toString())
    }
  }, [persistOnRefresh])

  // 解除防窥模式
  const deactivatePrivacy = useCallback(() => {
    console.log('[Privacy] 解除防窥模式')
    setIsPrivacyMode(false)
    
    if (persistOnRefresh) {
      localStorage.removeItem(PRIVACY_STATE_KEY)
      localStorage.removeItem(PRIVACY_TIMESTAMP_KEY)
    }
    
    lastActivityRef.current = Date.now()
  }, [persistOnRefresh])

  // 重置不活动计时器
  const resetTimer = useCallback(() => {
    // 清除旧的计时器
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    // 如果当前处于防窥模式，解除
    if (isPrivacyMode) {
      deactivatePrivacy()
    }

    // 更新最后活动时间
    lastActivityRef.current = Date.now()

    // 设置新的计时器
    if (enabled) {
      timerRef.current = setTimeout(() => {
        activatePrivacy()
      }, timeout)
    }
  }, [enabled, timeout, isPrivacyMode, activatePrivacy, deactivatePrivacy])

  // 监听用户活动事件
  useEffect(() => {
    if (!enabled) return

    // 初始化计时器
    resetTimer()

    // 事件监听器
    const handleActivity = () => {
      resetTimer()
    }

    // 监听多种用户活动
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click']
    events.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true })
    })

    // 清理
    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity)
      })
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [enabled, resetTimer])
  
  // 当 timeout 改变时，重置计时器
  useEffect(() => {
    if (enabled && !isPrivacyMode) {
      console.log('[Privacy] 超时时长已更新为', timeout, 'ms，重置计时器')
      resetTimer()
    }
  }, [timeout, enabled, isPrivacyMode, resetTimer])

  return {
    isPrivacyMode,
    activatePrivacy,
    deactivatePrivacy,
    resetTimer,
  }
}
