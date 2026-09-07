import { useCallback, useEffect, useRef, useState } from 'react'
import { readDraft, writeDraft, type DraftData } from '../services/drafts'

export function draftFingerprint(data: DraftData) {
  return JSON.stringify({ ...data, uploads: data.uploads.map(({ id: _id, file, ...item }) => ({
    ...item, file: [file.name, file.size, file.type, file.lastModified],
  })) })
}

// The owning editor is keyed by identity, so each mounted hook has one scope.
export function usePersistentDraft(key: string | null, data: DraftData, restore: (data: DraftData) => void) {
  const [loaded, setLoaded] = useState(false)
  const [status, setStatus] = useState('正在读取草稿…')
  const [error, setError] = useState(false)
  const [recovered, setRecovered] = useState(false)
  const revision = useRef<string | null>(null)
  const latest = useRef(data)
  const saved = useRef('')
  const ready = useRef(false)
  const mounted = useRef(false)
  const suppress = useRef(false)
  const clearing = useRef(false)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const restoreRef = useRef(restore)
  restoreRef.current = restore
  latest.current = data

  const report = useCallback((message: string, failed = false) => {
    if (mounted.current) { setStatus(message); setError(failed) }
  }, [])

  const flush = useCallback(function flushLatest(): Promise<unknown> {
    if (!key || !ready.current || suppress.current || clearing.current) return queue.current
    const snapshot = latest.current
    const fingerprint = draftFingerprint(snapshot)
    if (fingerprint === saved.current) return queue.current
    report('正在保存草稿…')
    const work = queue.current.then(async () => {
      if (fingerprint === saved.current) return
      const record = await writeDraft(key, snapshot, revision.current)
      revision.current = record.revision
      saved.current = fingerprint
      report(fingerprint === draftFingerprint(latest.current) ? '草稿已保存到此浏览器' : '草稿待保存…')
      // Input may have returned to the old saved value while this write was
      // in flight. Reconcile it even when that render did not start a timer.
      if (fingerprint !== draftFingerprint(latest.current)) void flushLatest()
    })
    queue.current = work.catch(reason => report(reason instanceof Error ? reason.message : '草稿保存失败，请保留当前页面后重试', true))
    return queue.current
  }, [key, report])

  useEffect(() => {
    mounted.current = true
    let cancelled = false
    void (async () => {
      try {
        const record = key ? await readDraft(key) : undefined
        if (cancelled) return
        revision.current = record?.revision ?? null
        if (record?.data) {
          latest.current = record.data
          restoreRef.current(record.data)
          setRecovered(true)
        }
        saved.current = draftFingerprint(latest.current)
        ready.current = true
        setLoaded(true)
        report(key ? (record?.data ? '草稿已保存到此浏览器' : '输入后自动保存草稿') : '登录后可保存草稿')
      } catch {
        if (!cancelled) {
          // Editing remains available, but saving stays disabled until a read
          // succeeds; otherwise an unknown stored revision could be overwritten.
          setLoaded(true)
          report('无法读取草稿，请保留当前输入并刷新后重试', true)
        }
      }
    })()
    return () => { cancelled = true; void flush(); mounted.current = false }
  }, [key, flush, report])

  useEffect(() => {
    if (!loaded || !ready.current) return
    if (suppress.current) {
      suppress.current = false
      saved.current = draftFingerprint(data)
      return
    }
    if (draftFingerprint(data) === saved.current) return
    report('草稿待保存…')
    const timer = window.setTimeout(() => { void flush() }, 300)
    return () => window.clearTimeout(timer)
  }, [data, loaded, flush, report])

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!suppress.current && (error || (ready.current && draftFingerprint(latest.current) !== saved.current))) {
        void flush()
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [error, flush])

  const clear = useCallback(async () => {
    suppress.current = true
    clearing.current = true
    const work = queue.current.then(async () => {
      if (key) {
        if (!ready.current) throw new Error('草稿尚未成功读取，无法安全清除，请刷新后重试')
        const record = await writeDraft(key, null, revision.current)
        revision.current = record.revision
      }
      report('草稿已清除')
      suppress.current = true
      if (mounted.current) setRecovered(false)
    })
    queue.current = work.catch(reason => {
      suppress.current = false
      report(reason instanceof Error ? reason.message : '草稿清除失败', true)
    })
    try { await work } finally { clearing.current = false }
  }, [key, report])

  const verifyCurrent = async () => {
    await flush()
    if (!key || !ready.current) throw new Error('草稿未能持久保存，请保留页面并重试')
    const record = await readDraft(key)
    if ((record?.revision ?? null) !== revision.current || saved.current !== draftFingerprint(latest.current)) {
      throw new Error('草稿保存失败或已被另一标签页修改，请核对后再发布')
    }
    return revision.current
  }
  return { loaded, status, error, recovered, canRetry: ready.current, retry: flush, clear, verifyCurrent }
}
