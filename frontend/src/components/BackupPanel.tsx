import { useCallback, useEffect, useRef, useState } from 'react'
import { backupApi, type BackupList } from '../services/api/backupApi'
import Button from './ui/Button'

export default function BackupPanel() {
  const [data, setData] = useState<BackupList | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(false)
  const requestId = useRef(0)
  const refresh = useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    try {
      const result = await backupApi.list()
      if (mounted.current && id === requestId.current) { setData(result); setError(null) }
    } catch (reason) {
      if (mounted.current && id === requestId.current) setError(reason instanceof Error ? reason.message : '无法加载备份，请重试')
    } finally {
      if (mounted.current && id === requestId.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    void refresh()
    return () => { mounted.current = false; requestId.current++ }
  }, [refresh])
  useEffect(() => {
    if (data?.latest?.status !== 'running' && !creating) return
    const timer = window.setInterval(() => { void refresh() }, 3000)
    return () => window.clearInterval(timer)
  }, [data?.latest?.status, creating, refresh])

  const create = async () => {
    if (creating) return
    setCreating(true)
    setError(null)
    try {
      const result = await backupApi.create()
      if (mounted.current) { requestId.current++; setData(result); setLoading(false) }
    } catch (reason) {
      if (mounted.current) {
        await refresh()
        if (mounted.current) setError(`${reason instanceof Error ? reason.message : '创建请求未完成'}。请核对下方状态；网络中断不代表服务器已停止备份。`)
      }
    } finally { if (mounted.current) setCreating(false) }
  }

  const download = async (filename: string) => {
    setDownloading(filename)
    setError(null)
    try {
      const blob = await backupApi.download(filename)
      if (!mounted.current) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : '下载失败，请重试')
    } finally { if (mounted.current) setDownloading(null) }
  }

  const failed = ['failed', 'interrupted', 'unknown'].includes(data?.latest?.status ?? '')
  return <section aria-labelledby="backup-heading" className="rounded-2xl border border-gray-100 bg-white p-6 shadow-lg">
    <h2 id="backup-heading" className="text-lg font-semibold text-gray-900">服务器备份</h2>
    <p className="mt-2 text-sm leading-relaxed text-gray-600">创建包含正文、标签、评论和附件的备份，保留最近 7 份。备份与服务在同一台服务器，建议下载后另存一份。</p>
    <div className="my-4 flex flex-wrap gap-3">
      <Button className="min-h-[44px]" loading={creating} disabled={data?.latest?.status === 'running' || !data} onClick={() => { void create() }}>{creating ? '正在创建备份…' : '创建完整备份'}</Button>
      <Button className="min-h-[44px]" variant="secondary" loading={loading} onClick={() => { void refresh() }}>刷新备份状态</Button>
    </div>
    {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
    {data?.latest && <p role={failed ? 'alert' : 'status'} className={`mb-3 rounded-lg p-3 text-sm ${failed ? 'bg-amber-50 text-amber-900' : 'bg-blue-50 text-blue-900'}`}>
      {data.latest.status === 'running' ? '服务器正在创建备份，可稍后回来查看。' : data.latest.message}
      {data.latest.finished_at && <span className="mt-1 block text-xs">{new Date(data.latest.finished_at).toLocaleString('zh-CN', { hour12: false })}</span>}
    </p>}
    {data && data.items.length === 0 && <p className="py-4 text-sm text-gray-500">暂无服务器备份</p>}
    <ul className="divide-y divide-gray-100">
      {data?.items.map(item => <li key={item.filename} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="min-w-0 flex-1 basis-40">
          <p title={item.filename} className="text-sm font-medium text-gray-800">{new Date(item.created_at).toLocaleString('zh-CN', { hour12: false })}</p>
          <p className="mt-1 text-xs text-gray-500">ZIP · {(item.size / 1024).toFixed(1)} KB</p>
        </div>
        <Button className="min-h-[44px]" variant="secondary" disabled={downloading !== null} loading={downloading === item.filename} aria-label={`下载备份 ${item.filename}`} onClick={() => { void download(item.filename) }}>下载</Button>
      </li>)}
    </ul>
    {Boolean(data?.items.length) && <p className="mt-3 text-xs leading-relaxed text-gray-500">下载的 ZIP 可通过下方“导入数据”恢复。列表包含历史文件；导入前会校验支持完整性清单的备份。</p>}
  </section>
}
