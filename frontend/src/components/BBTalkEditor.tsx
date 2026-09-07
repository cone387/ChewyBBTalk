import { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useAttachmentUploads } from '../hooks/useAttachmentUploads'
import { usePersistentDraft } from '../hooks/usePersistentDraft'
import { draftKey, type DraftData } from '../services/drafts'
import { getCurrentUser } from '../services/auth'
import { beginSubmission, readSubmission, confirmSubmission, forgetConfirmedSubmission, type SubmissionIntent } from '../services/submissions'
import { bbtalkApi, transformBBTalk } from '../services/api/bbtalkApi'
import { ApiError } from '../services/api/apiClient'
import Modal from './ui/Modal'
import { useAppSelector } from '../store/hooks'
import CachedImage from './CachedImage'
import Toast, { type ToastType } from './ui/Toast'
import type { Attachment, BBTalk } from '../types'

interface BBTalkEditorProps {
  onPublish: (data: {
    content: string
    tags: string[]
    attachments: Attachment[]
    visibility: 'public' | 'private' | 'friends'
    submissionKey?: string
    expectedUpdatedAt?: string
    context?: Record<string, any>
  }) => Promise<void>
  isPublishing?: boolean
  editing?: BBTalk | null  // 编辑模式:传入要编辑的 BBTalk
  onCancelEdit?: () => void  // 取消编辑回调
}

export default function BBTalkEditor(props: BBTalkEditorProps) {
  const user = getCurrentUser()
  const scope = user ? draftKey(import.meta.env.VITE_API_BASE_URL || '/', user.id, props.editing?.id) : null
  return <BBTalkEditorContent key={scope ?? 'anonymous'} {...props} draftScope={scope} />
}

function BBTalkEditorContent({ onPublish, isPublishing = false, editing = null, onCancelEdit, draftScope }: BBTalkEditorProps & { draftScope: string | null }) {
  const [content, setContent] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const uploads = useAttachmentUploads()
  const uploadedFiles = uploads.items.flatMap(item => item.attachment ? [{
    ...item.attachment, name: item.file.name, uploadId: item.id,
    type: /\.(jpe?g|png|gif|bmp|webp|svg|ico|tiff?)(?:\?|$)/i.test(item.attachment.url) ? 'image' as const : item.attachment.type,
  }] : [])
  const isUploading = uploads.items.some(item => item.status === 'uploading')
  const hasUnfinishedUploads = uploads.items.some(item => item.status !== 'ready')
  const [publishError, setPublishError] = useState<string | null>(null)
  const submittingRef = useRef(false)
  const [busy, setBusy] = useState(false)
  const [intent, setIntent] = useState<SubmissionIntent>()
  const [intentReady, setIntentReady] = useState(Boolean(editing))
  const [conflict, setConflict] = useState<BBTalk | null>(null)
  const assertIdentity = () => {
    const user = getCurrentUser()
    if (!user || draftKey(import.meta.env.VITE_API_BASE_URL || '/', user.id, editing?.id) !== draftScope) {
      throw new Error('账号已切换，请在当前账号下重新操作')
    }
  }
  useEffect(() => {
    if (editing || !draftScope) return
    let cancelled = false
    readSubmission(draftScope).then(saved => {
      if (!cancelled) { setIntent(saved); setIntentReady(true) }
    }).catch(() => {
      if (!cancelled) setPublishError('无法读取待确认发布，请刷新后重试；当前输入已保留。')
    })
    return () => { cancelled = true }
  }, [draftScope, editing])
  const recoverSubmission = async (retry: boolean) => {
    if (!draftScope || !intent || submittingRef.current) return
    submittingRef.current = true
    setBusy(true)
    setPublishError(null)
    try {
      assertIdentity()
      if (retry) await onPublish({ ...intent.payload, submissionKey: intent.key })
      else await bbtalkApi.submissionStatus(intent.key)
      assertIdentity()
      await confirmSubmission(draftScope, intent.key)
      setIntent({ ...intent, state: 'confirmed' })
      setToast({ message: '已确认原提交发布成功，当前输入仍保留；可清除草稿或继续修改。', type: 'success' })
      window.dispatchEvent(new Event('bbtalk-submission-resolved'))
    } catch (error) {
      if (error instanceof ApiError && error.status === 410) {
        await confirmSubmission(draftScope, intent.key).catch(() => {})
        setIntent({ ...intent, state: 'confirmed' })
        setPublishError('原提交对应的记录已删除，不会重新创建。当前输入仍保留。')
      } else {
        setPublishError(error instanceof ApiError && error.status === 404
          ? '暂未查到原提交结果，可重试原提交；不会生成新的提交标识。'
          : '核对或重试失败，原提交和当前输入已保留，请稍后重试。')
      }
    } finally { submittingRef.current = false; setBusy(false) }
  }
  const [existingAttachments, setExistingAttachments] = useState<Attachment[]>([])  // 编辑模式下的现有附件
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [locationError, setLocationError] = useState<boolean>(false)  // 定位失败状态
  const [visibility, setVisibility] = useState<'public' | 'private' | 'friends'>('private')
  const [suggestedTag, setSuggestedTag] = useState<string | null>(null) // 建议创建的标签
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null) // Toast提示
  const [isDragOver, setIsDragOver] = useState(false) // 拖拽状态
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [baseUpdatedAt, setBaseUpdatedAt] = useState(editing?.updatedAt)
  const baseChanged = Boolean(editing && baseUpdatedAt !== editing.updatedAt)
  const draftData = useMemo<DraftData>(() => ({
    content, tags, visibility, attachments: existingAttachments, uploads: uploads.items,
    location, baseUpdatedAt,
  }), [content, tags, visibility, existingAttachments, uploads.items, location, baseUpdatedAt])
  const draft = usePersistentDraft(draftScope, draftData, saved => {
    setContent(saved.content)
    setTags(saved.tags)
    setVisibility(saved.visibility)
    setExistingAttachments(saved.attachments)
    setLocation(saved.location)
    uploads.restore(saved.uploads)
    setBaseUpdatedAt(saved.baseUpdatedAt)
  })

  const clearDraft = async () => {
    setClearing(true)
    try {
      await draft.clear()
      if (draftScope && intent?.state === 'confirmed') {
        await forgetConfirmedSubmission(draftScope, intent.key)
        setIntent(undefined)
      }
      const names = editing?.tags?.map(tag => tag.name) ?? []
      setContent(editing ? `${names.map(name => `#${name} `).join('')}${editing.content}` : '')
      setTags(names)
      setVisibility(editing?.visibility ?? 'private')
      setExistingAttachments(editing?.attachments?.filter(item => item?.uid?.trim()) ?? [])
      uploads.reset()
      setLocation(null)
      setPublishError(null)
      setBaseUpdatedAt(editing?.updatedAt)
      setConfirmClear(false)
    } catch { /* The draft status displays the storage error. */ }
    finally { setClearing(false) }
  }
  
  // 标签选择器状态
  const [showTagSelector, setShowTagSelector] = useState(false)
  const [tagSelectorPosition, setTagSelectorPosition] = useState({ top: 0, left: 0 })
  const [tagSearchQuery, setTagSearchQuery] = useState('') // 当前输入的标签搜索
  const [cursorPosition, setCursorPosition] = useState(0) // 光标位置
  const [selectedTagIndex, setSelectedTagIndex] = useState(0) // 当前选中的标签索引
  
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const tagSelectorRef = useRef<HTMLDivElement>(null)
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const dragCounter = useRef(0) // 用于处理嵌套拖拽元素
  const isComposingRef = useRef(false) // 标记是否处于 IME 输入法组合状态（iOS 语音输入等）
  
  // 从 Redux 获取已有标签列表
  const { tags: existingTags } = useAppSelector((state) => state.tag)

  // 处理图片URL，根据配置进行协议转换
  const getImageUrl = (url: string) => {
    const targetProtocol = import.meta.env.VITE_MEDIA_URL_PROTOCOL
    if (targetProtocol === 'https' && url.startsWith('http://')) {
      return url.replace('http://', 'https://')
    } else if (targetProtocol === 'http' && url.startsWith('https://')) {
      return url.replace('https://', 'http://')
    }
    return url
  }

  // 编辑模式:恢复标签到内容中
  const restoreTagsToContent = (content: string, tagNames: string[]) => {
    if (tagNames.length > 0) {
      const tagMarks = tagNames.map(tag => `#${tag} `).join('')
      return `${tagMarks}${content}`
    }
    return content
  }

  // 编辑模式:初始化数据
  useEffect(() => {
    if (editing) {
      // 恢复内容和标签
      const tagNames = editing.tags?.map(t => t.name) || []
      const restoredContent = restoreTagsToContent(editing.content, tagNames)
      setContent(restoredContent)
      setTags(tagNames)
      setVisibility(editing.visibility || 'private')
      
      // 恢复现有附件文件，过滤掉无效的附件
      const validAttachments = (editing.attachments || []).filter(a => {
        return a?.uid && a.uid.trim() !== ''
      })
      setExistingAttachments(validAttachments)
      // 编辑模式下清空新上传文件列表
      uploads.reset()
      
      // 聚焦到输入框 - 移动端需要用户主动点击
      const isMobile = window.innerWidth < 768
      if (textareaRef.current && !isMobile) {
        textareaRef.current.focus()
      }
    }
    // Identity changes remount this editor. Background list refreshes must not
    // replace the user's current input with a newly fetched record object.
  }, [])
  
  // 首次进入页面时自动聚焦并获取位置
  useEffect(() => {
    // 检测是否为移动端 (宽度小于768px)
    const isMobile = window.innerWidth < 768
    
    // 只在非移动端自动聚焦,避免移动端弹出键盘
    if (textareaRef.current && !isMobile) {
      textareaRef.current.focus()
    }
    
    // 默认开启定位功能 - 使用更宽松的配置
    if (!location && navigator.geolocation) {
      // 配置选项:设置超时为10秒,不启用高精度(更快),最大年龄为5分钟
      const options = {
        timeout: 10000,           // 10秒超时
        enableHighAccuracy: false, // 不启用高精度模式,更快且更省电
        maximumAge: 300000        // 允许使用5分钟内的缓存位置
      }
          
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation(previous => previous ?? {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          })
        },
        (error) => {
          // 静默失败,不弹出提示,只记录日志
          console.log('自动定位失败(已忽略):', error.message)
          setLocationError(true)  // 设置定位失败状态
          // 延迟清除错误状态，让用户看到图标变红
          setTimeout(() => setLocationError(false), 3000)
        },
        options
      )
    }
  }, [])

  // 自动调整textarea高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px'
    }
  }, [content])

  // 检测 # 输入并显示标签选择器
  useEffect(() => {
    // IME 组合输入中（如 iOS 语音输入），跳过标签选择器逻辑
    if (isComposingRef.current) return

    const textarea = textareaRef.current
    if (!textarea) return

    const text = content
    const cursorPos = textarea.selectionStart
    
    // 查找光标前最近的 # 符号
    const textBeforeCursor = text.substring(0, cursorPos)
    const lastHashIndex = textBeforeCursor.lastIndexOf('#')
    
    // 检查 # 后是否有空格或换行，如果有则不显示选择器
    if (lastHashIndex !== -1) {
      const textAfterHash = text.substring(lastHashIndex + 1, cursorPos)
      const hasSpaceOrNewline = /[\s\n]/.test(textAfterHash)
      
      // 确保 # 前面是开头、空格或换行
      const charBeforeHash = lastHashIndex > 0 ? text[lastHashIndex - 1] : ' '
      const isValidHashPosition = /[\s\n]/.test(charBeforeHash) || lastHashIndex === 0
      
      if (isValidHashPosition && !hasSpaceOrNewline) {
        // 显示标签选择器
        setTagSearchQuery(textAfterHash)
        setShowTagSelector(true)
        setSelectedTagIndex(0) // 重置为第一项
        setCursorPosition(lastHashIndex)
        
        // 计算光标位置（使用 requestAnimationFrame 确保 DOM 更新完成）
        requestAnimationFrame(() => {
          // 创建一个临时 div 来测量文本
          const tempDiv = document.createElement('div')
          const styles = window.getComputedStyle(textarea)
          tempDiv.style.cssText = `
            position: absolute;
            visibility: hidden;
            font-family: ${styles.fontFamily};
            font-size: ${styles.fontSize};
            line-height: ${styles.lineHeight};
            padding: ${styles.padding};
            white-space: pre-wrap;
            word-wrap: break-word;
            width: ${textarea.clientWidth}px;
          `
          // 使用光标前的文本 + 一个字符来获取当前行的底部位置
          tempDiv.textContent = text.substring(0, cursorPos) + '|'
          document.body.appendChild(tempDiv)
          
          const rect = textarea.getBoundingClientRect()
          const divHeight = tempDiv.offsetHeight
          document.body.removeChild(tempDiv)
          
          // 计算选择器位置：使用 window.scrollY 处理页面滚动
          setTagSelectorPosition({
            top: rect.top + window.scrollY + divHeight,
            left: rect.left + window.scrollX + 16
          })
        })
      } else {
        setShowTagSelector(false)
      }
    } else {
      setShowTagSelector(false)
    }
  }, [content])
  
  // 点击外部关闭标签选择器
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tagSelectorRef.current && !tagSelectorRef.current.contains(event.target as Node)) {
        setShowTagSelector(false)
      }
    }

    if (showTagSelector) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showTagSelector])
  
  // 选择标签（从输入框 # 触发的选择器）
  const handleSelectTag = (tagName: string) => {
    const textarea = textareaRef.current
    if (!textarea) return
    
    // 替换 # 后的内容为选中的标签 + 空格
    const beforeHash = content.substring(0, cursorPosition)
    const afterCursor = content.substring(textarea.selectionStart)
    const newContent = `${beforeHash}#${tagName} ${afterCursor}`
    
    setContent(newContent)
    setShowTagSelector(false)
    
    // 设置光标位置到标签后面
    setTimeout(() => {
      const newCursorPos = beforeHash.length + tagName.length + 2 // # + 标签名 + 空格
      textarea.setSelectionRange(newCursorPos, newCursorPos)
      textarea.focus()
    }, 0)
  }
  
  // 筛选匹配的标签
  const filteredTags = existingTags
    .filter(tag => 
      tag.name.toLowerCase().includes(tagSearchQuery.toLowerCase()) &&
      !tags.includes(tag.name) // 不显示已添加的标签
    )
    .slice(0, 10) // 最多显示 10 个
  
  // 当筛选结果变化时，确保选中索引在有效范围内
  useEffect(() => {
    if (selectedTagIndex >= filteredTags.length && filteredTags.length > 0) {
      setSelectedTagIndex(filteredTags.length - 1)
    }
  }, [filteredTags.length, selectedTagIndex])
  
  useEffect(() => {
    // IME 组合输入中（如 iOS 语音输入），跳过标签解析避免卡顿
    if (isComposingRef.current) return

    // 使用正则表达式匹配 #标签名 格式（标签名后必须跟空格）
    // 注意：这里需要确保 # 前面是空格、开头或换行，避免匹配到词语中间的 #
    const tagRegex = /(?:^|\s)#([^\s#]+)\s/g
    const matches = Array.from(content.matchAll(tagRegex))
    const parsedTags = matches.map(match => match[1])
    
    // 更新标签列表（去重）
    const uniqueTags = Array.from(new Set(parsedTags))
    if (JSON.stringify(uniqueTags.sort()) !== JSON.stringify(tags.sort())) {
      setTags(uniqueTags)
    }

    // 检测是否有未完成的标签输入（#标签名 但还没有空格）
    const incompleteTagMatch = content.match(/(?:^|\s)#([^\s#]+)$/)
    if (incompleteTagMatch) {
      const potentialTag = incompleteTagMatch[1]
      if (potentialTag.length > 0 && !tags.includes(potentialTag)) {
        setSuggestedTag(potentialTag)
      } else {
        setSuggestedTag(null)
      }
    } else {
      setSuggestedTag(null)
    }
  }, [content])

  // 文件输入、拖拽和粘贴共用独立上传状态。
  const handleFileUpload = (files: FileList | null, type: 'image' | 'attachment' = 'attachment') => {
    if (!files?.length || !draft.loaded || clearing || isPublishing || submittingRef.current) return
    uploads.add(Array.from(files), type === 'image' ? 'image' : 'auto')
  }

  // 移除现有附件文件（编辑模式）
  const handleRemoveExistingAttachment = (uid: string) => {
    setExistingAttachments(prev => prev.filter(a => a.uid !== uid))
  }

  // 移除标签
  const handleRemoveTag = (tag: string) => {
    setTags(prev => prev.filter(t => t !== tag))
    // 同时从内容中移除该标签
    setContent(prev => prev.replace(new RegExp(`#${tag}\\s`, 'g'), ''))
  }

  // 创建建议的标签
  const handleCreateSuggestedTag = () => {
    if (suggestedTag) {
      // 在当前光标位置添加空格，完成标签创建
      setContent(prev => prev + ' ')
      setSuggestedTag(null)
    }
  }

  // 获取位置
  const handleGetLocation = () => {
    // 如果已经有位置，点击则清除
    if (location) {
      setLocation(null)
      setToast({ message: '已取消定位', type: 'info' })
      return
    }

    if (!navigator.geolocation) {
      setToast({ message: '您的浏览器不支持地理定位', type: 'error' })
      return
    }

    // 如果之前定位失败，重置错误状态
    if (locationError) {
      setLocationError(false)
    }

    // 配置选项:设置超时为10秒,不启用高精度(更快),最大年龄为5分钟
    const options = {
      timeout: 10000,
      enableHighAccuracy: false,
      maximumAge: 300000
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        })
        setToast({ message: '定位成功', type: 'success' })
        // 清除错误状态
        if (locationError) {
          setLocationError(false)
        }
      },
      (error) => {
        console.error('定位失败:', error)
        // 根据错误类型提供更明确的提示
        let message = '定位失败'
        if (error.code === 1) {
          message = '定位权限被拒绝，请在浏览器设置中允许定位'
        } else if (error.code === 2) {
          message = '位置信息不可用，请检查设备定位服务或网络连接'
        } else if (error.code === 3) {
          message = '定位超时，请稍后再试'
        }
        setToast({ message, type: 'warning' })
        // 设置定位失败状态
        setLocationError(true)
        // 延迟清除错误状态，让用户看到图标变红
        setTimeout(() => setLocationError(false), 3000)
      },
      options
    )
  }

  // 处理发布/更新
  const handleSubmit = async () => {
    if (!content.trim() || !intentReady || !draft.loaded || clearing || isPublishing || submittingRef.current || hasUnfinishedUploads) return
    submittingRef.current = true
    setBusy(true)
    setPublishError(null)
    setShowTagSelector(false)

    const context: Record<string, any> = {
      source: {
        client: 'Web',
        platform: /Mobile|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'mobile' : 'desktop'
      }
    }
    
    if (location) {
      context.location = location
    }

    // 清理内容：移除所有标签标记（#标签名 格式），只保留其他文本
    const cleanedContent = content.replace(/(?:^|\s)#([^\s#]+)\s/g, ' ').trim()

    try {
      // 合并现有附件和新上传的文件
      const allAttachments: Attachment[] = [
        ...existingAttachments,
        ...uploadedFiles.map(f => ({
          uid: f.uid,
          url: f.url,
          type: f.type,
          filename: f.name,
          mimeType: f.mimeType,
          fileSize: f.fileSize,
        }))
      ]

      const payload = {
        content: cleanedContent, tags, attachments: allAttachments, visibility,
        context: Object.keys(context).length > 0 ? context : undefined,
      }
      assertIdentity()
      let submission: SubmissionIntent | undefined
      if (!editing) {
        if (!draftScope) throw new Error('请先登录')
        const revision = await draft.verifyCurrent()
        submission = await beginSubmission(draftScope, payload, revision)
        setIntent(submission)
      }
      assertIdentity()
      await onPublish({ ...payload, submissionKey: submission?.key, expectedUpdatedAt: baseUpdatedAt })

      // Keep the original key if local confirmation or cleanup fails.
      try {
        if (submission && draftScope) {
          await confirmSubmission(draftScope, submission.key)
          setIntent({ ...submission, state: 'confirmed' })
        }
        await draft.clear()
        if (submission && draftScope) {
          await forgetConfirmedSubmission(draftScope, submission.key)
          setIntent(undefined)
        }
      } catch {
        setToast({ message: '发布成功，但本地草稿清理失败，请刷新后核对并清除', type: 'error' })
        return
      }

      // 清空表单 (仅在新建模式下)
      if (!editing) {
        setContent('')
        setTags([])
        uploads.reset()
        setExistingAttachments([])
        setLocation(null)
        setVisibility('private')
      }
    } catch (error) {
      console.error(editing ? '更新失败:' : '发布失败:', error)
      const detail = error as { message?: string; code?: string; current?: unknown }
      if (detail?.code === 'edit_conflict' && detail.current) {
        setConflict(transformBBTalk(detail.current))
        setPublishError('记录已被其他设备修改，你的输入已保留，请核对最新版本。')
      } else {
        setPublishError(`${editing ? '更新' : '发布'}失败，内容已保留，请重试。${typeof error === 'string' ? error : detail?.message ?? ''}`)
      }
    } finally {
      submittingRef.current = false
      setBusy(false)
    }
  }
  
  // 处理取消编辑
  const handleCancel = () => {
    if (onCancelEdit) {
      onCancelEdit()
    }
  }

  // 处理拖拽进入
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true)
    }
  }

  // 处理拖拽离开
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current === 0) {
      setIsDragOver(false)
    }
  }

  // 处理拖拽经过
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  // 处理拖拽放下
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    dragCounter.current = 0

    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      // 检测是否有图片文件
      const hasImages = Array.from(files).some(file => file.type.startsWith('image/'))
      handleFileUpload(files, hasImages ? 'image' : 'attachment')
    }
  }

  // 处理粘贴事件
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    const imageFiles: File[] = []
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      // 检测是否为图片类型
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) {
          imageFiles.push(file)
        }
      }
    }

    // 如果有图片文件，上传它们
    if (imageFiles.length > 0) {
      e.preventDefault() // 阻止默认粘贴行为
      
      // 创建一个 FileList-like 对象
      const dataTransfer = new DataTransfer()
      imageFiles.forEach(file => dataTransfer.items.add(file))
      handleFileUpload(dataTransfer.files, 'image')
      setToast({ message: `正在上传 ${imageFiles.length} 张图片...`, type: 'info' })
    }
  }

  // 快捷键处理
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 如果标签选择器显示中
    if (showTagSelector) {
      // ESC 关闭
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowTagSelector(false)
        return
      }
      
      // 上箭头 - 向上选择
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedTagIndex(prev => 
          prev > 0 ? prev - 1 : filteredTags.length - 1
        )
        return
      }
      
      // 下箭头 - 向下选择
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedTagIndex(prev => 
          prev < filteredTags.length - 1 ? prev + 1 : 0
        )
        return
      }
      
      // Tab 键或 Enter 键 - 确认选择标签
      if ((e.key === 'Tab' || e.key === 'Enter') && filteredTags.length > 0) {
        e.preventDefault()
        handleSelectTag(filteredTags[selectedTagIndex].name)
        return
      }
    }
    
    // Enter 键发布（Shift+Enter 换行）
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (content.trim() && !isPublishing && !hasUnfinishedUploads) {
        handleSubmit()
      }
      return
    }
  }

  return (
    <div
      ref={editorContainerRef}
      className={`bg-white rounded-lg border shadow-sm hover:shadow-md transition-all relative ${
        isDragOver 
          ? 'border-blue-400 border-2 bg-blue-50/50' 
          : 'border-gray-200'
      }`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* 拖拽提示遮罩 */}
      {isDragOver && (
        <div className="absolute inset-0 bg-blue-50/80 rounded-lg flex items-center justify-center z-10 pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-blue-600">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <span className="text-sm font-medium">释放以上传文件</span>
          </div>
        </div>
      )}
      
      <div className="flex flex-wrap items-center justify-between gap-x-3 px-4 pt-2 text-xs text-gray-600">
        <span role={draft.error ? 'alert' : 'status'} className={draft.error ? 'text-red-700' : ''}>{draft.recovered ? '已恢复草稿 · ' : ''}{draft.status}</span>
        <div className="flex items-center gap-2">
          {draft.error && draft.canRetry && <button type="button" className="min-h-[44px] px-2 text-blue-700" onClick={() => { void draft.retry() }}>重试保存</button>}
          <button type="button" disabled={busy || !draft.loaded || isPublishing || clearing} className="min-h-[44px] px-2 hover:text-red-700 disabled:opacity-50" onClick={() => setConfirmClear(true)}>清除草稿</button>
        </div>
      </div>
      {!editing && intent && <section aria-label="原提交恢复" className="mx-4 my-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
        <p role="status">{intent.state === 'pending' ? '有一份发布结果待核对' : '原提交已处理，当前输入仍保留'}</p>
        <details className="mt-2"><summary className="cursor-pointer">查看原提交内容</summary><p className="mt-2 whitespace-pre-wrap break-words">{intent.payload.content}</p></details>
        {intent.state === 'pending' && <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" disabled={busy || isPublishing} className="min-h-[44px] rounded border border-amber-400 px-3 disabled:opacity-50" onClick={() => { void recoverSubmission(false) }}>核对发布结果</button>
          <button type="button" disabled={busy || isPublishing} className="min-h-[44px] rounded border border-amber-400 px-3 disabled:opacity-50" onClick={() => { void recoverSubmission(true) }}>重试原提交</button>
        </div>}
      </section>}
      <Modal visible={Boolean(conflict)} title="记录已有新版本" onClose={() => setConflict(null)}>
        <p className="text-sm text-gray-700">你的修改仍保留。请核对服务器上的最新内容，再决定是否继续编辑。</p>
        <div className="my-3 max-h-64 overflow-auto rounded border p-3 text-sm">
          <p className="whitespace-pre-wrap break-words">{conflict?.content}</p>
          <p className="mt-2">标签：{conflict?.tags.map(tag => tag.name).join('、') || '无'}</p>
          <p>可见性：{conflict?.visibility === 'private' ? '私密' : conflict?.visibility === 'friends' ? '好友' : '公开'}</p>
          <p>附件：{conflict?.attachments?.map(item => item.filename || item.uid).join('、') || '无'}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="min-h-[44px] px-3" onClick={() => setConflict(null)}>暂不处理</button>
          <button type="button" className="min-h-[44px] rounded bg-blue-600 px-3 text-white" onClick={() => {
            setBaseUpdatedAt(conflict?.updatedAt)
            setConflict(null)
            setPublishError('已核对最新版本。你的修改仍保留，可继续编辑后再次保存。')
          }}>保留我的修改，继续编辑</button>
        </div>
      </Modal>
      {baseChanged && <p role="alert" className="px-4 py-2 text-sm text-amber-800">已恢复草稿，但原记录已有更新。保存前请核对，避免覆盖其他修改。</p>}
      <Modal visible={confirmClear} title="清除草稿" onClose={() => { if (!clearing) setConfirmClear(false) }}>
        <p className="text-sm text-gray-700">将清除当前本地草稿和待上传文件。{editing ? '编辑内容将恢复为当前记录。' : '此操作无法撤销。'}</p>
        <div className="mt-4 flex justify-end gap-3">
          <button type="button" disabled={clearing} className="min-h-[44px] px-4" onClick={() => setConfirmClear(false)}>取消</button>
          <button type="button" disabled={clearing} className="min-h-[44px] rounded bg-red-600 px-4 text-white disabled:opacity-50" onClick={() => { void clearDraft() }}>{clearing ? '正在清除…' : '确认清除'}</button>
        </div>
      </Modal>
      <fieldset disabled={busy || isPublishing || !draft.loaded || clearing} className="min-w-0 border-0 p-0 m-0">
      {/* 主编辑区 */}
      <div className="p-4 pb-2 relative">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onCompositionStart={() => { isComposingRef.current = true }}
          onCompositionEnd={(e) => {
            isComposingRef.current = false
            // composition 结束后，手动触发一次内容更新以确保标签解析等逻辑执行
            setContent((e.target as HTMLTextAreaElement).value)
          }}
          placeholder="你要BB什么？"
          className="w-full min-h-[56px] max-h-[400px] resize-none border-none outline-none text-gray-800 placeholder-gray-400 text-base leading-relaxed"
          style={{ overflowY: 'auto' }}
          aria-label="记录内容"
          rows={2}
        />

        {/* 标签选择器 - 使用 Portal 渲染到 body */}
        {showTagSelector && createPortal(
          <div
            ref={tagSelectorRef}
            className="fixed bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto"
            style={{
              top: `${tagSelectorPosition.top}px`,
              left: `${tagSelectorPosition.left}px`,
              minWidth: '200px',
              maxWidth: '300px',
              zIndex: 9999
            }}
          >
            {filteredTags.length > 0 ? (
              <div className="py-1">
                {filteredTags.map((tag, index) => (
                  <button
                    key={tag.id}
                    onClick={() => handleSelectTag(tag.name)}
                    onMouseEnter={() => setSelectedTagIndex(index)}
                    className={`w-full text-left px-4 py-2 flex items-center gap-2 transition-colors ${
                      index === selectedTagIndex 
                        ? 'bg-blue-50 text-blue-700' 
                        : 'hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                    <span className="text-sm font-medium">{tag.name}</span>
                    {tag.bbtalkCount && tag.bbtalkCount > 0 && (
                      <span className="ml-auto text-xs text-gray-400">{tag.bbtalkCount}</span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-4 py-3 text-sm text-gray-500">
                {tagSearchQuery ? (
                  <>
                    没有匹配的标签，继续输入创建 "<span className="font-medium text-gray-700">{tagSearchQuery}</span>"
                  </>
                ) : (
                  '输入标签名称...'
                )}
              </div>
            )}
          </div>,
          document.body
        )}

        {/* 现有附件文件预览（编辑模式） */}
        {existingAttachments.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {existingAttachments.map((attachment) => {
              // 判断是否为图片
              const isImage = attachment.type === 'image' || (() => {
                const url = attachment.url.toLowerCase()
                const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tif', '.tiff']
                return imageExts.some(ext => url.split('?')[0].endsWith(ext))
              })()
              
              return (
                <div key={attachment.uid} className="relative group">
                  {isImage ? (
                    <CachedImage
                      src={getImageUrl(attachment.url)}
                      alt={attachment.originalFilename || ''}
                      className="max-w-[160px] max-h-32 object-contain bg-gray-50 rounded-lg border border-gray-200"
                      objectFit="contain"
                      fallback={
                        <div className="w-[160px] h-32 flex flex-col items-center justify-center bg-gray-100 rounded-lg border border-gray-200">
                          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <span className="text-xs text-gray-500 mt-1">图片加载失败</span>
                        </div>
                      }
                    />
                  ) : (
                    <div className="w-[160px] h-32 flex flex-col items-center justify-center bg-gray-50 rounded-lg border border-gray-200">
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="text-xs text-gray-500 mt-1 truncate max-w-full px-2">{attachment.originalFilename || attachment.filename || '附件'}</span>
                    </div>
                  )}
                  <button
                    onClick={() => handleRemoveExistingAttachment(attachment.uid)}
                    className="absolute top-0 right-0 min-w-11 min-h-11 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-red-50 hover:text-red-700"
                    aria-label={`移除附件 ${attachment.originalFilename || attachment.filename || "附件"}`}
                    title="移除附件"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* 已上传文件预览 */}
        {uploadedFiles.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {uploadedFiles.map((file) => (
              <div key={file.uid} className="relative group">
                {file.type === 'image' ? (
                  <CachedImage
                    src={getImageUrl(file.url)}
                    alt={file.name}
                    className="max-w-[160px] max-h-32 object-contain bg-gray-50 rounded-lg border border-gray-200"
                    objectFit="contain"
                    fallback={
                      <div className="w-[160px] h-32 flex flex-col items-center justify-center bg-gray-100 rounded-lg border border-gray-200">
                        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span className="text-xs text-gray-500 mt-1">图片加载失败</span>
                      </div>
                    }
                  />
                ) : (
                  <div className="w-[160px] h-32 flex flex-col items-center justify-center bg-gray-50 rounded-lg border border-gray-200">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="text-xs text-gray-500 mt-1 truncate max-w-full px-2">{file.name}</span>
                  </div>
                )}
                <button
                  onClick={() => uploads.remove(file.uploadId)}
                  className="absolute top-0 right-0 min-w-11 min-h-11 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-red-50 hover:text-red-700"
                  aria-label={`移除附件 ${file.name}`}
                  title="移除附件"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 已识别的标签 */}
        {tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 items-center">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-600 rounded-full text-sm"
              >
                #{tag}
                <button
                  onClick={() => handleRemoveTag(tag)}
                  className="hover:bg-blue-100 rounded-full p-0.5 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}

        {/* 建议创建标签提示 */}
        {suggestedTag && (
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={handleCreateSuggestedTag}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-yellow-50 text-yellow-700 rounded-lg text-sm hover:bg-yellow-100 transition-colors border border-yellow-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              创建标签 "{suggestedTag}"
            </button>
          </div>
        )}
      </div>

      {uploads.items.some(item => item.status !== 'ready') && (
        <div className="px-4 pb-3 space-y-2" aria-live="polite">
          {uploads.items.filter(item => item.status !== 'ready').map(item => (
            <div key={item.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3" data-testid="upload-status">
              <p className="text-sm font-medium text-gray-800 break-all">{item.file.name}</p>
              <p className={`mt-1 text-sm break-words ${item.status === 'failed' ? 'text-red-700' : 'text-gray-600'}`}>
                {item.status === 'uploading' ? '上传中…' : item.error}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {item.status === 'failed' && <button onClick={() => uploads.retry(item.id)} className="min-h-11 px-3 rounded-lg bg-blue-600 text-white text-sm">重试上传</button>}
                <button onClick={() => uploads.remove(item.id)} className="min-h-11 px-3 rounded-lg border border-gray-300 text-gray-700 text-sm">移除文件</button>
              </div>
            </div>
          ))}
          <p className="text-sm text-gray-600">请完成上传或移除失败文件后再发布。</p>
        </div>
      )}
      {publishError && <p role="alert" className="mx-4 mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{publishError}</p>}

      {/* 工具栏 - 始终显示 */}
      <div className="px-4 pb-3 pt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
            {/* 标签选择按钮 - 点击插入 # 触发选择器 */}
            <button
              onClick={() => {
                const textarea = textareaRef.current
                if (!textarea) return
                
                const start = textarea.selectionStart
                const end = textarea.selectionEnd
                const text = content
                
                // 在光标位置插入 #（如果前面不是空格或开头，先加空格）
                const charBefore = start > 0 ? text[start - 1] : ' '
                const prefix = (charBefore !== ' ' && charBefore !== '\n' && start > 0) ? ' #' : '#'
                
                const newContent = text.substring(0, start) + prefix + text.substring(end)
                setContent(newContent)
                
                // 设置光标位置到 # 后面
                setTimeout(() => {
                  const newPos = start + prefix.length
                  textarea.focus()
                  textarea.setSelectionRange(newPos, newPos)
                }, 0)
              }}
              className="min-w-11 min-h-11 p-2 hover:bg-gray-50 rounded-lg transition-colors group"
              title="添加标签"
            >
              <svg className="w-5 h-5 text-gray-600 group-hover:text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
            </button>

            {/* 图片上传 */}
            <button
              onClick={() => imageInputRef.current?.click()}
              disabled={isUploading}
              className="min-w-11 min-h-11 p-2 hover:bg-gray-50 rounded-lg transition-colors group relative"
              title="上传图片"
            >
              <svg className="w-5 h-5 text-gray-600 group-hover:text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>

            {/* 文件上传 */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="min-w-11 min-h-11 p-2 hover:bg-gray-50 rounded-lg transition-colors group"
              title="上传附件"
            >
              <svg className="w-5 h-5 text-gray-600 group-hover:text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>

            {/* 位置 */}
            <button
              onClick={handleGetLocation}
              className={`min-w-11 min-h-11 p-2 rounded-lg transition-colors group ${
                location ? 'bg-green-50' : locationError ? 'bg-red-50' : 'hover:bg-gray-50'
              }`}
              title={location ? '清除位置' : locationError ? '定位失败，点击重试' : '添加位置'}
            >
              <svg className={`w-5 h-5 ${
                location ? 'text-green-600' : locationError ? 'text-red-600' : 'text-gray-600 group-hover:text-blue-600'
              }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>

            {/* 可见性切换 */}
            <button
              onClick={() => setVisibility(prev => prev === 'private' ? 'public' : 'private')}
              className={`min-w-11 min-h-11 p-2 rounded-lg transition-colors group ${
                visibility === 'public' ? 'bg-blue-50' : 'hover:bg-gray-50'
              }`}
              title={visibility === 'public' ? '公开可见' : '仅自己可见'}
            >
              {visibility === 'public' ? (
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-gray-600 group-hover:text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              )}
            </button>

            {isUploading && (
              <span className="text-sm text-gray-500">上传中...</span>
            )}
          </div>

        {/* 右侧按钮 */}
        <div className="ml-auto flex shrink-0 items-center gap-3 whitespace-nowrap">
            {content.length > 0 && <span className="text-xs text-gray-400">{content.length} 字</span>}
            {editing && (
              <button
                onClick={handleCancel}
                disabled={isPublishing}
                className="min-h-11 shrink-0 px-4 sm:px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                取消
              </button>
            )}
            <button
              onClick={handleSubmit}
              disabled={!content.trim() || isPublishing || hasUnfinishedUploads}
              className="min-h-11 shrink-0 px-4 sm:px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              {isPublishing ? (editing ? '更新中...' : '发布中...') : (editing ? '保存' : '发布')}
            </button>
        </div>
      </div>

      {/* 隐藏的文件输入 */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        aria-label="上传图片"
        onChange={(e) => { handleFileUpload(e.target.files, 'image'); e.target.value = '' }}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        aria-label="上传附件"
        onChange={(e) => { handleFileUpload(e.target.files, 'attachment'); e.target.value = '' }}
      />

      </fieldset>
      {/* Toast提示 */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  )
}
