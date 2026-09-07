import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import UndoToast from '../src/components/UndoToast'

afterEach(() => { cleanup(); vi.useRealTimers() })

it('does not extend the undo deadline when parent callbacks change', () => {
  vi.useFakeTimers()
  const oldDismiss = vi.fn()
  const newDismiss = vi.fn()
  const { rerender } = render(<UndoToast visible onUndo={() => {}} onDismiss={oldDismiss} />)
  act(() => { vi.advanceTimersByTime(2000) })
  rerender(<UndoToast visible onUndo={() => {}} onDismiss={newDismiss} />)
  act(() => { vi.advanceTimersByTime(1300) })
  expect(oldDismiss).not.toHaveBeenCalled()
  expect(newDismiss).toHaveBeenCalledOnce()
})

it('cancels a queued dismissal when the user undoes during the exit animation', () => {
  vi.useFakeTimers()
  const onUndo = vi.fn()
  const onDismiss = vi.fn()
  render(<UndoToast visible onUndo={onUndo} onDismiss={onDismiss} />)
  act(() => { vi.advanceTimersByTime(3000) })
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  act(() => { vi.advanceTimersByTime(300) })
  expect(onUndo).toHaveBeenCalledOnce()
  expect(onDismiss).not.toHaveBeenCalled()
})
