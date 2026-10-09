import React, { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Modal from '../src/components/ui/Modal'
import Select from '../src/components/ui/Select'
import Input from '../src/components/ui/Input'

afterEach(cleanup)

it('associates shared input labels, help and validation errors with the field', async () => {
  const user = userEvent.setup()
  const { rerender } = render(<><p id="help">用于登录</p><Input label="账户" aria-describedby="help" error="请输入账户" /></>)
  const input = screen.getByLabelText('账户') as HTMLInputElement
  await user.click(screen.getByText('账户'))
  expect(document.activeElement).toBe(input)
  expect(input.getAttribute('aria-invalid')).toBe('true')
  const error = screen.getByText('请输入账户')
  expect(input.getAttribute('aria-describedby')?.split(' ')).toEqual(['help', error.id])
  rerender(<Input id="account" label="账户" />)
  expect(screen.getByLabelText('账户').id).toBe('account')
  expect(screen.getByLabelText('账户').hasAttribute('aria-invalid')).toBe(false)
})

describe('Modal keyboard navigation', () => {
  it('contains focus, closes with Escape and restores focus without losing the body scroll setting', async () => {
    const user = userEvent.setup()
    document.body.style.overflow = 'clip'
    function Example() {
      const [open, setOpen] = useState(false)
      return <><button onClick={() => setOpen(true)}>打开</button>
        <Modal visible={open} title="编辑记录" onClose={() => setOpen(false)}>
          <input aria-label="内容" /><button>保存</button>
        </Modal></>
    }
    render(<Example />)
    const trigger = screen.getByText('打开')
    await user.click(trigger)
    const dialog = screen.getByRole('dialog', { name: '编辑记录' })
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(document.body.style.overflow).toBe('hidden')
    screen.getByText('保存').focus()
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '关闭' }))
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(screen.getByText('保存'))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(document.body.style.overflow).toBe('clip')
  })

  it('only dismisses the top modal and keeps scroll locked until all dialogs close', async () => {
    const user = userEvent.setup()
    function Nested() {
      const [inner, setInner] = useState(false)
      return <Modal visible title="父窗口" onClose={() => {}}>
        <button onClick={() => setInner(true)}>子窗口</button>
        <Modal visible={inner} title="子窗口" onClose={() => setInner(false)}><input aria-label="子内容" /></Modal>
      </Modal>
    }
    render(<Nested />)
    await user.click(screen.getByRole('button', { name: '子窗口' }))
    await user.keyboard('{Escape}')
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '子窗口' }))
  })
})

it('uses native select semantics and preserves numeric option values', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  const { rerender } = render(<Select placeholder="选择数量" options={[{ label: '全部', value: 0 }, { label: '十条', value: 10 }]} onChange={onChange} />)
  await user.selectOptions(screen.getByRole('combobox', { name: '选择数量' }), '1')
  expect(onChange).toHaveBeenCalledWith(10)
  rerender(<Select disabled placeholder="选择数量" options={[{ label: '全部', value: 0 }]} onChange={onChange} />)
  onChange.mockClear()
  await user.selectOptions(screen.getByRole('combobox'), '0')
  expect(onChange).not.toHaveBeenCalled()
})
