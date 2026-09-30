import React, { useState, useRef, useEffect, useCallback } from 'react'
import type { BBTalk, Comment, Attachment } from '../types'
import { bbtalkApi } from '../services/api'
import MarkdownRenderer from './MarkdownRenderer'
import CachedImage from './CachedImage'
import { AttachmentVideo, AttachmentDownload } from './AuthenticatedMedia'
import { useActionFeedback } from '../hooks/useActionFeedback'

// 内联评论按钮与列表组件
function InlineCommentSection({
  bbtalkId,
  commentCount: initialCount,
  inputVisible,
  onToggleInput,
}: {
  bbtalkId: string
  commentCount: number
  inputVisible: boolean
  onToggleInput: () => void
}) {
  const feedback = useActionFeedback()
  const [comments, setComments] = useState<Comment[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [newComment, setNewComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const sendingRef = useRef(false)
  const commentValueRef = useRef(newComment)
  commentValueRef.current = newComment

  const loadComments = useCallback(async () => {
    setLoading(true)
    try {
      const data = await bbtalkApi.getComments(bbtalkId)
      setComments(data)
      setLoaded(true)
    } finally {
      setLoading(false)
    }
  }, [bbtalkId])

  useEffect(() => {
    if (initialCount > 0 && !loaded && !loading) {
      void loadComments().catch(() => feedback.report('评论加载失败', loadComments))
    }
  }, [bbtalkId, initialCount, loaded, loading, loadComments, feedback])

  const sendComment = async () => {
    const text = newComment.trim()
    if (!text || sendingRef.current) return
    sendingRef.current = true
    setSubmitting(true)
    try {
      const comment = await bbtalkApi.createComment(bbtalkId, text)
      setComments(prev => [...prev, comment])
      if (commentValueRef.current.trim() === text) {
        setNewComment('')
        onToggleInput()
      }
      feedback.dismiss()
      setLoaded(true)
      setExpanded(true)
    } finally {
      sendingRef.current = false
      setSubmitting(false)
    }
  }

  const handleSubmit = () => {
    void sendComment().catch((error: Error) =>
      feedback.report('发送失败，评论内容已保留：' + error.message, sendComment)
    )
  }

  const handleDelete = (comment: Comment) => {
    feedback.confirm({
      title: '删除评论',
      message: `确定删除这条评论？\n\n${comment.content}`,
      confirmLabel: '确认删除',
      action: async () => {
        await bbtalkApi.deleteComment(bbtalkId, comment.uid)
        setComments(prev => prev.filter(c => c.uid !== comment.uid))
      },
    })
  }

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr)
    const diff = Date.now() - d.getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return '刚刚'
    if (mins < 60) return `${mins}分钟前`
    const hours = Math.floor(diff / 3600000)
    if (hours < 24) return `${hours}小时前`
    const days = Math.floor(diff / 86400000)
    if (days < 7) return `${days}天前`
    return d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })
  }

  return (
    <div>
      {feedback.feedback}
      {expanded && comments.length > 0 && (
        <div className="mt-3 bg-gray-50 rounded-xl px-4 py-3 space-y-2.5">
          {comments.map(comment => (
            <div key={comment.uid} className="flex items-start justify-between gap-2 group/comment text-sm">
              <p className="flex-1 text-gray-600 leading-relaxed">
                <span className="font-medium text-indigo-600">{comment.userDisplayName || comment.userUsername}</span>
                <span className="text-gray-300 mx-1">·</span>
                {comment.content}
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-gray-400">{formatTime(comment.createdAt)}</span>
                <button
                  aria-label={`删除评论：${comment.content}`}
                  onClick={() => handleDelete(comment)}
                  className="min-h-[44px] min-w-[44px] rounded text-gray-600 hover:text-red-700 focus-visible:ring-2 focus-visible:ring-blue-500 text-xs"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
          {comments.length > 3 && (
            <button onClick={() => setExpanded(false)} className="text-xs text-gray-400 hover:text-gray-600">
              收起
            </button>
          )}
        </div>
      )}

      {!expanded && comments.length > 0 && (
        <button onClick={() => setExpanded(true)} className="mt-2 text-xs text-indigo-500 hover:text-indigo-600">
          查看 {comments.length} 条评论
        </button>
      )}

      {inputVisible && (
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit()
              }
              if (e.key === 'Escape') {
                onToggleInput()
                setNewComment('')
              }
            }}
            aria-label="评论内容"
            placeholder="写一条评论... (Enter 发送, Esc 取消)"
            className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-full focus:outline-none focus:border-indigo-400 bg-gray-50 placeholder-gray-400"
            disabled={submitting}
            autoFocus
          />
          <button
            onClick={handleSubmit}
            disabled={!newComment.trim() || submitting}
            className="px-4 py-2 text-sm text-white bg-indigo-500 rounded-full hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? '...' : '发送'}
          </button>
        </div>
      )}
    </div>
  )
}

export interface BBTalkItemProps {
  bbtalk: BBTalk
  searchKeyword?: string
  isPublic?: boolean
  onEdit?: (bbtalk: BBTalk) => void
  onDelete?: (bbtalk: BBTalk) => void
  onPreviewImage?: (preview: { src: string; alt: string }) => void
  onShareSuccess?: (id: string) => void
}

/**
 * BBTalk 单条卡片组件
 * 封装完整的 Markdown 渲染、多媒体展示、元数据以及评论区
 * 使用 React.memo 进行细粒度更新优化，避免长列表中无关卡片重渲染
 */
const BBTalkItem: React.FC<BBTalkItemProps> = React.memo(function BBTalkItem({
  bbtalk,
  searchKeyword = '',
  isPublic = false,
  onEdit,
  onDelete,
  onPreviewImage,
  onShareSuccess,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [commentInputVisible, setCommentInputVisible] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭更多菜单
  useEffect(() => {
    if (!menuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  // 提取来源信息
  const getSource = () => {
    if (!bbtalk.context) return 'Web'
    if (typeof bbtalk.context === 'string') return bbtalk.context
    if (bbtalk.context.source && typeof bbtalk.context.source === 'object') {
      const sourceObj = bbtalk.context.source as { client?: string; version?: string; platform?: string }
      if (sourceObj.client && typeof sourceObj.client === 'string') {
        return sourceObj.client
      }
    }
    if (bbtalk.context.client && typeof bbtalk.context.client === 'string') {
      return bbtalk.context.client
    }
    return 'Web'
  }

  // 检测是否为移动设备
  const isMobileSource = () => {
    if (!bbtalk.context || typeof bbtalk.context !== 'object') return false
    if (bbtalk.context.source && typeof bbtalk.context.source === 'object') {
      const sourceObj = bbtalk.context.source as { client?: string; version?: string; platform?: string }
      if (sourceObj.platform) {
        const platform = sourceObj.platform.toLowerCase()
        return platform.includes('mobile') || platform.includes('android') || platform.includes('ios')
      }
    }
    return false
  }

  // 获取定位信息
  const getLocation = () => {
    if (!bbtalk.context || typeof bbtalk.context !== 'object') return null
    const loc = bbtalk.context.location as { latitude?: number; longitude?: number }
    if (loc && typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
      return loc
    }
    return null
  }

  const source = getSource()
  const isMobile = isMobileSource()
  const location = getLocation()

  // 复制分享链接（统一为 /detail/:id）
  const handleCopyLink = () => {
    const shareUrl = `${window.location.origin}/detail/${bbtalk.id}`
    navigator.clipboard.writeText(shareUrl).then(() => {
      onShareSuccess?.(bbtalk.id)
      setMenuOpen(false)
    })
  }

  // 区分附件类型
  const isImageAttachment = (attachment: Attachment) => {
    if (attachment.type === 'image') return true
    const url = (attachment.url || '').toLowerCase().split('?')[0]
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tif', '.tiff']
    return imageExts.some(ext => url.endsWith(ext))
  }

  const isVideoAttachment = (attachment: Attachment) => {
    if (attachment.type === 'video') return true
    const url = (attachment.url || '').toLowerCase().split('?')[0]
    const videoExts = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv', '.m4v']
    return videoExts.some(ext => url.endsWith(ext))
  }

  const images = (bbtalk.attachments || []).filter(isImageAttachment)
  const videos = (bbtalk.attachments || []).filter(a => !isImageAttachment(a) && isVideoAttachment(a))
  const files = (bbtalk.attachments || []).filter(a => !isImageAttachment(a) && !isVideoAttachment(a))

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
  }

  const formatRelativeTime = (dateStr: string) => {
    const now = new Date()
    const created = new Date(dateStr)
    const diffMs = now.getTime() - created.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return '刚刚'
    if (diffMins < 60) return `${diffMins} 分钟前`
    if (diffHours < 24) return `${diffHours} 小时前`
    if (diffDays < 7) return `${diffDays} 天前`
    return created.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })
  }

  const fullDateString = new Date(bbtalk.createdAt).toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  return (
    <div data-record-id={bbtalk.id} className="feed-surface bg-white rounded-2xl relative bbtalk-item group">
      <div className="p-6">
        {/* 右上角更多操作菜单 */}
        <div className="absolute top-4 right-4" ref={menuOpen ? menuRef : null}>
          <button
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors opacity-100 lg:opacity-0 lg:group-hover:opacity-100 focus:opacity-100"
            onClick={() => setMenuOpen(!menuOpen)}
            title="更多"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-32 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
              <button
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                onClick={handleCopyLink}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                复制链接
              </button>
              {!isPublic && (
                <>
                  {onEdit && (
                    <button
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                      onClick={() => {
                        setMenuOpen(false)
                        onEdit(bbtalk)
                      }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      编辑
                    </button>
                  )}
                  {onDelete && (
                    <button
                      className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-gray-100 flex items-center gap-2"
                      onClick={() => {
                        setMenuOpen(false)
                        onDelete(bbtalk)
                      }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1-1v3M4 7h16" />
                      </svg>
                      删除
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* 内容 Markdown */}
        <MarkdownRenderer content={bbtalk.content} search={searchKeyword} />

        {/* 标签 */}
        {bbtalk.tags && bbtalk.tags.length > 0 && (
          <div className="mt-4 flex gap-2 flex-wrap">
            {bbtalk.tags.map((tag, index) => (
              <span
                key={tag.id || `tag-${index}`}
                className="px-3 py-1.5 text-white rounded-full text-xs font-medium"
                style={{ backgroundColor: tag.color || '#3B82F6' }}
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}

        {/* 附件 */}
        {bbtalk.attachments && bbtalk.attachments.length > 0 && (
          <div className="mt-4">
            {/* 图片九宫格 */}
            {images.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {images.map(attachment => (
                  <div key={attachment.uid || attachment.url} className="relative group">
                    <CachedImage
                      src={attachment.url}
                      alt={attachment.originalFilename || ''}
                      className="max-w-xs max-h-64 object-contain bg-gray-50 rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => onPreviewImage?.({ src: attachment.url, alt: attachment.originalFilename || '' })}
                      objectFit="contain"
                    />
                    {attachment.originalFilename && (
                      <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs p-1 rounded-b-lg opacity-0 group-hover:opacity-100 transition-opacity truncate">
                        {attachment.originalFilename}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 视频 */}
            {videos.length > 0 && (
              <div className="flex flex-wrap gap-3 mb-3">
                {videos.map(attachment => (
                  <div key={attachment.uid || attachment.url} className="relative group max-w-md">
                    <AttachmentVideo
                      src={attachment.url}
                      controls
                      preload="metadata"
                      className="max-w-full max-h-80 rounded-lg bg-black"
                      playsInline
                    >
                      您的浏览器不支持视频播放
                    </AttachmentVideo>
                    {attachment.originalFilename && (
                      <div className="mt-1 text-xs text-gray-500 truncate">{attachment.originalFilename}</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 文件下载 */}
            {files.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {files.map(attachment => (
                  <AttachmentDownload
                    key={attachment.uid || attachment.url}
                    href={attachment.url}
                    download={attachment.originalFilename}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200 group"
                  >
                    <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-sm text-gray-800 font-medium">
                        {attachment.originalFilename || attachment.filename || '附件'}
                      </span>
                      {attachment.fileSize && (
                        <span className="text-xs text-gray-400 font-normal whitespace-nowrap">
                          ({formatFileSize(attachment.fileSize)})
                        </span>
                      )}
                    </div>
                    <svg className="w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </AttachmentDownload>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 底部元数据栏 */}
        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <div className="flex items-center gap-3">
            {/* 时间与悬浮框 */}
            <span className="text-gray-600 relative group/time cursor-help" title={fullDateString}>
              {formatRelativeTime(bbtalk.createdAt)}
              <div className="absolute bottom-full left-0 mb-2 hidden group-hover/time:block z-10 whitespace-nowrap">
                <div className="bg-gray-900 text-white px-3 py-2 rounded-lg shadow-lg text-sm">
                  <div className="font-medium">创建时间</div>
                  <div className="text-xs mt-1">{fullDateString}</div>
                  <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                </div>
              </div>
            </span>

            {/* 设备来源 */}
            <span className="flex items-center gap-1 text-gray-500 relative group/device cursor-help" title={isMobile ? '手机' : source}>
              {isMobile ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              )}
              <div className="absolute bottom-full left-0 mb-2 hidden group-hover/device:block z-10 whitespace-nowrap">
                <div className="bg-gray-900 text-white px-3 py-2 rounded-lg shadow-lg text-sm">
                  <div className="text-xs">{isMobile ? '手机' : source}</div>
                  <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                </div>
              </div>
            </span>

            {/* 定位信息 */}
            {location && location.latitude !== undefined && location.longitude !== undefined && (
              <span className="relative group/location">
                <svg className="w-4 h-4 text-green-600 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <div className="absolute bottom-full right-0 mb-2 hidden group-hover/location:block z-10 whitespace-nowrap">
                  <div className="bg-gray-900 text-white px-3 py-2 rounded-lg shadow-lg text-sm">
                    <div className="font-medium mb-1">定位信息</div>
                    <div className="text-xs">
                      <div>纬度: {location.latitude.toFixed(6)}</div>
                      <div>经度: {location.longitude.toFixed(6)}</div>
                    </div>
                    <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                  </div>
                </div>
              </span>
            )}

            {/* 可见性 */}
            <span className="flex items-center gap-1" title={bbtalk.visibility === 'public' ? '公开可见' : '仅自己可见'}>
              {bbtalk.visibility === 'public' ? (
                <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              )}
            </span>
          </div>

          {/* 评论按钮 */}
          <button
            onClick={() => setCommentInputVisible(!commentInputVisible)}
            className="text-gray-400 hover:text-indigo-500 flex items-center gap-1 transition-colors text-sm"
            title="评论"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {(bbtalk as any).commentCount > 0 && <span>{(bbtalk as any).commentCount}</span>}
          </button>
        </div>

        {/* 内联评论列表与输入框 */}
        <InlineCommentSection
          bbtalkId={bbtalk.id}
          commentCount={(bbtalk as any).commentCount ?? 0}
          inputVisible={commentInputVisible}
          onToggleInput={() => setCommentInputVisible(false)}
        />
      </div>
    </div>
  )
})

export default BBTalkItem
