import { useEffect, useState, useRef } from 'react'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import { loadBBTalks, createBBTalkAsync, deleteBBTalkAsync, updateBBTalkAsync, loadMoreBBTalks, loadPublicBBTalks, loadMorePublicBBTalks } from '../store/slices/bbtalkSlice'
import { loadTags, updateTagAsync } from '../store/slices/tagSlice'
import BBTalkEditor from '../components/BBTalkEditor'
import CachedImage from '../components/CachedImage'
import ImagePreview from '../components/ImagePreview'
import PrivacyOverlay from '../components/PrivacyOverlay'
import { usePrivacyMode } from '../hooks/usePrivacyMode'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Tag, Attachment } from '../types'

// Props 接口
interface BBTalkPageProps {
  isPublic?: boolean       // 是否公开页面
}

// 可拖动的标签项组件
function SortableTagItem({
  tag,
  isSelected,
  count,
  onClick,
}: {
  tag: Tag
  isSelected: boolean
  count: number
  onClick: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tag.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} className="flex items-center gap-1 group">
      {/* 标签按钮 - 仅响应点击 */}
      <button
        onClick={onClick}
        className={`flex-1 text-left px-3 py-2 rounded-lg transition-all text-sm flex items-center justify-between ${
          isSelected
            ? 'bg-gray-100 text-gray-900 font-medium'
            : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900 hover:font-medium'
        }`}
      >
        <span className="flex items-center gap-1.5">
          {/* 标签图标 - 默认显示，hover时隐藏 */}
          <svg className="w-3.5 h-3.5 group-hover:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
          {/* 拖拽图标 - 默认隐藏，hover时显示 */}
          <div 
            {...listeners}
            className="hidden group-hover:block cursor-move"
            title="拖动排序"
          >
            <svg className="w-3 h-4 text-gray-400" viewBox="0 0 8 16" fill="currentColor">
              <circle cx="2" cy="2" r="1.5" />
              <circle cx="6" cy="2" r="1.5" />
              <circle cx="2" cy="8" r="1.5" />
              <circle cx="6" cy="8" r="1.5" />
              <circle cx="2" cy="14" r="1.5" />
              <circle cx="6" cy="14" r="1.5" />
            </svg>
          </div>
          {tag.name}
        </span>
        {count > 0 && (
          <span className="text-xs text-gray-400">{count}</span>
        )}
      </button>
    </div>
  )
}

export default function BBTalkPage({ isPublic = false }: BBTalkPageProps) {
  const dispatch = useAppDispatch()
  const { bbtalks, isLoading, hasMore, totalCount } = useAppSelector((state) => state.bbtalk)
  const { tags } = useAppSelector((state) => state.tag)
  const [isPublishing, setIsPublishing] = useState(false)
  const [showEditor, setShowEditor] = useState(true)
  const [showBackToTop, setShowBackToTop] = useState(false)
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const [editingBBTalk, setEditingBBTalk] = useState<typeof bbtalks[0] | null>(null)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [copyTip, setCopyTip] = useState<{ show: boolean; id: string | null }>({ show: false, id: null })
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const lastScrollY = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  
  // 防窥模式：从环境变量读取超时时长（分钟），默认 5 分钟
  const privacyTimeoutMinutes = parseInt(import.meta.env.VITE_PRIVACY_TIMEOUT_MINUTES || '5', 10)
  const privacyTimeoutMs = privacyTimeoutMinutes * 60 * 1000
  const { isPrivacyMode, resetTimer } = usePrivacyMode({
    timeout: privacyTimeoutMs,
    enabled: !isPublic, // 仅登录状态启用防窥模式
    persistOnRefresh: true,
  })

  // 登录跳转
  const handleLogin = () => {
    const autheliaUrl = import.meta.env.VITE_AUTHELIA_URL || '/authelia'
    const currentUrl = encodeURIComponent(window.location.origin + '/')
    window.location.href = `${autheliaUrl}/?rd=${currentUrl}`
  }

  // 拖拽传感器配置
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  useEffect(() => {
    // 加载初始数据
    console.log('[BBTalkPage] 初始加载 useEffect 触发, isPublic:', isPublic)
    if (isPublic) {
      dispatch(loadPublicBBTalks({}))
    } else {
      dispatch(loadBBTalks({}))
      dispatch(loadTags())
    }
    setIsInitialLoad(false)
  }, [dispatch, isPublic])

  // 监听标签筛选，重新加载数据
  useEffect(() => {
    // 跳过初始加载
    if (isInitialLoad) {
      console.log('[BBTalkPage] 标签筛选 useEffect 跳过 - 初始加载中')
      return
    }
    
    // 只在标签选择变化时才发送请求
    if (tags.length === 0) {
      console.log('[BBTalkPage] 标签筛选 useEffect 跳过 - tags 还未加载')
      return // 标签还没加载完成，不发送请求
    }
    
    console.log('[BBTalkPage] 标签筛选 useEffect 触发, selectedTags:', selectedTags)
    const tagNames = selectedTags.map(tagId => {
      const tag = tags.find(t => t.id === tagId)
      return tag?.name
    }).filter(Boolean) as string[]
    
    console.log('[BBTalkPage] 发送标签筛选请求, tagNames:', tagNames)
    dispatch(loadBBTalks({ tags: tagNames }))
  }, [selectedTags, isInitialLoad, dispatch])

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenu(null)
      }
    }

    if (activeMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [activeMenu])



  // 监听滚动，控制编辑框显示/隐藏、回到顶部按钮和分页加载
  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current) return
      
      const currentScrollY = containerRef.current.scrollTop
      const scrollHeight = containerRef.current.scrollHeight
      const clientHeight = containerRef.current.clientHeight
      
      // 向上滚动显示编辑框，向下滚动隐藏编辑框
      if (currentScrollY < lastScrollY.current) {
        setShowEditor(true)
      } else if (currentScrollY > lastScrollY.current && currentScrollY > 100) {
        setShowEditor(false)
      }
      
      // 滚动超过400px显示回到顶部按钮
      setShowBackToTop(currentScrollY > 400)
      
      // 滚动到底部时加载更多
      if (scrollHeight - currentScrollY - clientHeight < 100 && hasMore && !isLoading && !isLoadingMore) {
        handleLoadMore()
      }
      
      lastScrollY.current = currentScrollY
    }

    const container = containerRef.current
    if (container) {
      container.addEventListener('scroll', handleScroll)
      return () => container.removeEventListener('scroll', handleScroll)
    }
  }, [hasMore, isLoading, isLoadingMore])

  // 处理发布（包括新建和编辑）
  const handlePublish = async (data: {
    content: string
    tags: string[]
    attachments: Attachment[]
    visibility: 'public' | 'private' | 'friends'
    context?: Record<string, any>
  }) => {
    setIsPublishing(true)
    try {
      console.log('发布内容:', data)
      
      // 检测是否有新标签
      const hasNewTags = data.tags.some(tagName => 
        !tags.some(existingTag => existingTag.name === tagName)
      )
      
      if (editingBBTalk) {
        // 编辑模式：更新现有 BBTalk
        const tagObjects = data.tags.map(tagName => ({
          id: '',
          name: tagName,
          color: '',
          sortOrder: 0,
          createdAt: '',
          updatedAt: '',
          isDeleted: false
        }))
        
        // 比较附件文件是否有变化（不可变方式）
        const originalAttachmentIds = [...(editingBBTalk.attachments?.map(a => a.uid) || [])].sort()
        const currentAttachmentIds = [...data.attachments.map(a => a.uid)].sort()
        const attachmentsChanged = JSON.stringify(originalAttachmentIds) !== JSON.stringify(currentAttachmentIds)
        
        // 构建更新数据
        const updateData: any = {
          content: data.content,
          tags: tagObjects,
          visibility: data.visibility
        }
        
        // 只有当附件有变化时才传递 attachments 字段
        if (attachmentsChanged) {
          updateData.attachments = data.attachments
        }
        
        await dispatch(updateBBTalkAsync({
          id: editingBBTalk.id,
          data: updateData
        })).unwrap()
        
        // 退出编辑模式
        setEditingBBTalk(null)
      } else {
        // 新建模式
        await dispatch(createBBTalkAsync(data)).unwrap()
        
        // 发布成功后滚动到顶部显示新发布的内容
        if (containerRef.current) {
          containerRef.current.scrollTo({ top: 0, behavior: 'smooth' })
        }
      }
      
      // 只在有新标签时刷新标签列表
      if (hasNewTags) {
        dispatch(loadTags())
      }
    } catch (error) {
      console.error(editingBBTalk ? '更新失败:' : '发布失败:', error)
      alert(editingBBTalk ? '更新失败，请重试' : '发布失败，请重试')
    } finally {
      setIsPublishing(false)
    }
  }

  // 回到顶部
  const scrollToTop = () => {
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  // 加载更多
  const handleLoadMore = async () => {
    if (isLoadingMore || !hasMore) return
    
    setIsLoadingMore(true)
    try {
      if (isPublic) {
        await dispatch(loadMorePublicBBTalks({}))
      } else {
        const tagNames = selectedTags.map(tagId => {
          const tag = tags.find(t => t.id === tagId)
          return tag?.name
        }).filter(Boolean) as string[]
        
        await dispatch(loadMoreBBTalks({ tags: tagNames }))
      }
    } finally {
      setIsLoadingMore(false)
    }
  }

  // 切换标签筛选（单选模式）
  const toggleTag = (tagId: string) => {
    setSelectedTags(prev => 
      prev.includes(tagId) ? [] : [tagId]
    )
  }

  // 处理编辑按钮点击
  const handleEdit = (bbtalk: typeof bbtalks[0]) => {
    setEditingBBTalk(bbtalk)
    setActiveMenu(null)
  }
  
  // 取消编辑
  const handleCancelEdit = () => {
    setEditingBBTalk(null)
  }

  // 处理标签拖拽结束
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = tags.findIndex((item) => item.id === active.id)
      const newIndex = tags.findIndex((item) => item.id === over.id)
      const reorderedTags = arrayMove(tags, oldIndex, newIndex)
      
      // 使用分数插值策略更新 sortOrder
      const movedTag = reorderedTags[newIndex]
      let newSortOrder: number
      
      if (newIndex === 0) {
        // 移动到第一位
        const nextTag = reorderedTags[1]
        newSortOrder = nextTag ? (nextTag.sortOrder ?? 0) - 1000 : 0
      } else if (newIndex === reorderedTags.length - 1) {
        // 移动到最后一位
        const prevTag = reorderedTags[newIndex - 1]
        newSortOrder = prevTag ? (prevTag.sortOrder ?? 0) + 1000 : 0
      } else {
        // 移动到中间位置，计算前后平均值
        const prevTag = reorderedTags[newIndex - 1]
        const nextTag = reorderedTags[newIndex + 1]
        newSortOrder = ((prevTag.sortOrder ?? 0) + (nextTag.sortOrder ?? 0)) / 2
      }
      
      // 乐观更新：先立即更新本地状态，再发送请求到后端
      // 如果请求失败，Redux 会自动回滚
      dispatch(updateTagAsync({
        id: movedTag.id,
        data: { sortOrder: newSortOrder }
      })).unwrap().catch((error) => {
        // 只有失败时才提示用户
        console.error('更新标签排序失败:', error)
        alert('标签排序更新失败，请重试')
        // 失败后重新加载标签列表以恢复正确状态
        dispatch(loadTags())
      })
    }
  }

  // 筛选BBTalks（仅用于搜索关键词的前端筛选）
  const filteredBBTalks = bbtalks.filter(bbtalk => {
    // 搜索关键词筛选
    if (searchKeyword && !bbtalk.content.toLowerCase().includes(searchKeyword.toLowerCase())) {
      return false
    }
    return true
  })

  return (
    <div className="h-full bg-gray-50">
      {/* 整体容器 - 左右内容作为整体居中 */}
      <div className="h-full max-w-7xl w-full mx-auto px-4">
        <div className="h-full flex gap-3">
          {/* 左侧菜单块 - 窗口缩窄时隐藏 */}
          <div className="hidden lg:flex py-8 flex-shrink-0" style={{ width: '256px' }}>
          <div className="w-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 4rem)' }}>
          {/* 搜索标题和搜索框 */}
          <div className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-gray-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="text-sm font-medium">搜索</span>
            </div>
            <div className="relative">
              <input
                type="text"
                placeholder="搜索 BBTalk..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500 bg-white text-gray-800 text-sm transition-colors"
              />
              <svg className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          {/* 分隔线 */}
          <div className="border-t border-gray-100"></div>

          {/* 标签区域 - 占满剩余空间 */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-4 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded bg-orange-400"></div>
                <span className="text-sm font-medium text-gray-600">标签</span>
              </div>
            </div>
            
            {/* 标签列表 - 可滚动，隐藏滚动条 */}
            <div className="flex-1 overflow-y-auto px-4 pb-4" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              <style>{`
                .flex-1.overflow-y-auto::-webkit-scrollbar {
                  display: none;
                }
              `}</style>
              {/* 全部标签按钮*/}
              <button
                onClick={() => setSelectedTags([])}
                className={`w-full text-left px-3 py-2 rounded-lg transition-all mb-1.5 text-sm flex items-center justify-between ${
                  selectedTags.length === 0
                    ? 'bg-gray-100 text-gray-900 font-medium'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900 hover:font-medium'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {/* 全部图标 - 使用与标签相同的图标 */}
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  全部
                </span>
                {totalCount > 0 && (
                  <span className="text-xs text-gray-400">{totalCount}</span>
                )}
              </button>

              {/* 标签列表 */}
              {tags.length === 0 ? (
                <p className="text-xs text-gray-500 px-3 py-2">暂无标签</p>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={tags.map(t => t.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-1">
                      {tags.map((tag) => {
                        const isSelected = selectedTags.includes(tag.id)
                        const count = tag.bbtalkCount || 0
                        
                        return (
                          <SortableTagItem
                            key={tag.id}
                            tag={tag}
                            isSelected={isSelected}
                            count={count}
                            onClick={() => toggleTag(tag.id)}
                          />
                        )
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </div>
        </div>
          </div>

          {/* 右侧内容区 */}
          <div ref={containerRef} className="flex-1 min-w-0 py-8 overflow-y-auto">
            {/* 滚动内容区 */}
            <div className="w-full px-4 lg:px-6">
          {/* 编辑框 / 登录提示 */}
          {isPublic ? (
            /* 公开页面显示登录提示 */
            <div className="mb-6 bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-gray-800 font-medium">来都来了，说两句？</p>
                  </div>
                </div>
                <button
                  onClick={handleLogin}
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  登录
                </button>
              </div>
            </div>
          ) : (
            /* 已登录显示编辑框 */
            <div 
              className={`transition-all duration-300 mb-6 ${
                showEditor ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none h-0 mb-0 overflow-hidden'
              }`}
            >
              <BBTalkEditor 
                onPublish={handlePublish} 
                isPublishing={isPublishing}
              />
            </div>
          )}

          {/* BBTalk 列表 - 使用防窥遮罩包裹 */}
          <PrivacyOverlay isPrivacyMode={isPrivacyMode} onUnlock={resetTimer}>
            <div className="space-y-4">
            {isLoading && bbtalks.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-6 text-center text-gray-600">
                加载中...
              </div>
            ) : filteredBBTalks.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-6 text-center text-gray-600">
                {searchKeyword || selectedTags.length > 0 ? '没有找到匹配的碎碎念' : '暂无碎碎念'}
              </div>
            ) : (
              filteredBBTalks.map((bbtalk) => {
                // 判断当前是否在编辑模式
                const isEditing = editingBBTalk?.id === bbtalk.id
                
                // 从 context 中提取来源信息和设备类型
                const getSource = () => {
                  if (!bbtalk.context) return 'Web'
                  
                  // 如果context是字符串，直接返回
                  if (typeof bbtalk.context === 'string') return bbtalk.context
                  
                  // context 是对象，尝试从 source.client 提取
                  if (bbtalk.context.source && typeof bbtalk.context.source === 'object') {
                    const sourceObj = bbtalk.context.source as { client?: string; version?: string; platform?: string }
                    if (sourceObj.client && typeof sourceObj.client === 'string') {
                      return sourceObj.client
                    }
                  }
                  
                  // 尝试从 context.client 直接提取（某些旧数据格式）
                  if (bbtalk.context.client && typeof bbtalk.context.client === 'string') {
                    return bbtalk.context.client
                  }
                  
                  return 'Web'
                }
                
                // 检测是否为移动设备来源
                const isMobileSource = () => {
                  if (!bbtalk.context || typeof bbtalk.context !== 'object') return false
                  
                  // 检测 source.platform
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
                  if (!bbtalk.context.location) return null
                  
                  const loc = bbtalk.context.location as { latitude?: number; longitude?: number }
                  if (typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
                    return loc
                  }
                  
                  return null
                }
                
                const source = getSource()
                const isMobile = isMobileSource()
                const location = getLocation()

                return (
                  <div key={bbtalk.id} className="bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow relative bbtalk-item group">
                    {/* 编辑模式 */}
                    {isEditing ? (
                      <div className="p-6">
                        <BBTalkEditor 
                          onPublish={handlePublish} 
                          isPublishing={isPublishing}
                          editing={editingBBTalk}
                          onCancelEdit={handleCancelEdit}
                        />
                      </div>
                    ) : (
                      <div className="p-6">
                    {/* 更多菜单 - 右上角，公开模式只显示复制链接 */}
                    <div className="absolute top-4 right-4" ref={activeMenu === bbtalk.id ? menuRef : null}>
                      <button
                        className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        onClick={() => setActiveMenu(activeMenu === bbtalk.id ? null : bbtalk.id)}
                        title="更多"
                      >
                        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                        </svg>
                      </button>

                      {/* 下拉菜单 */}
                      {activeMenu === bbtalk.id && (
                        <div className="absolute right-0 mt-2 w-32 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                          <button
                            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2 relative"
                            onClick={() => {
                              // 复制分享链接
                              const shareUrl = `${window.location.origin}/bbtalk/${bbtalk.id}`
                              navigator.clipboard.writeText(shareUrl).then(() => {
                                setCopyTip({ show: true, id: bbtalk.id })
                                setTimeout(() => {
                                  setCopyTip({ show: false, id: null })
                                }, 2000)
                                setActiveMenu(null)
                              }).catch(() => {
                                alert('复制失败，请重试')
                              })
                            }}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                            </svg>
                            复制链接
                          </button>
                          {/* 编辑和删除仅登录后显示 */}
                          {!isPublic && (
                          <>
                          <button
                            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                            onClick={() => handleEdit(bbtalk)}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            编辑
                          </button>
                          <button
                            className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-gray-100 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={deletingIds.has(bbtalk.id)}
                            onClick={async () => {
                              if (deletingIds.has(bbtalk.id)) return
                              setDeletingIds(prev => new Set(prev).add(bbtalk.id))
                              try {
                                await dispatch(deleteBBTalkAsync(bbtalk.id))
                              } finally {
                                setDeletingIds(prev => {
                                  const next = new Set(prev)
                                  next.delete(bbtalk.id)
                                  return next
                                })
                              }
                              setActiveMenu(null)
                            }}
                          >
                            {deletingIds.has(bbtalk.id) ? (
                              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1-1v3M4 7h16" />
                              </svg>
                            )}
                            {deletingIds.has(bbtalk.id) ? '删除中...' : '删除'}
                          </button>
                          </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 内容 */}
                    <p className="text-gray-800 whitespace-pre-wrap leading-relaxed text-[15px]">{bbtalk.content}</p>
                    
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
                    
                    {/* 附件文件 */}
                    {bbtalk.attachments && bbtalk.attachments.length > 0 && (
                      <div className="mt-4">
                        {/* 辅助函数：判断附件类型 */}
                        {(() => {
                          const isImage = (attachment: typeof bbtalk.attachments[0]) => {
                            if (attachment.type === 'image') return true
                            const url = attachment.url.toLowerCase()
                            const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tif', '.tiff']
                            return imageExts.some(ext => url.split('?')[0].endsWith(ext))
                          }
                          
                          const isVideo = (attachment: typeof bbtalk.attachments[0]) => {
                            if (attachment.type === 'video') return true
                            const url = attachment.url.toLowerCase()
                            const videoExts = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv', '.m4v']
                            return videoExts.some(ext => url.split('?')[0].endsWith(ext))
                          }
                          
                          const images = bbtalk.attachments.filter(isImage)
                          const videos = bbtalk.attachments.filter(a => !isImage(a) && isVideo(a))
                          const files = bbtalk.attachments.filter(a => !isImage(a) && !isVideo(a))
                          
                          return (
                            <>
                              {/* 图片网格布局 */}
                              {images.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-3">
                                  {images.map((attachment) => (
                                    <div key={attachment.uid || attachment.url} className="relative group">
                                      <CachedImage
                                        src={attachment.url}
                                        alt={attachment.originalFilename || ''}
                                        className="max-w-xs max-h-64 object-contain bg-gray-50 rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                                        onClick={() => setPreviewImage({ src: attachment.url, alt: attachment.originalFilename || '' })}
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
                              
                              {/* 视频播放器 */}
                              {videos.length > 0 && (
                                <div className="flex flex-wrap gap-3 mb-3">
                                  {videos.map((attachment) => (
                                    <div key={attachment.uid || attachment.url} className="relative group max-w-md">
                                      <video
                                        src={attachment.url}
                                        controls
                                        preload="metadata"
                                        className="max-w-full max-h-80 rounded-lg bg-black"
                                        playsInline
                                      >
                                        您的浏览器不支持视频播放
                                      </video>
                                      {attachment.originalFilename && (
                                        <div className="mt-1 text-xs text-gray-500 truncate">
                                          {attachment.originalFilename}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                              
                              {/* 其他文件列表 */}
                              {files.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                  {files.map((attachment) => {
                                    const formatFileSize = (bytes?: number) => {
                                      if (!bytes) return ''
                                      if (bytes < 1024) return `${bytes} B`
                                      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
                                      if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
                                      return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
                                    }
                                    
                                    const getFileIcon = (type: string) => {
                                      switch(type) {
                                        case 'audio':
                                          return (
                                            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                                            </svg>
                                          )
                                        default:
                                          return (
                                            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                          )
                                      }
                                    }
                                    
                                    return (
                                      <a
                                        key={attachment.uid || attachment.url}
                                        href={attachment.url}
                                        download={attachment.originalFilename}
                                        className="inline-flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200 group"
                                      >
                                        {getFileIcon(attachment.type)}
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
                                      </a>
                                    )
                                  })}
                                </div>
                              )}
                            </>
                          )
                        })()}
                      </div>
                    )}

                        {/* 底部信息栏 */}
                        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
                      <div className="flex items-center gap-3">
                        {/* 时间 */}
                        <span 
                          className="text-gray-600 relative group/time cursor-help"
                          title={new Date(bbtalk.createdAt).toLocaleString('zh-CN', { 
                            year: 'numeric',
                            month: 'long', 
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          })}
                        >
                          {(() => {
                            const now = new Date()
                            const created = new Date(bbtalk.createdAt)
                            const diffMs = now.getTime() - created.getTime()
                            const diffMins = Math.floor(diffMs / 60000)
                            const diffHours = Math.floor(diffMs / 3600000)
                            const diffDays = Math.floor(diffMs / 86400000)
                            
                            if (diffMins < 1) return '刚刚'
                            if (diffMins < 60) return `${diffMins} 分钟前`
                            if (diffHours < 24) return `${diffHours} 小时前`
                            if (diffDays < 7) return `${diffDays} 天前`
                            return created.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })
                          })()}
                          {/* Hover提示框 - 显示在右上方 */}
                          <div className="absolute bottom-full left-0 mb-2 hidden group-hover/time:block z-10 whitespace-nowrap">
                            <div className="bg-gray-900 text-white px-3 py-2 rounded-lg shadow-lg text-sm">
                              <div className="font-medium">创建时间</div>
                              <div className="text-xs mt-1">
                                {new Date(bbtalk.createdAt).toLocaleString('zh-CN', { 
                                  year: 'numeric',
                                  month: 'long', 
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit'
                                })}
                              </div>
                              {/* 小三角 */}
                              <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                            </div>
                          </div>
                        </span>
                        
                        {/* 来源 - 根据设备类型使用不同图标 */}
                        <span className="flex items-center gap-1 text-gray-500 relative group/device cursor-help">
                          {isMobile ? (
                            // 移动设备图标
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                          ) : (
                            // 桌面设备图标
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                          )}
                          {isMobile ? '手机' : source}
                          {/* Hover提示框 - 显示在右上方 */}
                          <div className="absolute bottom-full left-0 mb-2 hidden group-hover/device:block z-10 whitespace-nowrap">
                            <div className="bg-gray-900 text-white px-3 py-2 rounded-lg shadow-lg text-sm">
                              <div className="font-medium">发布设备</div>
                              <div className="text-xs mt-1">
                                {isMobile ? '移动设备 (手机)' : `桌面设备 (${source})`}
                              </div>
                              {/* 小三角 */}
                              <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                            </div>
                          </div>
                        </span>
                        
                        {/* 定位信息 - 如果有定位则显示 */}
                        {location && location.latitude !== undefined && location.longitude !== undefined && (
                          <span className="relative group/location">
                            <svg className="w-4 h-4 text-green-600 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            {/* Hover提示框 - 显示在右上方 */}
                            <div className="absolute bottom-full right-0 mb-2 hidden group-hover/location:block z-10 whitespace-nowrap">
                              <div className="bg-gray-900 text-white px-3 py-2 rounded-lg shadow-lg text-sm">
                                <div className="font-medium mb-1">定位信息</div>
                                <div className="text-xs">
                                  <div>纬度: {location.latitude.toFixed(6)}</div>
                                  <div>经度: {location.longitude.toFixed(6)}</div>
                                </div>
                                {/* 小三角 */}
                                <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                              </div>
                            </div>
                          </span>
                        )}
                        
                        {/* 可见性状态 */}
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
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
            </div>
                
            {/* 加载更多提示 */}
            {isLoadingMore && (
              <div className="flex justify-center py-4">
                <div className="text-gray-600 text-sm">加载中...</div>
              </div>
            )}
                
            {!hasMore && bbtalks.length > 0 && (
              <div className="flex justify-center py-4">
                <div className="text-gray-400 text-sm">没有更多了</div>
              </div>
            )}
          </PrivacyOverlay>
          </div>
        </div>
      </div>
      </div>

      {/* 回到顶部按钮 - 仅桌面端显示 */}
      {showBackToTop && (
        <button
          onClick={scrollToTop}
          className="hidden md:flex fixed bottom-8 right-8 w-12 h-12 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-all duration-300 items-center justify-center z-50"
          title="回到顶部"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
        </button>
      )}

      {/* 复制成功提示 */}
      {copyTip.show && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 animate-fade-in">
          <div className="bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="font-medium">链接已复制</span>
          </div>
        </div>
      )}



      {/* 图片预览 */}
      {previewImage && (
        <ImagePreview
          src={previewImage.src}
          alt={previewImage.alt}
          onClose={() => setPreviewImage(null)}
        />
      )}
    </div>
  )
}


