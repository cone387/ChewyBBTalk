import { useState, useEffect, useRef } from 'react'
import { imageCacheService } from '../services/cache/imageCache'

interface CachedImageProps {
  src: string
  alt?: string
  className?: string
  onClick?: () => void
  onLoad?: () => void
  onError?: () => void
  fallback?: React.ReactNode
  loading?: 'lazy' | 'eager'
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down'
}

function CachedImageContent({
  src,
  alt = '',
  className = '',
  onClick,
  onLoad,
  onError,
  fallback,
  loading = 'lazy',
  objectFit = 'contain',
}: CachedImageProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [isVisible, setIsVisible] = useState(loading === 'eager') // eager 模式立即可见
  const [attempt, setAttempt] = useState(0)
  const callbacks = useRef({ onLoad, onError })
  callbacks.current = { onLoad, onError }
  const objectUrlRef = useRef<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // 使用 Intersection Observer 检测元素是否进入视口
  useEffect(() => {
    if (loading === 'eager') return // eager 模式不需要观察

    const container = containerRef.current
    if (!container) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true)
            observer.disconnect() // 一旦可见，停止观察
          }
        })
      },
      {
        rootMargin: '200px', // 提前 200px 开始加载（约1屏的距离）
        threshold: 0.01, // 至少 1% 可见时触发
      }
    )

    observer.observe(container)

    return () => {
      observer.disconnect()
    }
  }, [loading])

  // 当元素可见时才加载图片
  useEffect(() => {
    if (!isVisible) return

    let cancelled = false

    const loadImage = async () => {
      try {
        setIsLoading(true)
        setHasError(false)

        // 从缓存或网络获取图片
        const blob = await imageCacheService.getOrFetch(src, attempt > 0)

        if (cancelled) return

        if (blob) {
          // 释放之前的 Object URL
          if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current)
          }

          // 创建新的 Object URL
          const url = URL.createObjectURL(blob)
          objectUrlRef.current = url
          setImageUrl(url)
          setIsLoading(false)

        } else {
          throw new Error('Failed to load image')
        }
      } catch (error) {
        if (cancelled) return

        // console.error('[CachedImage] 加载失败:', src, error)
        setHasError(true)
        setIsLoading(false)
        callbacks.current.onError?.()
      }
    }

    loadImage()

    // 清理函数
    return () => {
      cancelled = true
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
    }
  }, [src, isVisible, attempt])

  // 加载中状态
  if (isLoading || !isVisible) {
    return (
      <div ref={containerRef} className={`${className} bg-gray-100 animate-pulse flex items-center justify-center`}>
        <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
    )
  }

  // 自定义占位图也保留真正的重试入口。
  if (hasError) {
    return (
      <div className="max-w-full flex flex-col items-center gap-2">
        {fallback || <div className={`${className} bg-gray-100 flex items-center justify-center text-sm text-gray-600`}>图片加载失败</div>}
        <button
          type="button"
          className="min-h-11 px-3 rounded-lg border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50"
          aria-label={`重试加载图片${alt ? ` ${alt}` : ''}`}
          onClick={() => { setHasError(false); setIsLoading(true); setAttempt(value => value + 1) }}
        >重试加载图片</button>
      </div>
    )
  }

  // 正常显示图片
  return (
    <img
      src={imageUrl || ''}
      onLoad={() => callbacks.current.onLoad?.()}
      onError={() => { setHasError(true); callbacks.current.onError?.() }}
      alt={alt}
      className={className}
      onClick={onClick}
      loading={loading}
      style={{ objectFit }}
    />
  )
}

// 新资源从独立状态开始，避免显示旧图片或旧错误。
export default function CachedImage(props: CachedImageProps) {
  return <CachedImageContent key={props.src} {...props} />
}
