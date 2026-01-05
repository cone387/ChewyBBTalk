import React, { useEffect } from 'react'

export interface DrawerProps {
  visible: boolean
  position?: 'left' | 'right' | 'top' | 'bottom'
  width?: string
  onClose: () => void
  children: React.ReactNode
  title?: string
  className?: string
}

const Drawer: React.FC<DrawerProps> = ({
  visible,
  position = 'right',
  width = '24rem',
  onClose,
  children,
  title,
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
  
  const positionStyles = {
    right: 'right-0 top-0 h-full',
    left: 'left-0 top-0 h-full',
    top: 'top-0 left-0 w-full',
    bottom: 'bottom-0 left-0 w-full'
  }
  
  const animationStyles = {
    right: visible ? 'translate-x-0' : 'translate-x-full',
    left: visible ? 'translate-x-0' : '-translate-x-full',
    top: visible ? 'translate-y-0' : '-translate-y-full',
    bottom: visible ? 'translate-y-0' : 'translate-y-full'
  }
  
  return (
    <div className="fixed inset-0 z-50">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50 transition-opacity duration-300"
        onClick={onClose}
      />
      
      {/* 抽屉内容 */}
      <div
        className={`
          absolute bg-white shadow-xl transition-transform duration-300
          ${positionStyles[position]}
          ${animationStyles[position]}
          ${className}
        `}
        style={
          position === 'left' || position === 'right'
            ? { width }
            : { height: width }
        }
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
        <div className="h-full overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  )
}

export default Drawer
