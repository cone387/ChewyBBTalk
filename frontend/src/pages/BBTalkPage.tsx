import WorkspaceSidebar from '../components/layout/WorkspaceSidebar'
import { useActionFeedback } from '../hooks/useActionFeedback'
import { useUndoableDelete } from '../hooks/useUndoableDelete'
import { useCallback, useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import { invalidateFeed, loadBBTalks, createBBTalkAsync, updateBBTalkAsync, loadMoreBBTalks, loadPublicBBTalks, loadMorePublicBBTalks, optimisticDelete, undoDelete } from '../store/slices/bbtalkSlice'
import { loadTags, updateTagAsync } from '../store/slices/tagSlice'
import BBTalkEditor from '../components/BBTalkEditor'
import BBTalkItem from '../components/BBTalkItem'
import Modal from '../components/ui/Modal'
import ImagePreview from '../components/ImagePreview'
import PrivacyCountdownButton from '../components/PrivacyCountdownButton'
import { usePrivacyMode } from '../hooks/usePrivacyMode'
import { getCurrentUser } from '../services/auth'
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
import UndoToast from '../components/UndoToast'
import SkeletonCard from '../components/SkeletonCard'
import { bbtalkApi } from '../services/api'

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
    <div ref={setNodeRef} style={style} className="tag-list-row flex min-w-0 items-center gap-1 group">
      {/* 标签按钮 - 仅响应点击 */}
      <button
        onClick={onClick}
        aria-pressed={isSelected}
        title={tag.name}
        className={`min-h-11 min-w-0 flex-1 gap-2 text-left px-3 py-2 rounded-lg transition-colors text-sm flex items-center justify-between ${
          isSelected
            ? 'bg-blue-50 text-blue-700 font-medium'
            : 'text-gray-600 hover:bg-gray-200/60 hover:text-gray-900'
        }`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <svg aria-hidden="true" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
          <span className="truncate">{tag.name}</span>
        </span>
        {count > 0 && (
          <span className="shrink-0 text-xs tabular-nums text-gray-500">{count}</span>
        )}
      </button>
      <button type="button" {...attributes} {...listeners} aria-label={`拖动排序：${tag.name}`}
        className="tag-drag-handle flex min-h-11 min-w-11 shrink-0 touch-none items-center justify-center rounded-lg text-gray-400 hover:bg-gray-200/60 hover:text-gray-700">
        <svg aria-hidden="true" className="h-4 w-3" viewBox="0 0 8 16" fill="currentColor">
          <circle cx="2" cy="2" r="1.5" /><circle cx="6" cy="2" r="1.5" />
          <circle cx="2" cy="8" r="1.5" /><circle cx="6" cy="8" r="1.5" />
          <circle cx="2" cy="14" r="1.5" /><circle cx="6" cy="14" r="1.5" />
        </svg>
      </button>
    </div>
  )
}

export default function BBTalkPage({ isPublic = false }: BBTalkPageProps) {
  const feedback = useActionFeedback()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { bbtalks, isLoading, hasMore, totalCount } = useAppSelector((state) => state.bbtalk)
  const { tags } = useAppSelector((state) => state.tag)
  const [isPublishing, setIsPublishing] = useState(false)
  const [showEditor, setShowEditor] = useState(true)
  const [showBackToTop, setShowBackToTop] = useState(false)
  const [showMobileMenu, setShowMobileMenu] = useState(false) // 移动端菜单
  const [editingBBTalk, setEditingBBTalk] = useState<typeof bbtalks[0] | null>(null)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [copyTip, setCopyTip] = useState<{ show: boolean; id: string | null }>({ show: false, id: null })
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null)
  const deletion = useUndoableDelete<{ bbtalk: typeof bbtalks[0]; index: number }>({
    remove: ({ bbtalk }) => { dispatch(optimisticDelete(bbtalk.id)) },
    restore: (item) => { dispatch(undoDelete(item)) },
    commit: ({ bbtalk }) => bbtalkApi.deleteBBTalk(bbtalk.id),
    onError: (error, item) => feedback.report('删除失败：' + (error instanceof Error ? error.message : '请稍后重试'), async () => {
      await bbtalkApi.deleteBBTalk(item.bbtalk.id)
      dispatch(optimisticDelete(item.bbtalk.id))
    }),
  })
  const lastScrollY = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const [privacyTimeoutMinutes] = useState(() => {
    const saved = localStorage.getItem('privacy_timeout_minutes')
    return saved ? parseInt(saved, 10) : parseInt(import.meta.env.VITE_PRIVACY_TIMEOUT_MINUTES || '5', 10)
  })
  const [currentUser] = useState(getCurrentUser())
  const [showCountdown] = useState(() => {
    const saved = localStorage.getItem('show_privacy_countdown')
    return saved ? saved === 'true' : import.meta.env.VITE_SHOW_PRIVACY_COUNTDOWN === 'true'
  })
  
// 防窥模式：使用可配置的超时时长（页面顶层关闭 trackCountdown，避免每秒重渲染列表）
  const privacyTimeoutMs = privacyTimeoutMinutes * 60 * 1000
  const { isPrivacyMode, resetTimer, activatePrivacy } = usePrivacyMode({
    timeout: privacyTimeoutMs,
    enabled: !isPublic, // 仅登录状态启用防窥模式
    persistOnRefresh: true,
    trackCountdown: false,
  })
  
  // 调试：输出 isPrivacyMode 状态，并在进入防窥模式时跳转到锁定页面
  useEffect(() => {
    console.log('[BBTalkPage] isPrivacyMode 状态变化:', isPrivacyMode)
    if (isPrivacyMode && !isPublic) {
      console.log('[BBTalkPage] 进入防窥模式，跳转到锁定页面')
      navigate('/locked', { replace: true })
    }
  }, [isPrivacyMode, isPublic, navigate])
  
  // 环境变量配置
  const showPrivacyCountdown = showCountdown
  
  // 当防偷窥时长改变时，重置计时器（但不在防窥模式下重置）
  const resetTimerRef = useRef(resetTimer)
  const prevTimeoutRef = useRef(privacyTimeoutMinutes)
  useEffect(() => {
    resetTimerRef.current = resetTimer
  }, [resetTimer])
  
  useEffect(() => {
    // 只有当时长真正变化时才重置（排除首次加载）
    if (!isPublic && !isPrivacyMode && prevTimeoutRef.current !== privacyTimeoutMinutes) {
      console.log('[BBTalkPage] 防偷窥时长已更新为', privacyTimeoutMinutes, '分钟，重置计时器')
      resetTimerRef.current()
    }
    prevTimeoutRef.current = privacyTimeoutMinutes
  }, [privacyTimeoutMinutes, isPublic, isPrivacyMode]) // 故意不包含 resetTimer，避免循环

  // 登录跳转
  const handleLogin = () => {
    window.location.href = '/login'
  }

  // 拖拽传感器配置
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
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

  const buildFilterParams = useCallback(() => {
    const tagNames = selectedTags.map(tagId => tags.find(t => t.id === tagId)?.name).filter(Boolean) as string[]
    return {
      search: searchKeyword.trim() || undefined,
      tags: tagNames,
    }
  }, [searchKeyword, selectedTags, tags])

  const clearFilters = () => {
    setSearchKeyword('')
    setSelectedTags([])
  }
  const activeFilters = [
    ...(searchKeyword.trim() ? [{ key: 'search', label: `关键词：${searchKeyword.trim()}`, remove: () => setSearchKeyword('') }] : []),
    ...selectedTags.map(id => ({ key: `tag-${id}`, label: `标签：${tags.find(tag => tag.id === id)?.name ?? id}`, remove: () => setSelectedTags(previous => previous.filter(tag => tag !== id)) })),
  ]

  // 监听搜索与筛选条件，防抖后重新加载数据
  useEffect(() => {
    // 跳过初始加载
    if (isInitialLoad || isPublic) {
      console.log('[BBTalkPage] 搜索筛选 useEffect 跳过 - 初始加载中')
      return
    }

    dispatch(invalidateFeed())
    const timer = window.setTimeout(() => {
      dispatch(loadBBTalks(buildFilterParams()))
    }, 300)
    return () => window.clearTimeout(timer)
  }, [buildFilterParams, dispatch, isInitialLoad, isPublic])




  useEffect(() => {
    let lastRefresh = 0
    const refresh = () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine || Date.now() - lastRefresh < 1000) return
      lastRefresh = Date.now()
      if (isPublic) dispatch(loadPublicBBTalks({}))
      else if (getCurrentUser()) {
        dispatch(loadBBTalks(buildFilterParams()))
        dispatch(loadTags())
      }
    }
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [buildFilterParams, dispatch, isPublic])

  // 监听滚动，控制编辑框显示/隐藏、回到顶部按钮和分页加载（使用 rAF 节流避免频繁触发重渲染）
  useEffect(() => {
    let ticking = false
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          if (!containerRef.current) {
            ticking = false
            return
          }
          
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
          const shouldShow = currentScrollY > 400
          setShowBackToTop(prev => prev !== shouldShow ? shouldShow : prev)
          
          // 滚动到底部时加载更多
          if (scrollHeight - currentScrollY - clientHeight < 100 && hasMore && !isLoading && !isLoadingMore) {
            handleLoadMore()
          }
          
          lastScrollY.current = currentScrollY
          ticking = false
        })
        ticking = true
      }
    }

    const container = containerRef.current
    if (container) {
      container.addEventListener('scroll', handleScroll, { passive: true })
      return () => container.removeEventListener('scroll', handleScroll)
    }
  }, [hasMore, isLoading, isLoadingMore])

  // 处理发布（包括新建和编辑）
  const handlePublish = async (data: {
    content: string
    expectedUpdatedAt?: string
    tags: string[]
    attachments: Attachment[]
    visibility: 'public' | 'private' | 'friends'
    context?: Record<string, any>
  }, target: typeof bbtalks[0] | null = null) => {
    setIsPublishing(true)
    try {
      console.log('发布内容:', data)
      
      // 检测是否有新标签
      const hasNewTags = data.tags.some(tagName => 
        !tags.some(existingTag => existingTag.name === tagName)
      )
      
      if (target) {
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
        
        // Explicitly save the editor attachment selection after conflict review.
        const updateData = {
          content: data.content, tags: tagObjects,
          visibility: data.visibility, attachments: data.attachments,
        }

        await dispatch(updateBBTalkAsync({
          id: target.id,
          data: updateData,
          expectedUpdatedAt: data.expectedUpdatedAt ?? target.updatedAt
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
      console.error(target ? '更新失败:' : '发布失败:', error)
      throw error
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
        
        await dispatch(loadMoreBBTalks({
          ...buildFilterParams(),
          tags: tagNames,
        }))
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
      
      const saveOrder = async () => {
        await dispatch(updateTagAsync({ id: movedTag.id, data: { sortOrder: newSortOrder } })).unwrap()
        await dispatch(loadTags()).unwrap()
      }
      void saveOrder().catch(() => {
        feedback.report('标签排序更新失败，请重试', saveOrder)
        dispatch(loadTags())
      })
    }
  }

  // 搜索与筛选由后端处理，客户端只负责渲染当前页结果。
  const filteredBBTalks = bbtalks

  return (
    <div className="feed-layout">
      <header className="shrink-0 border-b border-gray-200/70 bg-white lg:hidden">
        <div className="mx-auto flex min-h-16 max-w-3xl items-center justify-between gap-4 px-4 sm:px-8">
          <div>
            <p className="text-lg font-semibold tracking-tight text-gray-900">{isPublic ? '公开碎碎念' : '我的碎碎念'}</p>
          </div>
        </div>
      </header>
      <div className="feed-workspace">
          <WorkspaceSidebar active="/" isPublic={isPublic} footer={
                !isPublic ? <button type="button" onClick={() => navigate('/settings')} aria-label="账户与设置" title={currentUser?.display_name || currentUser?.username}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 text-left hover:bg-gray-100">
                  <span className="min-w-0 truncate text-sm font-medium text-gray-900">{currentUser?.display_name || currentUser?.username || '账户'}</span>
                  <span className="shrink-0 text-sm text-gray-500">设置</span>
                </button> : <button type="button" onClick={handleLogin} className="min-h-11 w-full rounded-lg text-sm text-blue-700 hover:bg-blue-50">登录</button>
          }>
            <div className="px-2 pb-5">
                <label className="block text-sm font-medium text-gray-600">
                  搜索
                  <input type="search" placeholder="搜索 BBTalk..." value={searchKeyword}
                    onChange={event => setSearchKeyword(event.target.value)}
                    className="feed-field mt-2 min-h-11 w-full rounded-xl px-3 text-sm text-gray-800" />
                </label>
            </div>
            <div className="border-t border-gray-200 pt-5">
                <h2 className="mb-3 px-3 text-sm font-medium text-gray-500">标签</h2>
                <button type="button" onClick={() => setSelectedTags([])} aria-pressed={selectedTags.length === 0}
                  className={`mb-2 flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-sm ${selectedTags.length === 0 ? 'bg-gray-100 font-medium text-gray-900' : 'text-gray-700 hover:bg-gray-100'}`}>
                  <span>全部标签</span><span className="text-xs text-gray-400">{totalCount}</span>
                </button>
                {tags.length === 0 ? <p className="px-3 py-2 text-sm text-gray-500">暂无标签</p> :
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={tags.map(tag => tag.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-1">{tags.map(tag => <SortableTagItem key={tag.id} tag={tag}
                        isSelected={selectedTags.includes(tag.id)} count={tag.bbtalkCount || 0} onClick={() => toggleTag(tag.id)} />)}</div>
                    </SortableContext>
                  </DndContext>}
            </div>
          </WorkspaceSidebar>
          {/* 居中的内容流 */}
          <div ref={containerRef} role="main" aria-label="记录列表" className="feed-scroll">
            {/* 滚动内容区 */}
            <div className="feed-column">
              <div className="feed-heading">
                <h1>{activeFilters.length > 0 ? '筛选结果' : isPublic ? '公开记录' : '全部记录'}</h1>
                {activeFilters.length === 0 && <span className="text-sm tabular-nums text-gray-500">{totalCount} 条记录</span>}
              </div>
              <div className="mb-4 flex items-center gap-2 lg:hidden">
                <div className="relative min-w-0 flex-1">
                  <input type="search" aria-label="搜索记录" placeholder="搜索 BBTalk..." value={searchKeyword}
                    onChange={event => setSearchKeyword(event.target.value)}
                    className="feed-field min-h-11 w-full rounded-xl bg-white py-3 pl-10 pr-3 text-base text-gray-800" />
                  <svg aria-hidden="true" className="absolute left-3 top-3.5 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <button type="button" onClick={event => { event.currentTarget.focus(); setShowMobileMenu(true); }} aria-haspopup="dialog" aria-expanded={showMobileMenu}
                  className="min-h-11 shrink-0 rounded-xl bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-100">
                  筛选{selectedTags.length > 0 ? ` (${selectedTags.length})` : ''}
                </button>
              </div>
              {tags.length > 0 && <div aria-label="标签快捷筛选" className="subtle-scrollbar mb-5 flex gap-2 overflow-x-auto pb-1 lg:hidden">
                <button type="button" aria-pressed={selectedTags.length === 0} onClick={() => setSelectedTags([])}
                  className={`min-h-11 shrink-0 rounded-full px-4 text-sm ${selectedTags.length === 0 ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}>全部</button>
                {tags.slice(0, 6).map(tag => <button key={tag.id} type="button" aria-pressed={selectedTags.includes(tag.id)} onClick={() => toggleTag(tag.id)}
                  className={`min-h-11 shrink-0 rounded-full px-4 text-sm ${selectedTags.includes(tag.id) ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}>{tag.name}</button>)}
                {tags.length > 6 && <button type="button" onClick={() => setShowMobileMenu(true)} className="min-h-11 shrink-0 px-3 text-sm text-blue-700">更多标签</button>}
              </div>}
          {/* 编辑框 / 登录提示 */}
          {isPublic ? (
            /* 公开页面显示登录提示 */
            <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
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

          {activeFilters.length > 0 && <section aria-label="当前筛选条件" className="mb-4 rounded-xl bg-gray-100/80 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-gray-800">当前筛选 · {activeFilters.length}</p>
              <button type="button" onClick={clearFilters} className="min-h-11 px-2 text-sm text-blue-700 hover:underline">全部清除</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {activeFilters.map(filter => <button key={filter.key} type="button" aria-label={`移除${filter.label}`} onClick={filter.remove} className="flex min-h-11 max-w-full items-center gap-2 rounded-xl bg-white px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
                <span className="min-w-0 [overflow-wrap:anywhere]">{filter.label}</span><span aria-hidden="true" className="shrink-0">×</span>
              </button>)}
            </div>
          </section>}

          {/* BBTalk 列表 */}
          <div className="space-y-4">
            {isLoading && bbtalks.length === 0 ? (
              <div className="space-y-4">
                {[0, 1, 2].map(i => <SkeletonCard key={i} />)}
              </div>
            ) : filteredBBTalks.length === 0 ? (
              <div className="feed-surface rounded-xl bg-white px-6 py-10 text-center">
                <div aria-hidden="true" className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gray-50 text-gray-400">
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7h8M8 11h5M5 3h14a1 1 0 011 1v16a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z" /></svg>
                </div>
                <p className="font-medium text-gray-700">{activeFilters.length > 0 ? '没有找到匹配的碎碎念' : '暂无碎碎念'}</p>
                <p className="mt-2 text-sm leading-6 text-gray-500">{activeFilters.length > 0 ? '试试其他关键词，或放宽筛选条件。' : isPublic ? '这里还没有公开的记录。' : '从今天的一件小事开始，写下第一条记录。'}</p>
                {activeFilters.length > 0 && <button type="button" onClick={clearFilters} className="mt-4 min-h-11 rounded-xl bg-gray-100 px-5 text-sm text-gray-700 hover:bg-gray-200">清除条件，查看全部</button>}
              </div>
            ) : (
              filteredBBTalks.map((bbtalk) => {
                const isEditing = editingBBTalk?.id === bbtalk.id
                if (isEditing) {
                  return (
                    <div key={bbtalk.id} data-record-id={bbtalk.id} className="feed-surface bg-white rounded-xl relative bbtalk-item group p-6">
                      <BBTalkEditor 
                        onPublish={data => handlePublish(data, bbtalk)}
                        isPublishing={isPublishing}
                        editing={editingBBTalk}
                        onCancelEdit={handleCancelEdit}
                      />
                    </div>
                  )
                }

                return (
                  <BBTalkItem
                    key={bbtalk.id}
                    bbtalk={bbtalk}
                    searchKeyword={searchKeyword.trim()}
                    isPublic={isPublic}
                    onEdit={handleEdit}
                    onDelete={(item) => {
                      const index = bbtalks.findIndex(b => b.id === item.id)
                      if (index !== -1) deletion.remove({ bbtalk: item, index })
                    }}
                    onPreviewImage={setPreviewImage}
                    onShareSuccess={(id) => {
                      setCopyTip({ show: true, id })
                      setTimeout(() => setCopyTip({ show: false, id: null }), 2000)
                    }}
                  />
                )
              })
            )}
            
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
          </div>
          </div>
        </div>
      </div>
      
      {/* 防偷窥倒计时按钮（状态隔离，消除全局重渲染） */}
      {!isPublic && showPrivacyCountdown && !isPrivacyMode && (
        <PrivacyCountdownButton
          timeoutMs={privacyTimeoutMs}
          enabled={!isPublic}
          onActivate={activatePrivacy}
        />
      )}
      
      {/* 回到顶部按钮 - 仅桌面端显示 */}
      {showBackToTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-24 right-8 w-12 h-12 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-all duration-300 hidden md:flex items-center justify-center z-50"
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

      {/* 删除撤销提示 */}
      <div className="fixed bottom-20 left-4 right-4 z-40 mx-auto max-w-lg">{feedback.feedback}</div>
      <UndoToast
        key={deletion.pending?.bbtalk.id ?? 'idle'}
        visible={!!deletion.pending}
        onUndo={deletion.undo}
        onDismiss={deletion.dismiss}
      />
      {/* 移动端底部导航栏 */}
      <div role="navigation" aria-label="移动导航" className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 safe-area-pb">
        <div className="flex items-center h-14 max-w-lg mx-auto">
          {/* 首页 */}
          <button
            onClick={() => {
              clearFilters()
              scrollToTop()
            }}
            className="flex flex-col items-center justify-center flex-1 h-full text-blue-600 min-w-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span className="text-xs mt-0.5">记录</span>
          </button>
          
          {/* 标签 */}
          <button
            onClick={() => setShowMobileMenu(true)}
            className={`flex flex-col items-center justify-center flex-1 h-full min-w-0 ${activeFilters.length > 0 ? 'text-blue-600' : 'text-gray-600'}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
            <span className="text-xs mt-0.5">筛选{activeFilters.length > 0 ? `(${activeFilters.length})` : ''}</span>
          </button>
          
          {/* 设置 */}
          {!isPublic && (
            <button
              onClick={() => navigate('/settings')}
              className="flex flex-col items-center justify-center flex-1 h-full text-gray-600 min-w-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-xs mt-0.5">我的</span>
            </button>
          )}
        </div>
      </div>
      
      {/* 标签筛选面板 */}
      <Modal visible={showMobileMenu} title="筛选记录" onClose={() => setShowMobileMenu(false)}
        footer={<div className="flex items-center justify-between gap-3">
          <button type="button" onClick={clearFilters} className="min-h-11 px-3 text-sm text-gray-600 hover:text-gray-900">清除筛选</button>
          <button type="button" onClick={() => setShowMobileMenu(false)} className="min-h-11 rounded-xl bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700">查看结果</button>
        </div>}>
        <p className="mb-4 text-sm text-gray-500">选择标签筛选记录，再次点击已选标签可取消筛选。</p>
        <button type="button" onClick={() => setSelectedTags([])} aria-pressed={selectedTags.length === 0}
          className={`mb-2 flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-sm ${selectedTags.length === 0 ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'}`}>
          <span>全部标签</span><span>{totalCount}</span>
        </button>
        {tags.length === 0 ? <p className="py-4 text-sm text-gray-500">暂无标签</p> :
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={tags.map(tag => tag.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">{tags.map(tag => <SortableTagItem key={tag.id} tag={tag}
                isSelected={selectedTags.includes(tag.id)} count={tag.bbtalkCount || 0} onClick={() => toggleTag(tag.id)} />)}</div>
            </SortableContext>
          </DndContext>}
      </Modal>

    </div>
  )
}


