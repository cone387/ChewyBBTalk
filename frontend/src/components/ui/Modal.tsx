import React, { useEffect } from 'react'

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
  useEffect(() => {
    if (visible) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [visible])
  
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && visible) {
        onClose()
      }
    }
    
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [visible, onClose])
  
  if (!visible) return null
  
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black bg-opacity-50 transition-opacity duration-200" />
      
      {/* 模态框内容 */}
      <div
        className={`relative bg-white rounded-lg shadow-xl max-h-[90vh] overflow-hidden ${className}`}
        style={{ width, maxWidth: '90vw' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        {title && (
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
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
        <div className="px-6 py-4">
          {children}
        </div>
        
        {/* 底部 */}
        {footer && (
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

export default Modal
