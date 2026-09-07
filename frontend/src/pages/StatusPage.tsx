import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiClient } from '../services/api/apiClient'

interface Check { status: string; message: string }
interface RuntimeStatus {
  checked_at: string
  service: Check
  storage: Check & { mode: string }
  backup: Check & { count?: number; latest_completed_at?: string | null; latest_size?: number | null }
  diagnostics?: { database: Check; attachment_disk: Check & { total_bytes?: number; free_bytes?: number } }
}
const labels: Record<string, string> = { ok: '正常', error: '检查失败', unknown: '待核对', success: '已完成', failed: '失败', running: '进行中', interrupted: '已中断', none: '尚未备份' }
const modes: Record<string, string> = { server: '服务器存储', s3: '个人 S3 存储', server_s3: '服务器 S3 存储', unknown: '未能读取存储配置' }
function size(bytes: number) { return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024) + ' MB' }
function CheckCard({ title, check, children }: { title: string; check: Check; children?: React.ReactNode }) {
  const healthy = check.status === 'ok' || check.status === 'success'
  return <section className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <span className={`rounded-full px-3 py-1 text-sm font-medium ${healthy ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-900'}`}>{labels[check.status] || '待核对'}</span>
    </div>
    <p className="text-sm leading-6 text-gray-700">{check.message}</p>
    {children}
  </section>
}
export default function StatusPage() {
  const [data, setData] = useState<RuntimeStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)
  const refresh = useCallback(async () => {
    const id = ++generation.current
    setLoading(true)
    setError(null)
    try {
      const result = await apiClient.get<RuntimeStatus>('/api/v1/bbtalk/settings/status/')
      if (id === generation.current) setData(result)
    } catch {
      if (id === generation.current) setError('无法获取运行状态，请检查网络后重试。')
    } finally { if (id === generation.current) setLoading(false) }
  }, [])
  useEffect(() => { void refresh(); return () => { generation.current++ } }, [refresh])
  return <div className="min-h-screen bg-gray-50">
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3">
        <Link to="/settings" className="inline-flex min-h-11 items-center text-sm text-blue-700 underline">返回设置</Link>
        <h1 className="text-xl font-semibold text-gray-900">运行状态</h1>
      </div>
    </header>
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-6" aria-busy={loading}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm leading-6 text-gray-600">
          <p>查看当前账号的存储与最近备份情况。</p>
          {data && <p>检查时间：{new Date(data.checked_at).toLocaleString('zh-CN')}{error ? '（上次结果）' : ''}</p>}
        </div>
        <button type="button" disabled={loading} onClick={() => void refresh()} className="min-h-11 rounded-xl bg-blue-600 px-4 font-medium text-white hover:bg-blue-700 disabled:opacity-60">{loading ? '正在检查…' : '重新检查'}</button>
      </div>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
      {loading && !data && <p role="status" className="py-6 text-gray-600">正在检查服务、存储和备份…</p>}
      {data && <>
        <CheckCard title="服务连接" check={data.service} />
        <CheckCard title="当前存储" check={data.storage}>
          <p className="text-sm text-gray-600">{modes[data.storage.mode] || '未识别存储类型'}</p>
          <Link to="/settings/storage" className="inline-flex min-h-11 items-center text-sm text-blue-700 underline">管理存储</Link>
        </CheckCard>
        <CheckCard title="最近备份" check={data.backup}>
          {data.backup.count !== undefined && <p className="text-sm text-gray-600">可用备份：{data.backup.count} 份</p>}
          {data.backup.latest_completed_at && <p className="text-sm leading-6 text-gray-600">最近可用备份：{new Date(data.backup.latest_completed_at).toLocaleString('zh-CN')} · {size(data.backup.latest_size || 0)}</p>}
          <Link to="/settings/data" className="inline-flex min-h-11 items-center text-sm text-blue-700 underline">管理与创建备份</Link>
        </CheckCard>
        {data.diagnostics && <div className="space-y-4 border-t border-gray-200 pt-5">
          <h2 className="text-lg font-semibold text-gray-900">管理员诊断</h2>
          <CheckCard title="数据库" check={data.diagnostics.database} />
          <CheckCard title="服务器磁盘" check={data.diagnostics.attachment_disk}>
            {data.diagnostics.attachment_disk.free_bytes !== undefined && <p className="text-sm text-gray-600">剩余 {size(data.diagnostics.attachment_disk.free_bytes)} / 共 {size(data.diagnostics.attachment_disk.total_bytes || 0)}</p>}
          </CheckCard>
        </div>}
      </>}
    </main>
  </div>
}
