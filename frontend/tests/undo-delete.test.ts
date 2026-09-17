import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useUndoableDelete } from '../src/hooks/useUndoableDelete'

afterEach(() => { cleanup(); vi.useRealTimers() })

it('commits the previous deletion when another is started and undoes only the latest', async () => {
  vi.useFakeTimers()
  const commit = vi.fn(async (_id: string) => {})
  const restore = vi.fn()
  const { result } = renderHook(() => useUndoableDelete({ remove: vi.fn(), restore, commit, onError: vi.fn() }))
  act(() => { result.current.remove('first') })
  act(() => { vi.advanceTimersByTime(1000); result.current.remove('second') })
  expect(commit.mock.calls).toEqual([['first']])
  act(() => { result.current.undo(); vi.advanceTimersByTime(5000) })
  expect(restore.mock.calls).toEqual([['second']])
  expect(commit).toHaveBeenCalledTimes(1)
})

it('closes the undo window before an outstanding delete request completes', async () => {
  vi.useFakeTimers()
  let reject!: (error: Error) => void
  const restore = vi.fn()
  const onError = vi.fn()
  const { result } = renderHook(() => useUndoableDelete<string>({
    remove: vi.fn(), restore, onError, commit: () => new Promise((_, fail) => { reject = fail }),
  }))
  act(() => { result.current.remove('record'); vi.advanceTimersByTime(3000) })
  expect(result.current.pending).toBeNull()
  act(() => { result.current.undo() })
  expect(restore).not.toHaveBeenCalled()
  await act(async () => { reject(new Error('offline')) })
  expect(restore).toHaveBeenCalledWith('record')
  expect(onError).toHaveBeenCalledOnce()
})
