import { useEffect, useState, useRef, useCallback } from 'react'
import { imageCacheService } from '../services/cache/imageCache'

interface ImagePreviewProps {
  src: string
  alt?: string
  onClose: () => void
}

// 获取两指间距
function getTouchDistance(t1: React.Touch, t2: React.Touch) {
  return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
}

export default function ImagePreview({ src, alt, onClose }: ImagePreviewProps) {
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [showUI, setShowUI] = useState(true)
  const [imageSrc, setImageSrc] = useState(src)

  const containerRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const pinchStartRef = useRef({ dist: 0, scale: 1 })
  const lastTapRef = useRef(0)
  const animating = useRef(false)
  const swipeStartRef = useRef({ y: 0, startPos: { x: 0, y: 0 } })
  const objectUrlRef = useRef<string | null>(null)

  // 从缓存加载图片，避免重复网络请求
  useEffect(() => {
    let cancelled = false
    imageCacheService.get(src).then(blob => {
      if (cancelled) return
      if (blob) {
        const url = URL.createObjectURL(blob)
        objectUrlRef.current = url
        setImageSrc(url)
      }
    })
    return () => {
      cancelled = true
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
    }
  }, [src])

  // 锁定 body 滚动
  useEffect(() => {
    const orig = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = orig }
  }, [])

  // ESC 关闭
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  // 自动隐藏 UI
  useEffect(() => {
    const timer = setTimeout(() => setShowUI(false), 3000)
    return () => clearTimeout(timer)
  }, [showUI])

  const resetTransform = useCallback(() => {
    animating.current = true
    setScale(1)
    setPosition({ x: 0, y: 0 })
    setTimeout(() => { animating.current = false }, 300)
  }, [])

  // === 触摸事件 ===
  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation()
    setShowUI(true)

    if (e.touches.length === 1) {
      // 双击检测
      const now = Date.now()
      if (now - lastTapRef.current < 300) {
        // 双击切换缩放
        if (scale > 1.1) {
          resetTransform()
        } else {
          animating.current = true
          setScale(2)
          setPosition({ x: 0, y: 0 })
          setTimeout(() => { animating.current = false }, 300)
        }
        lastTapRef.current = 0
        return
      }
      lastTapRef.current = now

      // 单指拖拽 / 下滑关闭
      const touch = e.touches[0]
      dragStartRef.current = { x: touch.clientX - position.x, y: touch.clientY - position.y }
      swipeStartRef.current = { y: touch.clientY, startPos: { ...position } }
      setIsDragging(true)
    } else if (e.touches.length === 2) {
      // 双指缩放
      setIsDragging(false)
      const dist = getTouchDistance(e.touches[0], e.touches[1])
      pinchStartRef.current = { dist, scale }
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation()
    if (e.touches.length === 2) {
      // 双指缩放
      const dist = getTouchDistance(e.touches[0], e.touches[1])
      const newScale = Math.min(Math.max(0.5, pinchStartRef.current.scale * (dist / pinchStartRef.current.dist)), 5)
      setScale(newScale)
    } else if (e.touches.length === 1 && isDragging) {
      const touch = e.touches[0]
      if (scale > 1.05) {
        // 放大时: 自由拖拽
        setPosition({
          x: touch.clientX - dragStartRef.current.x,
          y: touch.clientY - dragStartRef.current.y,
        })
      } else {
        // 原始大小: 只允许垂直滑动（下滑关闭）
        const dy = touch.clientY - swipeStartRef.current.y
        setPosition({ x: 0, y: dy })
      }
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation()
    setIsDragging(false)

    // 缩放回弹
    if (scale < 1) {
      resetTransform()
      return
    }

    // 下滑关闭（原始大小下滑超过 100px）
    if (scale <= 1.05 && Math.abs(position.y) > 100) {
      onClose()
      return
    }

    // 原始大小时回弹到中心
    if (scale <= 1.05 && (position.x !== 0 || position.y !== 0)) {
      animating.current = true
      setPosition({ x: 0, y: 0 })
      setTimeout(() => { animating.current = false }, 200)
    }
  }

  // === 鼠标事件 (桌面端) ===
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.15 : 0.15
    setScale(prev => Math.min(Math.max(0.5, prev + delta), 5))
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      setIsDragging(true)
      dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y }
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({ x: e.clientX - dragStartRef.current.x, y: e.clientY - dragStartRef.current.y })
    }
  }

  const handleMouseUp = () => setIsDragging(false)

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black"
      onClick={onClose}
    >
      {/* 关闭按钮 - 始终显示 */}
      <button
        onClick={(e) => { e.stopPropagation(); onClose() }}
        className="absolute top-3 right-3 z-20 w-10 h-10 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center active:bg-black/60 transition-opacity"
        style={{ opacity: showUI ? 1 : 0.3 }}
      >
        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* 缩放比例 - 非100%时显示 */}
      {Math.abs(scale - 1) > 0.05 && (
        <div className="absolute top-3 left-3 z-20 bg-black/40 backdrop-blur-sm rounded-full px-3 py-1.5 text-white text-xs">
          {Math.round(scale * 100)}%
        </div>
      )}

      {/* 图片容器 */}
      <div
        ref={containerRef}
        className="w-full h-full flex items-center justify-center overflow-hidden touch-none"
        onClick={(e) => e.stopPropagation()}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ cursor: isDragging ? 'grabbing' : scale > 1 ? 'grab' : 'default' }}
      >
        <img
          src={imageSrc}
          alt={alt}
          className="w-full h-full object-contain select-none"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transition: animating.current ? 'transform 0.25s ease-out' : isDragging ? 'none' : 'transform 0.1s ease-out',
            willChange: 'transform',
          }}
          draggable={false}
        />
      </div>

      {/* 提示 - 自动消失 */}
      {showUI && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 bg-black/40 backdrop-blur-sm rounded-full px-4 py-2 text-white text-xs whitespace-nowrap transition-opacity">
          双击缩放 · 下滑关闭
        </div>
      )}
    </div>
  )
}
