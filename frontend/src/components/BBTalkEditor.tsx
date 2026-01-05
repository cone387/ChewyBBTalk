import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { mediaApi } from '../services/mediaApi'
import { useAppSelector } from '../store/hooks'
import CachedImage from './CachedImage'
import Toast, { type ToastType } from './ui/Toast'
import type { Media, BBTalk } from '../types'

interface BBTalkEditorProps {
  onPublish: (data: {
    content: string
    tags: string[]
    mediaUids: string[]
    visibility: 'public' | 'private'
    context?: Record<string, any>
  }) => Promise<void>
  isPublishing?: boolean
  editing?: BBTalk | null  // 编辑模式:传入要编辑的 BBTalk
  onCancelEdit?: () => void  // 取消编辑回调
}

interface UploadedFile {
  uid: string
  url: string
  type: 'image' | 'video' | 'audio' | 'attachment'
  name: string
}

export default function BBTalkEditor({ onPublish, isPublishing = false, editing = null, onCancelEdit }: BBTalkEditorProps) {
  const [content, setContent] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [existingMedia, setExistingMedia] = useState<Media[]>([])  // 编辑模式下的现有媒体
  const [showToolbar, setShowToolbar] = useState(true)  // 默认显示工具栏
  const [isUploading, setIsUploading] = useState(false)
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [visibility, setVisibility] = useState<'public' | 'private'>('private')  // 默认私有
  const [suggestedTag, setSuggestedTag] = useState<string | null>(null) // 建议创建的标签
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null) // Toast提示
  const [isDragOver, setIsDragOver] = useState(false) // 拖拽状态
  
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
  
  // 从 Redux 获取已有标签列表
  const { tags: existingTags } = useAppSelector((state) => state.tag)

  // 处理图片URL，将http强制转换为https
  const getImageUrl = (url: string) => {
    if (url.startsWith('http://')) {
      return url.replace('http://', 'https://')
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
      
      // 恢复现有媒体文件，过滤掉无效的媒体
      // 注意：后端返回的是 uid 字段，但前端类型定义的是 id 字段
      const validMedia = (editing.media || []).filter(m => {
        const mediaId = m?.id || (m as any)?.uid  // 兼容后端的 uid 字段
        return mediaId && mediaId.trim() !== ''
      })
      setExistingMedia(validMedia)
      // 编辑模式下清空新上传文件列表
      setUploadedFiles([])
      
      // 聚焦到输入框 - 移动端需要用户主动点击
      const isMobile = window.innerWidth < 768
      if (textareaRef.current && !isMobile) {
        textareaRef.current.focus()
      }
    }
  }, [editing])
  
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
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          })
        },
        (error) => {
          // 静默失败,不弹出提示,只记录日志
          console.log('自动定位失败(已忽略):', error.message)
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
          const lineHeight = parseInt(styles.lineHeight) || 24
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

  // 处理文件上传
  const handleFileUpload = async (files: FileList | null, type: 'image' | 'attachment' = 'attachment') => {
    if (!files || files.length === 0) return

    setIsUploading(true)
    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        const response = await mediaApi.uploadMedia(file, {
          media_type: type === 'image' ? 'image' : 'auto'
        })
        console.log('上传成功:', response)
        
        // 辅助函数：判断是否为图片
        const isImageFile = (mediaType: string, url: string) => {
          if (mediaType === 'image') return true
          
          // 如果 mediaType 不可靠，检查 URL 扩展名
          const urlLower = url.toLowerCase()
          const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tif', '.tiff']
          return imageExts.some(ext => {
            const urlPath = urlLower.split('?')[0] // 移除查询参数
            return urlPath.endsWith(ext)
          })
        }
        
        // 确定文件类型
        const fileType = isImageFile(response.mediaType, response.url) ? 'image' : response.mediaType as any
        
        return {
          uid: response.id,
          url: response.url,
          type: fileType,
          name: file.name
        }
      })

      const results = await Promise.all(uploadPromises)
      console.log('所有文件上传完成:', results)
      setUploadedFiles(prev => [...prev, ...results])
    } catch (error) {
      console.error('上传失败:', error)
      alert('上传失败，请重试')
    } finally {
      setIsUploading(false)
    }
  }

  // 移除已上传的文件
  const handleRemoveFile = (uid: string) => {
    setUploadedFiles(prev => prev.filter(f => f.uid !== uid))
  }
  
  // 移除现有媒体文件（编辑模式）
  const handleRemoveExistingMedia = (mediaId: string) => {
    setExistingMedia(prev => prev.filter(m => {
      const currentId = m.id || (m as any).uid  // 兼容 id 和 uid 字段
      return currentId !== mediaId
    }))
  }

  // 添加标签
  const handleAddTag = () => {
    const tag = tagInput.trim()
    if (tag && !tags.includes(tag)) {
      setTags(prev => [...prev, tag])
      setTagInput('')
    }
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
      },
      options
    )
  }

  // 处理发布/更新
  const handleSubmit = async () => {
    if (!content.trim()) return

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
      await onPublish({
        content: cleanedContent,
        tags,
        mediaUids: [
          // 过滤并提取现有媒体 ID，兼容 id 和 uid 字段
          ...existingMedia.filter(m => m && (m.id || (m as any).uid)).map(m => m.id || (m as any).uid),
          // 过滤并提取新上传文件 UID
          ...uploadedFiles.filter(f => f && f.uid).map(f => f.uid)
        ],
        visibility,
        context: Object.keys(context).length > 0 ? context : undefined
      })

      // 清空表单 (仅在新建模式下)
      if (!editing) {
        setContent('')
        setTags([])
        setUploadedFiles([])
        setExistingMedia([])
        setLocation(null)
        setVisibility('private')
      }
    } catch (error) {
      console.error(editing ? '更新失败:' : '发布失败:', error)
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
      
      // Tab 键 - 确认选择
      if (e.key === 'Tab' && filteredTags.length > 0) {
        e.preventDefault()
        handleSelectTag(filteredTags[selectedTagIndex].name)
        return
      }
    }
    
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
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
      
      {/* 主编辑区 */}
      <div className="p-4 pb-2 relative">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="你要BB什么？"
          className="w-full min-h-[56px] max-h-[400px] resize-none border-none outline-none text-gray-800 placeholder-gray-400 text-base leading-relaxed"
          style={{ overflow: 'hidden' }}
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

        {/* 现有媒体文件预览（编辑模式） */}
        {existingMedia.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {existingMedia.map((media) => {
              // 判断是否为图片
              const isImage = media.mediaType === 'image' || (() => {
                const url = media.url.toLowerCase()
                const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tif', '.tiff']
                return imageExts.some(ext => url.split('?')[0].endsWith(ext))
              })()
              
              return (
                <div key={media.id} className="relative group">
                  {isImage ? (
                    <CachedImage
                      src={getImageUrl(media.url)}
                      alt={media.originalFilename || ''}
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
                      <span className="text-xs text-gray-500 mt-1 truncate max-w-full px-2">{media.originalFilename || media.filename || '附件'}</span>
                    </div>
                  )}
                  <button
                    onClick={() => handleRemoveExistingMedia(media.id || (media as any).uid)}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-600"
                    title="删除"
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
                  onClick={() => handleRemoveFile(file.uid)}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-600"
                  title="删除"
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

      {/* 工具栏 - 始终显示 */}
      <div className="px-4 pb-3 pt-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
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
              className="p-2 hover:bg-gray-50 rounded-lg transition-colors group"
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
              className="p-2 hover:bg-gray-50 rounded-lg transition-colors group relative"
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
              className="p-2 hover:bg-gray-50 rounded-lg transition-colors group"
              title="上传附件"
            >
              <svg className="w-5 h-5 text-gray-600 group-hover:text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>

            {/* 位置 */}
            <button
              onClick={handleGetLocation}
              className={`p-2 rounded-lg transition-colors group ${
                location ? 'bg-green-50' : 'hover:bg-gray-50'
              }`}
              title="添加位置"
            >
              <svg className={`w-5 h-5 ${
                location ? 'text-green-600' : 'text-gray-600 group-hover:text-blue-600'
              }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>

            {/* 可见性切换 */}
            <button
              onClick={() => setVisibility(prev => prev === 'private' ? 'public' : 'private')}
              className={`p-2 rounded-lg transition-colors group ${
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
        <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">
              {content.length > 0 && `${content.length} 字`}
            </span>
            {editing && (
              <button
                onClick={handleCancel}
                disabled={isPublishing}
                className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                取消
              </button>
            )}
            <button
              onClick={handleSubmit}
              disabled={!content.trim() || isPublishing || isUploading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm font-medium"
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
        onChange={(e) => handleFileUpload(e.target.files, 'image')}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFileUpload(e.target.files, 'attachment')}
      />

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
