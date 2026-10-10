import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { bbtalkApi } from '../services/api/bbtalkApi'
import type { BBTalk } from '../types'
import BBTalkItem from '../components/BBTalkItem'
import ImagePreview from '../components/ImagePreview'
import { getCurrentUser } from '../services/auth'
import WorkspaceSidebar from '../components/layout/WorkspaceSidebar'

export default function BBTalkDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [bbtalk, setBBTalk] = useState<BBTalk | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string; images?: { src: string; alt: string }[] } | null>(null)
  const [readOnly, setReadOnly] = useState(!getCurrentUser())
  const [copyTip, setCopyTip] = useState(false)
  const currentUser = getCurrentUser()
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    const loadBBTalk = async () => {
      if (!id) {
        setError('无效的 BBTalk ID')
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)
        setError(null)
        // 已登录时优先尝试获取完整详情接口，否则调用公开详情接口
        let data: BBTalk
        if (currentUser) {
          try {
            data = await bbtalkApi.getBBTalk(id)
            if (active) setReadOnly(false)
          } catch (error: any) {
            if (![401, 403, 404].includes(error.status)) throw error
            data = await bbtalkApi.getPublicBBTalk(id)
            if (active) setReadOnly(true)
          }
        } else {
          data = await bbtalkApi.getPublicBBTalk(id)
        }
        if (active) setBBTalk(data)
      } catch (err: any) {
        console.error('加载 BBTalk 失败:', err)
        if (active) setError(err.message || '加载失败，请检查网络后重试')
      } finally {
        if (active) setIsLoading(false)
      }
    }

    loadBBTalk()
    return () => { active = false }
  }, [id, currentUser, attempt])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">加载中...</p>
        </div>
      </div>
    )
  }

  if (error || !bbtalk) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">暂时无法打开记录</h2>
          <p role="alert" className="text-gray-500 text-sm mb-6">{error || '该记录可能已被删除、设为私密或需要登录查看'}</p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => setAttempt(v => v + 1)} className="min-h-[44px] px-4 text-sm text-blue-700 rounded-xl bg-blue-50">重新加载</button>
            <Link
              to={currentUser ? '/' : '/public'}
              className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
            >
              返回首页
            </Link>
            {!currentUser && (
              <Link
                to={`/login?next=/detail/${id}`}
                className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors"
              >
                前往登录
              </Link>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-page workspace-layout">
      <WorkspaceSidebar active="/" isPublic={!currentUser} />
      <main className="settings-content">
        {/* 返回头部导航 */}
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={() => {
              if (window.history.length > 1) {
                navigate(-1)
              } else {
                navigate(currentUser ? '/' : '/public')
              }
            }}
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            返回
          </button>

          <Link
            to={currentUser ? '/' : '/public'}
            className="text-xs text-blue-600 hover:underline"
          >
            查看全部记录
          </Link>
        </div>

        {/* 完整的碎碎念卡片 */}
        <BBTalkItem
          bbtalk={bbtalk}
          isPublic={readOnly}
          onPreviewImage={setPreviewImage}
          onShareSuccess={() => {
            setCopyTip(true)
            setTimeout(() => setCopyTip(false), 2000)
          }}
        />

        {/* 复制成功浮动提示 */}
        {copyTip && (
          <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 animate-fade-in">
            <div className="bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="font-medium text-sm">链接已复制</span>
            </div>
          </div>
        )}

        {/* 图片预览 */}
        {previewImage && (
          <ImagePreview
            src={previewImage.src}
            alt={previewImage.alt}
            images={previewImage.images}
            onClose={() => setPreviewImage(null)}
          />
        )}
      </main>
    </div>
  )
}
