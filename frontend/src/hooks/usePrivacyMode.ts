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
  /** 剩余秒数（未启用或已进入防窥模式时为 null） */
  remainingSeconds: number | null
}

const PRIVACY_STATE_KEY = 'bbtalk_privacy_mode'
const PRIVACY_TIMESTAMP_KEY = 'bbtalk_privacy_timestamp'

export function usePrivacyMode(options: UsePrivacyModeOptions = {}): UsePrivacyModeReturn {
  const {
    timeout = 5 * 60 * 1000, // 默认 5 分钟
    enabled = true,
    persistOnRefresh = true,
  } = options

  // 初始化时同步读取 localStorage，避免闪烁
  const getInitialPrivacyState = (): boolean => {
    if (!enabled || !persistOnRefresh) {
      console.log('[Privacy] 初始化跳过: enabled=', enabled, 'persistOnRefresh=', persistOnRefresh)
      return false
    }
    try {
      const saved = localStorage.getItem(PRIVACY_STATE_KEY)
      console.log('[Privacy] 初始化读取 localStorage:', saved)
      return saved === 'true'
    } catch (_e) {
      console.log('[Privacy] 初始化读取失败')
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
      
      // 如果保存了防窥状态，直接恢复（不管时间）
      // 这样可以防止通过刷新、后退/前进等方式绕过防窥模式
      if (savedState === 'true') {
        console.log('[Privacy] 恢复防窥状态')
        setIsPrivacyMode(true)
        isPrivacyModeRef.current = true
        // 不要在这里清除计时器，让用户必须通过解锁页面来解除防窥
      } else {
        // 如果没有保存防窥状态，确保状态为 false
        console.log('[Privacy] 无防窥状态，确保为 false')
        setIsPrivacyMode(false)
        isPrivacyModeRef.current = false
      }
    } catch (error) {
      console.error('[Privacy] 恢复状态失败:', error)
    }
  }, [enabled, persistOnRefresh])

  // 激活防窥模式
  const activatePrivacy = useCallback(() => {
    console.log('[Privacy] 激活防窥模式')
    setIsPrivacyMode(true)
    isPrivacyModeRef.current = true
    
    if (persistOnRefresh) {
      localStorage.setItem(PRIVACY_STATE_KEY, 'true')
      localStorage.setItem(PRIVACY_TIMESTAMP_KEY, lastActivityRef.current.toString())
      console.log('[Privacy] 已保存到 localStorage:', localStorage.getItem(PRIVACY_STATE_KEY))
    }
  }, [persistOnRefresh])

  // 解除防窥模式
  const deactivatePrivacy = useCallback(() => {
    console.log('[Privacy] 解除防窥模式')
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
    console.log('[Privacy] 重置计时器')
    
    // 清除旧的计时器
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      console.log('[Privacy] 清除旧的超时计时器')
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      console.log('[Privacy] 清除旧的倒计时')
    }

    // 如果当前处于防窥模式，解除
    if (isPrivacyMode) {
      console.log('[Privacy] 当前处于防窥模式，解除中...')
      deactivatePrivacy()
    }

    // 更新最后活动时间
    lastActivityRef.current = Date.now()
    console.log('[Privacy] 更新最后活动时间:', new Date(lastActivityRef.current).toLocaleTimeString())

    // 设置新的计时器
    if (enabled) {
      const timeoutSeconds = Math.floor(timeout / 1000)
      console.log('[Privacy] 设置新计时器，超时时长:', timeoutSeconds, '秒')
      
      // 设置倒计时
      setRemainingSeconds(timeoutSeconds)
      
      // 每秒更新倒计时
      countdownRef.current = setInterval(() => {
        const elapsed = Date.now() - lastActivityRef.current
        const remaining = Math.max(0, Math.floor((timeout - elapsed) / 1000))
        setRemainingSeconds(remaining)
        
        if (remaining === 0 && countdownRef.current) {
          console.log('[Privacy] 倒计时结束，清除倒计时定时器')
          clearInterval(countdownRef.current)
          setRemainingSeconds(null)
        }
      }, 1000)
      
      timerRef.current = setTimeout(() => {
        console.log('[Privacy] ⏰ 超时触发！准备激活防窥模式')
        activatePrivacy()
        setRemainingSeconds(null)
        if (countdownRef.current) {
          clearInterval(countdownRef.current)
        }
      }, timeout)
      
      console.log('[Privacy] 计时器设置完成，将在', timeoutSeconds, '秒后触发')
    } else {
      console.log('[Privacy] 防窥模式未启用')
      setRemainingSeconds(null)
    }
  }, [enabled, timeout, isPrivacyMode, activatePrivacy, deactivatePrivacy])
  
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
      // 如果当前处于防窥模式，不触发重置（只能通过点击解锁按钮解除）
      if (isPrivacyModeRef.current) {
        console.log('[Privacy] 当前处于防窥模式，忽略用户活动')
        return
      }
      
      // 如果正在防抖中，忽略此次事件
      if (debounceTimer) return
      
      // 设置防抖，100ms 内只触发一次
      debounceTimer = setTimeout(() => {
        debounceTimer = null
      }, 100)
      
      // 使用 ref 中的最新函数
      resetTimerRef.current()
    }

    // 监听多种用户活动
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click']
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
      if (countdownRef.current) {
        clearInterval(countdownRef.current)
      }
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]) // 只依赖 enabled，避免重复绑定
  
  // 当 timeout 改变时，重置计时器
  useEffect(() => {
    if (enabled && !isPrivacyMode) {
      console.log('[Privacy] 超时时长已更新为', timeout, 'ms，重置计时器')
      resetTimerRef.current()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeout, enabled, isPrivacyMode]) // 故意不包含 resetTimer，避免循环

  return {
    isPrivacyMode,
    activatePrivacy,
    deactivatePrivacy,
    resetTimer,
    remainingSeconds,
  }
}
