import { useCallback, useEffect, useRef, useState } from 'react'

export function useUndoableDelete<T>(options: {
  remove: (item: T) => void
  restore: (item: T) => void
  commit: (item: T) => Promise<void>
  onError: (error: unknown, item: T) => void
  duration?: number
}) {
  const callbacks = useRef(options)
  callbacks.current = options
  const [pending, setPending] = useState<T | null>(null)
  const pendingRef = useRef<T | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const commit = useCallback((notify = true) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const item = pendingRef.current
    pendingRef.current = null
    if (notify) setPending(null)
    if (item === null) return
    const handlers = callbacks.current
    void handlers.commit(item).catch(error => {
      handlers.restore(item)
      handlers.onError(error, item)
    })
  }, [])

  const remove = useCallback((item: T) => {
    // Only the most recent deletion is undoable; commit its predecessor first.
    commit()
    pendingRef.current = item
    setPending(item)
    callbacks.current.remove(item)
    timer.current = setTimeout(commit, callbacks.current.duration ?? 3000)
  }, [commit])

  const undo = useCallback(() => {
    const item = pendingRef.current
    if (item === null) return // The deadline has passed, even if the API is slow.
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    pendingRef.current = null
    setPending(null)
    callbacks.current.restore(item)
  }, [])

  useEffect(() => () => commit(false), [commit])
  return { pending, remove, undo, dismiss: commit }
}
