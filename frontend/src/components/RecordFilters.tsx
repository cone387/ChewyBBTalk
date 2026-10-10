export interface RecordFilterValues {
  visibility: string
  attachments: string
  from: string
  to: string
  ordering: string
}

export const defaultRecordFilters: RecordFilterValues = {
  visibility: '', attachments: '', from: '', to: '', ordering: '-update_time',
}

export default function RecordFilters({ value, onChange, isPublic }: {
  value: RecordFilterValues
  onChange: (value: RecordFilterValues) => void
  isPublic: boolean
}) {
  const field = 'mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white p-2 text-base'
  const set = (key: keyof RecordFilterValues, next: string) => onChange({ ...value, [key]: next })
  return <div className="mb-5 grid grid-cols-1 gap-3 text-sm text-gray-700 sm:grid-cols-2">
    {!isPublic && <label>可见性<select aria-label="可见性筛选" className={field} value={value.visibility} onChange={e => set('visibility', e.target.value)}>
      <option value="">全部</option><option value="public">公开</option><option value="private">私密</option>
    </select></label>}
    <label>附件<select aria-label="附件筛选" className={field} value={value.attachments} onChange={e => set('attachments', e.target.value)}>
      <option value="">全部</option><option value="true">有附件</option><option value="false">无附件</option>
    </select></label>
    <label>开始日期<input aria-label="开始日期" type="date" max={value.to || undefined} className={field} value={value.from} onChange={e => set('from', e.target.value)} /></label>
    <label>结束日期<input aria-label="结束日期" type="date" min={value.from || undefined} className={field} value={value.to} onChange={e => set('to', e.target.value)} /></label>
    {value.from && value.to && value.from > value.to && <p role="alert" className="text-red-700 sm:col-span-2">开始日期不能晚于结束日期</p>}
    <label className="sm:col-span-2">排序<select aria-label="记录排序" className={field} value={value.ordering} onChange={e => set('ordering', e.target.value)}>
      <option value="-update_time">更新时间：从新到旧</option><option value="update_time">更新时间：从旧到新</option>
      <option value="-create_time">创建时间：从新到旧</option><option value="create_time">创建时间：从旧到新</option>
    </select></label>
  </div>
}
