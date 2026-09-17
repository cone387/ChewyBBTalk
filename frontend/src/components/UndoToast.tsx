import { useEffect, useRef, useState } from 'react'

interface UndoToastProps {
  visible: boolean
  message?: string
  onUndo: () => void
  onDismiss: () => void
  duration?: number
}

export default function UndoToast({
  visible,
  message = '已删除',
  onUndo,
  onDismiss,
  duration = 3000,
}: UndoToastProps) {
  const [show, setShow] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss

  useEffect(() => {
    let frame: number | undefined
    if (visible) {
      // Small delay to trigger CSS transition
      frame = requestAnimationFrame(() => setShow(true))
      timerRef.current = setTimeout(() => {
        setShow(false)
        dismissTimerRef.current = setTimeout(() => onDismissRef.current(), 300)
      }, duration)
    } else {
      setShow(false)
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
      if (frame !== undefined) cancelAnimationFrame(frame)
    }
  }, [visible, duration])

  const handleUndo = () => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setShow(false)
    onUndo()
  }

  if (!visible) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:bottom-6 left-1/2 -translate-x-1/2 z-[60] transition-all duration-300 ease-out ${
        show ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
    >
      <div className="flex items-center gap-3 bg-gray-800 text-white px-5 py-3 rounded-xl shadow-lg">
        <span className="text-sm">{message}</span>
        <button
          onClick={handleUndo}
          className="text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors"
        >
          撤销
        </button>
      </div>
    </div>
  )
}
