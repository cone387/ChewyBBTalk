import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useActionFeedback } from '../src/hooks/useActionFeedback'
afterEach(cleanup)
function Harness({ action }: { action: () => Promise<unknown> }) {
  const feedback = useActionFeedback()
  return <><button onClick={() => feedback.confirm({ title: '删除评论', message: '评论原文', action, confirmLabel: '确认删除' })}>删除</button>{feedback.feedback}</>
}
it('cancel and Escape do not perform the action and restore keyboard focus', async () => {
  const action = vi.fn().mockResolvedValue(undefined)
  const user = userEvent.setup()
  render(<Harness action={action} />)
  const trigger = screen.getByRole('button', { name: '删除', exact: true })
  await user.click(trigger)
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(trigger)
  await user.click(trigger)
  await user.click(screen.getByRole('button', { name: '取消' }))
  expect(action).not.toHaveBeenCalled()
})
it('keeps failed confirmation and original context available for an explicit retry', async () => {
  const action = vi.fn().mockRejectedValueOnce(new Error('网络故障')).mockResolvedValueOnce(undefined)
  const user = userEvent.setup()
  render(<Harness action={action} />)
  await user.click(screen.getByRole('button', { name: '删除', exact: true }))
  await user.click(screen.getByRole('button', { name: '确认删除' }))
  expect(screen.getByRole('alert').textContent).toContain('网络故障')
  expect(screen.getByRole('dialog').textContent).toContain('评论原文')
  await user.click(screen.getByRole('button', { name: '重试操作' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(action).toHaveBeenCalledTimes(2)
})
