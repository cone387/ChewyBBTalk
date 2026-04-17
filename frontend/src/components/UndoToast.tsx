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

  useEffect(() => {
    if (visible) {
      // Small delay to trigger CSS transition
      requestAnimationFrame(() => setShow(true))
      timerRef.current = setTimeout(() => {
        setShow(false)
        setTimeout(onDismiss, 300) // Wait for slide-out animation
      }, duration)
    } else {
      setShow(false)
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [visible, duration, onDismiss])

  const handleUndo = () => {
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
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ease-out ${
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
