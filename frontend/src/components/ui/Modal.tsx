import { createPortal } from 'react-dom'
import React, { useEffect, useId, useRef } from 'react'

const openModals: HTMLElement[] = []
let originalOverflow = ''

export interface ModalProps {
  visible: boolean
  title?: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  width?: string
  className?: string
}

const Modal: React.FC<ModalProps> = ({
  visible,
  title,
  onClose,
  children,
  footer,
  width = '32rem',
  className = ''
}) => {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const titleId = useId()

  useEffect(() => {
    if (!visible || !dialogRef.current) return
    const dialog = dialogRef.current
    const previousFocus = document.activeElement as HTMLElement | null
    if (openModals.length === 0) {
      originalOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    openModals.push(dialog)
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'
    )).filter(element => element.tabIndex >= 0 && !element.closest('[hidden], [inert]') && getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden')
    ;(focusable()[0] ?? dialog).focus()
    const handleKey = (event: KeyboardEvent) => {
      if (openModals[openModals.length - 1] !== dialog) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeRef.current()
      } else if (event.key === 'Tab') {
        const controls = focusable()
        const first = controls[0]
        const last = controls[controls.length - 1]
        if (!first) { event.preventDefault(); dialog.focus(); return }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
          event.preventDefault(); last.focus()
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
          event.preventDefault(); first.focus()
        }
      }
    }
    const containFocus = (event: FocusEvent) => {
      if (openModals[openModals.length - 1] === dialog && !dialog.contains(event.target as Node)) {
        (focusable()[0] ?? dialog).focus()
      }
    }
    document.addEventListener('keydown', handleKey)
    document.addEventListener('focusin', containFocus)
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.removeEventListener('focusin', containFocus)
      const index = openModals.indexOf(dialog)
      const wasTop = index === openModals.length - 1
      if (index >= 0) openModals.splice(index, 1)
      if (openModals.length === 0) document.body.style.overflow = originalOverflow
      if (wasTop && previousFocus?.isConnected) previousFocus.focus()
    }
  }, [visible])

  if (!visible) return null
  
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black bg-opacity-50 transition-opacity duration-200" />
      
      {/* 模态框内容 */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : '对话框'}
        tabIndex={-1}
        className={`relative flex flex-col bg-white rounded-lg shadow-xl max-h-[90dvh] overflow-hidden ${className}`}
        style={{ width, maxWidth: '90vw' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        {title && (
          <div className="shrink-0 px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 id={titleId} className="min-w-0 break-words text-lg font-semibold text-gray-900">{title}</h3>
              <button
                onClick={onClose}
                className="shrink-0 min-w-11 min-h-11 flex items-center justify-center text-gray-500 hover:text-gray-600 transition-colors"
                aria-label="关闭"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}
        
        {/* 内容 */}
        <div className="min-h-0 overflow-y-auto px-6 py-4">
          {children}
        </div>
        
        {/* 底部 */}
        {footer && (
          <div className="shrink-0 px-6 py-4 border-t border-gray-200 bg-gray-50">
            {footer}
          </div>
        )}
      </div>
    </div>, document.body
  )
}

export default Modal
