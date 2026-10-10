import Icon from './ui/Icon'
import { useEffect, useState, useRef, useCallback } from 'react'
import { imageCacheService } from '../services/cache/imageCache'

interface ImagePreviewProps {
  src: string
  alt?: string
  images?: { src: string; alt: string }[]
  onClose: () => void
}

// 获取两指间距
function getTouchDistance(t1: React.Touch, t2: React.Touch) {
  return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
}

export default function ImagePreview({ src: initialSrc, alt: initialAlt, images, onClose }: ImagePreviewProps) {
  const [index, setIndex] = useState(() => Math.max(0, images?.findIndex(image => image.src === initialSrc) ?? 0))
  const src = images?.[index]?.src ?? initialSrc
  const alt = images?.[index]?.alt ?? initialAlt
  const count = images?.length ?? 1
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [showUI, setShowUI] = useState(true)
  const [imageSrc, setImageSrc] = useState('')
  const [loadError, setLoadError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  const containerRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const pinchStartRef = useRef({ dist: 0, scale: 1 })
  const lastTapRef = useRef(0)
  const animating = useRef(false)
  const swipeStartRef = useRef({ y: 0, startPos: { x: 0, y: 0 } })
  const objectUrlRef = useRef<string | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    return () => previous?.focus()
  }, [])

  useEffect(() => { setScale(1); setPosition({ x: 0, y: 0 }); setShowUI(true); setAttempt(0) }, [src])

  // 从缓存加载图片，避免重复网络请求
  useEffect(() => {
    let cancelled = false
    setImageSrc('')
    setLoadError(false)
    imageCacheService.getOrFetch(src, attempt > 0).then(blob => {
      if (cancelled) return
      if (blob) {
        const url = URL.createObjectURL(blob)
        objectUrlRef.current = url
        setImageSrc(url)
      } else { setLoadError(true) }
    }).catch(() => { if (!cancelled) setLoadError(true) })
    return () => {
      cancelled = true
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
    }
  }, [src, attempt])

  // 锁定 body 滚动
  useEffect(() => {
    const orig = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = orig }
  }, [])

  // ESC 关闭
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (count > 1 && e.key === 'ArrowRight') setIndex(value => (value + 1) % count)
      if (count > 1 && e.key === 'ArrowLeft') setIndex(value => (value + count - 1) % count)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, count])

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
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
      onKeyDown={event => {
        if (event.key !== 'Tab') return
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'))
        const first = buttons[0], last = buttons[buttons.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }}
      onClick={onClose}
    >
      {/* 关闭按钮 - 始终显示 */}
      <button
        ref={closeRef}
        aria-label="关闭图片预览"
        onClick={(e) => { e.stopPropagation(); onClose() }}
        className="absolute top-3 right-3 z-20 w-11 h-11 bg-black/60 rounded-full flex items-center justify-center focus-visible:ring-2 focus-visible:ring-white"
      >
        <Icon name="close" className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" />
      </button>

      {count > 1 && <>
        <div aria-live="polite" className="absolute top-4 left-1/2 -translate-x-1/2 z-20 rounded-full bg-black/60 px-4 py-2 text-white">{index + 1} / {count}</div>
        <button aria-label="上一张图片" className="absolute left-2 z-20 flex items-center justify-center min-h-11 min-w-11 rounded-full bg-black/60 text-2xl text-white focus-visible:ring-2 focus-visible:ring-white" onClick={event => { event.stopPropagation(); setIndex(value => (value + count - 1) % count) }}><Icon name="chevronLeft" size={20} /></button>
        <button aria-label="下一张图片" className="absolute right-2 z-20 flex items-center justify-center min-h-11 min-w-11 rounded-full bg-black/60 text-2xl text-white focus-visible:ring-2 focus-visible:ring-white" onClick={event => { event.stopPropagation(); setIndex(value => (value + 1) % count) }}><Icon name="chevronRight" size={20} /></button>
      </>}

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
        {!imageSrc && !loadError && <span role="status" className="text-white">加载图片…</span>}
        {loadError && <button className="rounded-lg bg-white px-4 py-3 text-gray-900" onClick={e => { e.stopPropagation(); setAttempt(value => value + 1) }}>加载失败，重试</button>}
        {imageSrc && <img
          src={imageSrc || undefined}
          alt={alt}
          className="w-full h-full object-contain select-none"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transition: animating.current ? 'transform 0.25s ease-out' : isDragging ? 'none' : 'transform 0.1s ease-out',
            willChange: 'transform',
          }}
          draggable={false}
        />}
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
