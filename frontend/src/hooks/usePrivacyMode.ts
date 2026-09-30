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
 * 6. 可选 trackCountdown 倒计时追踪（默认关闭，避免每秒触发所属组件全量重渲染）
 */

interface UsePrivacyModeOptions {
  /** 触发防窥的超时时长（毫秒），默认 5 分钟 */
  timeout?: number
  /** 是否启用防窥模式，默认 true */
  enabled?: boolean
  /** 是否在刷新后恢复防窥状态，默认 true */
  persistOnRefresh?: boolean
  /** 是否追踪每秒倒计时（默认 false，避免每秒触发所属组件全量重渲染） */
  trackCountdown?: boolean
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
  /** 剩余秒数（未启用或已进入防窥模式或未开启 trackCountdown 时为 null） */
  remainingSeconds: number | null
}

const PRIVACY_STATE_KEY = 'bbtalk_privacy_mode'
const PRIVACY_TIMESTAMP_KEY = 'bbtalk_privacy_timestamp'

export function usePrivacyMode(options: UsePrivacyModeOptions = {}): UsePrivacyModeReturn {
  const {
    timeout = 5 * 60 * 1000, // 默认 5 分钟
    enabled = true,
    persistOnRefresh = true,
    trackCountdown = false,
  } = options

  // 初始化时同步读取 localStorage，避免闪烁
  const getInitialPrivacyState = (): boolean => {
    if (!enabled || !persistOnRefresh) {
      return false
    }
    try {
      const saved = localStorage.getItem(PRIVACY_STATE_KEY)
      return saved === 'true'
    } catch (_e) {
      return false
    }
  }
  
  const [isPrivacyMode, setIsPrivacyMode] = useState(getInitialPrivacyState)
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const countdownRef = useRef<NodeJS.Timeout | null>(null)
  const lastActivityRef = useRef<number>(Date.now())
  const resetTimerRef = useRef<() => void>(() => {})
  const isPrivacyModeRef = useRef(getInitialPrivacyState())

  // 初始化：从 localStorage 恢复防窥状态
  useEffect(() => {
    if (!enabled || !persistOnRefresh) return

    try {
      const savedState = localStorage.getItem(PRIVACY_STATE_KEY)
      if (savedState === 'true') {
        setIsPrivacyMode(true)
        isPrivacyModeRef.current = true
      } else {
        setIsPrivacyMode(false)
        isPrivacyModeRef.current = false
      }
    } catch (error) {
      console.error('[Privacy] 恢复状态失败:', error)
    }
  }, [enabled, persistOnRefresh])

  // 激活防窥模式
  const activatePrivacy = useCallback(() => {
    setIsPrivacyMode(true)
    isPrivacyModeRef.current = true
    
    if (persistOnRefresh) {
      localStorage.setItem(PRIVACY_STATE_KEY, 'true')
      localStorage.setItem(PRIVACY_TIMESTAMP_KEY, lastActivityRef.current.toString())
    }
  }, [persistOnRefresh])

  // 解除防窥模式
  const deactivatePrivacy = useCallback(() => {
    setIsPrivacyMode(false)
    isPrivacyModeRef.current = false
    
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
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
    }

    // 如果当前处于防窥模式，解除
    if (isPrivacyMode) {
      deactivatePrivacy()
    }

    // 更新最后活动时间
    lastActivityRef.current = Date.now()

    // 设置新的计时器
    if (enabled) {
      const timeoutSeconds = Math.floor(timeout / 1000)
      
      if (trackCountdown) {
        setRemainingSeconds(timeoutSeconds)
        countdownRef.current = setInterval(() => {
          const elapsed = Date.now() - lastActivityRef.current
          const remaining = Math.max(0, Math.floor((timeout - elapsed) / 1000))
          setRemainingSeconds(remaining)
          
          if (remaining === 0 && countdownRef.current) {
            clearInterval(countdownRef.current)
            setRemainingSeconds(null)
          }
        }, 1000)
      } else {
        setRemainingSeconds(null)
      }
      
      timerRef.current = setTimeout(() => {
        activatePrivacy()
        setRemainingSeconds(null)
        if (countdownRef.current) {
          clearInterval(countdownRef.current)
        }
      }, timeout)
    } else {
      setRemainingSeconds(null)
    }
  }, [enabled, timeout, isPrivacyMode, trackCountdown, activatePrivacy, deactivatePrivacy])
  
  // 保存 resetTimer 到 ref
  useEffect(() => {
    resetTimerRef.current = resetTimer
  }, [resetTimer])

  // 监听用户活动事件
  useEffect(() => {
    if (!enabled) return

    // 初始化计时器（但如果已经处于防窥模式，不要重置）
    if (!isPrivacyModeRef.current) {
      resetTimerRef.current()
    }

    // 防抖：避免频繁触发
    let debounceTimer: NodeJS.Timeout | null = null
    const handleActivity = () => {
      if (isPrivacyModeRef.current) {
        return
      }
      if (debounceTimer) return
      debounceTimer = setTimeout(() => {
        debounceTimer = null
      }, 100)
      resetTimerRef.current()
    }

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click']
    events.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true })
    })

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity)
      })
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      if (countdownRef.current) {
        clearInterval(countdownRef.current)
      }
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }
    }
  }, [enabled])

  // 当 timeout 改变时，重置计时器
  useEffect(() => {
    if (enabled && !isPrivacyMode) {
      resetTimerRef.current()
    }
  }, [timeout, enabled, isPrivacyMode])

  return {
    isPrivacyMode,
    activatePrivacy,
    deactivatePrivacy,
    resetTimer,
    remainingSeconds,
  }
}
