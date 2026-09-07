import { useRef, useState } from 'react'
import Modal from '../components/ui/Modal'

type Failure = { message: string; retry?: () => Promise<unknown> }
type Confirmation = { title: string; message: string; action: () => Promise<unknown>; confirmLabel?: string }
function readable(message: string) {
  return message.replace(/Failed to fetch|NetworkError when attempting to fetch resource\.?|Load failed/gi, '网络连接失败，请检查网络后重试')
}
export function useActionFeedback() {
  const [failure, setFailure] = useState<Failure | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const generation = useRef(0)
  const report = (message: string, retry?: Failure['retry']) => {
    generation.current += 1
    setFailure({ message: readable(message), retry })
  }
  const confirm = (value: Confirmation) => {
    if (busyRef.current) return
    generation.current += 1
    setFailure(null)
    setConfirmation(value)
  }
  const run = async (action: () => Promise<unknown>, close: boolean) => {
    if (busyRef.current) return
    const version = generation.current
    busyRef.current = true; setBusy(true)
    try {
      await action()
      if (version === generation.current) {
        setFailure(null)
        if (close) setConfirmation(null)
      }
    } catch (error) {
      if (version === generation.current) setFailure({
        message: readable(error instanceof Error ? error.message : typeof error === 'string' ? error : '操作失败，请重试'),
        retry: action,
      })
    } finally { busyRef.current = false; setBusy(false) }
  }
  const dismiss = () => {
    if (busyRef.current) return
    generation.current += 1
    setConfirmation(null); setFailure(null)
  }
  const errorPanel = failure && <div role="alert" className="my-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
    <p className="break-words">{failure.message}</p>
    {!confirmation && <div className="mt-2 flex gap-2">
      {failure.retry && <button type="button" disabled={busy} className="min-h-[44px] rounded border border-red-300 px-3 disabled:opacity-50" onClick={() => { void run(failure.retry!, false) }}>{busy ? '正在重试…' : '重试操作'}</button>}
      <button type="button" disabled={busy} className="min-h-[44px] px-3" onClick={dismiss}>关闭提示</button>
    </div>}
  </div>
  return {
    report, confirm, dismiss,
    feedback: <>
      {!confirmation && errorPanel}
      <Modal visible={Boolean(confirmation)} title={confirmation?.title} onClose={dismiss}>
        <p className="whitespace-pre-wrap break-words text-sm text-gray-700">{confirmation?.message}</p>
        {errorPanel}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" disabled={busy} className="min-h-[44px] px-4" onClick={dismiss}>取消</button>
          <button type="button" disabled={busy} className="min-h-[44px] rounded bg-red-600 px-4 text-white disabled:opacity-50" onClick={() => { if (confirmation) void run(confirmation.action, true) }}>{busy ? '处理中…' : failure ? '重试操作' : confirmation?.confirmLabel ?? '确认'}</button>
        </div>
      </Modal>
    </>,
  }
}
