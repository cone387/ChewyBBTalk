import Icon from './ui/Icon'
import Button from './ui/Button'
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import type { BBTalk, Comment, Attachment } from '../types'
import { bbtalkApi } from '../services/api'
import MarkdownRenderer from './MarkdownRenderer'
import CachedImage from './CachedImage'
import { AttachmentVideo, AttachmentDownload } from './AuthenticatedMedia'
import { useActionFeedback } from '../hooks/useActionFeedback'
import { useHref } from 'react-router-dom'
import { commentCache } from '../services/cache/commentCache'
import { getAuthSessionScope } from '../services/authSessionScope'

// 内联评论按钮与列表组件
function InlineCommentSection({
  bbtalkId,
  commentCount: initialCount,
  preview,
  revision,
  recordSession,
  inputVisible,
  onToggleInput,
  onCountChange,
  readOnly = false,
}: {
  bbtalkId: string
  commentCount: number
  preview?: Comment[]
  revision?: string
  recordSession: string
  inputVisible: boolean
  onToggleInput: () => void
  onCountChange: (count: number) => void
  readOnly?: boolean
}) {
  const feedback = useActionFeedback()
  const feedbackRef = useRef(feedback)
  feedbackRef.current = feedback
  const seed = useCallback(() => {
    if (getAuthSessionScope() !== recordSession) return { comments: [], count: 0, loaded: true, nextPage: null, source: '', recordId: bbtalkId }
    return commentCache.seed(bbtalkId, initialCount, preview, revision, readOnly)
  }, [bbtalkId, initialCount, preview, revision, readOnly, recordSession])
  const [snapshot, setSnapshot] = useState(seed)
  const { comments, count, loaded, nextPage } = snapshot
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const sendingRef = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const commentValueRef = useRef(newComment)
  commentValueRef.current = newComment
  useEffect(() => { onCountChange(count) }, [count, onCountChange])
  useEffect(() => {
    setSnapshot(seed())
    return commentCache.subscribe(bbtalkId, readOnly, () => setSnapshot(seed()))
  }, [seed, bbtalkId, readOnly])

  const loadComments = useCallback(async (page = 1) => {
    if (getAuthSessionScope() !== recordSession) return
    seed()
    setLoading(true)
    try {
      await commentCache.load(bbtalkId, readOnly, page, async requestedPage => {
        if (preview !== undefined) return bbtalkApi.getCommentPage(bbtalkId, requestedPage, readOnly)
        const data = await bbtalkApi.getComments(bbtalkId, readOnly)
        return { count: data.length, next: null, previous: null, results: data, revision: '' }
      })
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [bbtalkId, readOnly, preview, seed, recordSession])

  const requestComments = useCallback((page = 1) => {
    void loadComments(page).catch(() => {
      if (mounted.current) feedbackRef.current.report('评论加载失败', () => loadComments(page))
    })
  }, [loadComments])

  // Preview-bearing lists need no per-card reads. Legacy servers still work.
  const attemptedFor = useRef('')
  useEffect(() => {
    const attemptKey = JSON.stringify([bbtalkId, revision, initialCount, readOnly])
    if (preview === undefined && initialCount > 0 && !loaded && attemptedFor.current !== attemptKey) {
      attemptedFor.current = attemptKey
      requestComments()
    }
  }, [bbtalkId, revision, initialCount, readOnly, preview, loaded, requestComments])

  const previousRevision = useRef(revision)
  useEffect(() => {
    if (previousRevision.current !== revision) {
      previousRevision.current = revision
      if (expanded) requestComments()
    }
  }, [revision, expanded, requestComments])

  useEffect(() => {
    if (!readOnly) return
    setExpanded(inputVisible)
    if (inputVisible) requestComments()
  }, [readOnly, inputVisible, requestComments])

  const sendComment = async () => {
    const text = newComment.trim()
    if (!text || sendingRef.current || getAuthSessionScope() !== recordSession) return
    sendingRef.current = true
    setSubmitting(true)
    const session = getAuthSessionScope()
    try {
      const comment = await bbtalkApi.createComment(bbtalkId, text)
      if (getAuthSessionScope() !== session) return
      commentCache.mutate(bbtalkId, readOnly, { add: comment })
      if (!mounted.current) return
      if (commentValueRef.current.trim() === text) {
        setNewComment('')
        onToggleInput()
      }
      feedback.dismiss()
      setExpanded(true)
    } finally {
      sendingRef.current = false
      if (mounted.current) setSubmitting(false)
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
        if (getAuthSessionScope() !== recordSession) return
        const session = getAuthSessionScope()
        await bbtalkApi.deleteComment(bbtalkId, comment.uid)
        if (getAuthSessionScope() === session) commentCache.mutate(bbtalkId, readOnly, { remove: comment.uid })
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
      {count > 0 && (
        <div className="mt-3 bg-gray-50 rounded-xl px-4 py-3 space-y-2.5">
          {(expanded ? comments : comments.slice(0, 3)).map(comment => (
            <div key={comment.uid} className="flex items-start justify-between gap-2 group/comment text-sm">
              <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-gray-600 leading-relaxed">
                <span className="font-medium text-blue-700">{comment.userDisplayName || comment.userUsername}</span>
                <span className="text-gray-300 mx-1">·</span>
                {comment.content}
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-gray-600">{formatTime(comment.createdAt)}</span>
                {!readOnly && <button
                  aria-label={`删除评论：${comment.content}`}
                  onClick={() => handleDelete(comment)}
                  className="app-icon-button comment-delete hover:text-red-700"
                >
                  <Icon name="close" size={16} />
                </button>}
              </div>
            </div>
          ))}
          {(count > 3 || count > comments.length) && (
            <button onClick={() => { if (!expanded) requestComments(); setExpanded(value => !value) }} className="min-h-11 px-2 text-sm text-blue-700 hover:text-blue-800">
              {expanded ? '收起评论' : `查看全部 ${count} 条评论`}
            </button>
          )}
          {expanded && nextPage !== null && <button disabled={loading} onClick={() => requestComments(nextPage)} className="min-h-11 px-2 text-sm text-blue-700 hover:text-blue-800">{loading ? '正在加载评论…' : '加载更多评论'}</button>}
        </div>
      )}

      {inputVisible && !readOnly && (
        <div className="mt-3 flex items-end gap-2">
          <textarea
            rows={2}
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
            placeholder="写一条评论（Enter 发送，Shift+Enter 换行）"
            className="app-input app-input--comment min-w-0 flex-1"
            disabled={submitting}
            autoFocus
          />
          <Button variant="ghost" onClick={handleSubmit} disabled={!newComment.trim()} loading={submitting} className="comment-send shrink-0">发送</Button>
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
  onTogglePin?: (bbtalk: BBTalk) => void
  onPreviewImage?: (preview: { src: string; alt: string; images?: { src: string; alt: string }[] }) => void
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
  onTogglePin,
  onPreviewImage,
  onShareSuccess,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [commentInputVisible, setCommentInputVisible] = useState(false)
  const [commentCount, setCommentCount] = useState(bbtalk.commentCount ?? 0)
  // A new server record authorizes new previews. Session events alone must not
  // re-label a mounted record's old private props as belonging to a new account.
  const recordSession = useMemo(() => getAuthSessionScope(), [bbtalk])
  const menuRef = useRef<HTMLDivElement>(null)
  const shareFeedback = useActionFeedback()
  const detailPath = useHref(`/detail/${bbtalk.id}`)

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
  const copyLink = async () => {
    const shareUrl = new URL(detailPath, window.location.origin).href
    if (!navigator.clipboard) throw new Error('浏览器暂不支持复制，请打开记录详情后复制地址栏中的链接')
    await navigator.clipboard.writeText(shareUrl)
    onShareSuccess?.(bbtalk.id)
    setMenuOpen(false)
  }
  const handleCopyLink = () => { void copyLink().catch(() => shareFeedback.report('复制失败，请检查浏览器剪贴板权限后重试', copyLink)) }

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
      {shareFeedback.feedback}
      <div className="p-4 sm:p-6">
        {/* 右上角更多操作菜单 */}
        <div className="absolute top-4 right-4" ref={menuOpen ? menuRef : null}>
          <button
            className="flex h-11 w-11 items-center justify-center hover:bg-gray-100 rounded-lg transition-colors opacity-100"
            aria-label="更多操作"
            onClick={() => setMenuOpen(!menuOpen)}
            title="更多"
          >
            <Icon className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </Icon>
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-32 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
              <button
                className="app-menu-item"
                onClick={handleCopyLink}
              >
                <Icon name="link" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" />
                复制链接
              </button>
              {!isPublic && (
                <>
                  {onTogglePin && <button className="app-menu-item" onClick={() => { setMenuOpen(false); onTogglePin(bbtalk) }}><Icon name="pin" size={16} />{bbtalk.isPinned ? '取消置顶' : '置顶'}</button>}
                  {onEdit && (
                    <button
                      className="app-menu-item"
                      onClick={() => {
                        setMenuOpen(false)
                        onEdit(bbtalk)
                      }}
                    >
                      <Icon name="edit" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" />
                      编辑
                    </button>
                  )}
                  {onDelete && (
                    <button
                      className="app-menu-item app-menu-item--danger"
                      onClick={() => {
                        setMenuOpen(false)
                        onDelete(bbtalk)
                      }}
                    >
                      <Icon name="trash" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" />
                      删除
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* 内容 Markdown */}
        {bbtalk.isPinned && <p className="mb-2 text-xs font-medium text-blue-700">已置顶</p>}
        <MarkdownRenderer content={bbtalk.content} search={searchKeyword} className="record-content pr-10" />

        {/* 标签 */}
        {bbtalk.tags && bbtalk.tags.length > 0 && (
          <div className="mt-4 flex gap-2 flex-wrap">
            {bbtalk.tags.map((tag, index) => (
              <span
                key={tag.id || `tag-${index}`}
                className="record-tag inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium"
              >
                <span aria-hidden="true">#</span>
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
              <div className={`grid gap-2 mb-3 ${images.length > 1 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1'}`}>
                {images.map(attachment => (
                  <div key={attachment.uid || attachment.url} className="relative min-w-0 group">
                    <CachedImage
                      src={attachment.url}
                      alt={attachment.originalFilename || ''}
                      className={`w-full max-w-full ${images.length > 1 ? 'aspect-square' : 'max-h-80'} object-contain bg-gray-50 rounded-lg cursor-pointer hover:opacity-90 transition-opacity`}
                      onClick={() => onPreviewImage?.({ src: attachment.url, alt: attachment.originalFilename || '', images: images.map(item => ({ src: item.url, alt: item.originalFilename || '' })) })}
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
                    download={attachment.originalFilename || attachment.filename || '附件'}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200 group"
                  >
                    <Icon className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </Icon>
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
                    <Icon className="w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </Icon>
                  </AttachmentDownload>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 底部元数据栏 */}
        <div className="record-actions mt-4 flex items-center justify-between text-sm text-gray-500">
          <div className="flex items-center gap-3">
            <span className="text-gray-500 relative group/time cursor-help" title={fullDateString}>
              {formatRelativeTime(bbtalk.createdAt)}
              <div className="absolute bottom-full left-0 mb-2 hidden group-hover/time:block z-10 whitespace-nowrap">
                <div className="bg-gray-900 text-white px-3 py-2 rounded-lg shadow-lg text-sm">
                  <div className="font-medium">创建时间</div>
                  <div className="text-xs mt-1">{fullDateString}</div>
                  <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                </div>
              </div>
            </span>

            {/* 时间与悬浮框 */}


            {/* 设备来源 */}
            <span className="flex items-center gap-1 text-gray-500 relative group/device cursor-help" title={isMobile ? '手机' : source}>
              {isMobile ? (
                <Icon className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </Icon>
              ) : (
                <Icon className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </Icon>
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
                <Icon className="w-4 h-4 text-green-600 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </Icon>
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
                <Icon className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </Icon>
              ) : (
                <Icon className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </Icon>
              )}
            </span>
          </div>

          {/* 评论按钮 */}
          <button
            onClick={() => setCommentInputVisible(!commentInputVisible)}
            className="min-h-11 min-w-11 justify-center rounded-lg text-gray-600 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-1 transition-colors text-sm"
            aria-label={isPublic ? `评论 ${commentCount} 条` : '写评论'}
            aria-expanded={commentInputVisible}
            title="评论"
          >
            <Icon className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </Icon>
            {commentCount > 0 && <span>{commentCount}</span>}
          </button>
        </div>

        {/* 内联评论列表与输入框 */}
        <InlineCommentSection
          key={`${bbtalk.id}:${isPublic}:${recordSession}`}
          readOnly={isPublic}
          bbtalkId={bbtalk.id}
          commentCount={bbtalk.commentCount ?? 0}
          preview={bbtalk.commentPreview}
          revision={bbtalk.commentsRevision}
          recordSession={recordSession}
          onCountChange={setCommentCount}
          inputVisible={commentInputVisible}
          onToggleInput={() => setCommentInputVisible(false)}
        />
      </div>
    </div>
  )
})

export default BBTalkItem
