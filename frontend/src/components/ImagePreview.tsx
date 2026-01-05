import { useEffect, useState } from 'react'

interface ImagePreviewProps {
  src: string
  alt?: string
  onClose: () => void
}

export default function ImagePreview({ src, alt, onClose }: ImagePreviewProps) {
  const [scale, setScale] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  // ESC键关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // 鼠标滚轮缩放
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    setScale(prev => Math.min(Math.max(0.5, prev + delta), 3))
  }

  // 拖拽开始
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      setIsDragging(true)
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y
      })
    }
  }

  // 拖拽中
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      })
    }
  }

  // 拖拽结束
  const handleMouseUp = () => {
    setIsDragging(false)
  }

  // 重置
  const handleReset = () => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-90 z-[9999] flex items-center justify-center"
      onClick={onClose}
    >
      {/* 工具栏 */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <div className="bg-white bg-opacity-20 backdrop-blur-sm rounded-lg px-3 py-1.5 text-white text-sm">
          {Math.round(scale * 100)}%
        </div>
        
        {/* 放大 */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            setScale(prev => Math.min(prev + 0.2, 3))
          }}
          className="w-9 h-9 bg-white bg-opacity-20 backdrop-blur-sm hover:bg-opacity-30 rounded-lg flex items-center justify-center transition-colors"
          title="放大 (滚轮向上)"
        >
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
          </svg>
        </button>

        {/* 缩小 */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            setScale(prev => Math.max(prev - 0.2, 0.5))
          }}
          className="w-9 h-9 bg-white bg-opacity-20 backdrop-blur-sm hover:bg-opacity-30 rounded-lg flex items-center justify-center transition-colors"
          title="缩小 (滚轮向下)"
        >
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
          </svg>
        </button>

        {/* 重置 */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleReset()
          }}
          className="w-9 h-9 bg-white bg-opacity-20 backdrop-blur-sm hover:bg-opacity-30 rounded-lg flex items-center justify-center transition-colors"
          title="重置"
        >
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>

        {/* 关闭 */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          className="w-9 h-9 bg-white bg-opacity-20 backdrop-blur-sm hover:bg-opacity-30 rounded-lg flex items-center justify-center transition-colors"
          title="关闭 (ESC)"
        >
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 图片容器 */}
      <div
        className="relative max-w-full max-h-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isDragging ? 'grabbing' : scale > 1 ? 'grab' : 'default' }}
      >
        <img
          src={src}
          alt={alt}
          className="max-w-screen max-h-screen object-contain select-none"
          style={{
            transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
            transition: isDragging ? 'none' : 'transform 0.2s ease-out'
          }}
          draggable={false}
        />
      </div>

      {/* 提示文本 */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-white bg-opacity-20 backdrop-blur-sm rounded-lg px-4 py-2 text-white text-sm">
        滚轮缩放 · 拖拽移动 · ESC/点击背景关闭
      </div>
    </div>
  )
}
