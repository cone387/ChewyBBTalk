import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => ({ next: vi.fn(), get: vi.fn(), save: vi.fn() }))
vi.mock('../src/services/api/welcomeApi', () => ({ welcomeApi: boundary }))
import WelcomeGate from '../src/components/welcome/WelcomeGate'
import WelcomeSettingsPage from '../src/pages/WelcomeSettingsPage'
import { rotateAuthSession } from '../src/services/authSessionScope'

const first = { id: 'a', text: '把脑子里的声音放在这里。', source: '我的手记' }
const second = { id: 'b', text: '今天也值得被记下来。', source: '' }
beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('bbtalk_user_info', JSON.stringify({ id: Math.random() }))
  localStorage.setItem('privacy_enabled', 'false')
  boundary.next.mockReset().mockResolvedValue({ quote: first })
  boundary.get.mockReset().mockResolvedValue({ enabled: true, quotes: [first], revision: 1 })
  boundary.save.mockReset().mockImplementation(async data => ({ ...data, revision: data.revision + 1 }))
})
afterEach(() => { cleanup(); vi.useRealTimers() })

function Nav() {
  const navigate = useNavigate()
  return <><button onClick={() => navigate('/settings')}>去设置</button><button onClick={() => navigate('/')}>回首页</button></>
}
function mountGate(path = '/') {
  return render(<StrictMode><MemoryRouter initialEntries={[path]}>
    <WelcomeGate><Nav /><Routes><Route path="/" element={<p>记录主页</p>} /><Route path="*" element={<p>深链接页面</p>} /></Routes></WelcomeGate>
  </MemoryRouter></StrictMode>)
}

it('shows one initial quote under StrictMode and does not reappear on internal navigation', async () => {
  mountGate()
  expect(await screen.findByText(first.text)).toBeTruthy()
  expect(boundary.next).toHaveBeenCalledTimes(1)
  expect(screen.queryByText('记录主页')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '进入记录' }))
  fireEvent.click(await screen.findByText('去设置'))
  fireEvent.click(screen.getByText('回首页'))
  expect(screen.getByText('记录主页')).toBeTruthy()
  expect(boundary.next).toHaveBeenCalledTimes(1)
})

it.each(['/settings/welcome', '/desktop/authorize', '/detail/abc', '/public'])('does not intercept %s', async path => {
  mountGate(path)
  expect(screen.getByText('深链接页面')).toBeTruthy()
  expect(boundary.next).not.toHaveBeenCalled()
})

it('changes the quote and preserves the current one on a network error', async () => {
  mountGate()
  await screen.findByText(first.text)
  boundary.next.mockResolvedValueOnce({ quote: second })
  fireEvent.click(screen.getByRole('button', { name: '换一句' }))
  expect(await screen.findByText(second.text)).toBeTruthy()
  boundary.next.mockRejectedValueOnce(new Error('网络中断'))
  fireEvent.click(screen.getByRole('button', { name: '换一句' }))
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(screen.getByText(second.text)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '进入记录' }))
  expect(screen.getByText('记录主页')).toBeTruthy()
})

it.each(['empty', 'failure'])('allows entry for %s selection', async mode => {
  if (mode === 'empty') boundary.next.mockResolvedValue({ quote: null })
  else boundary.next.mockRejectedValue(new Error('offline'))
  mountGate()
  expect(await screen.findByText('记录主页')).toBeTruthy()
})

it('skips a stalled request after five seconds and ignores its late response', async () => {
  vi.useFakeTimers()
  let finish!: (value: { quote: typeof first }) => void
  boundary.next.mockReturnValue(new Promise(resolve => { finish = resolve }))
  mountGate()
  await act(async () => { vi.advanceTimersByTime(5000) })
  expect(screen.getByText('记录主页')).toBeTruthy()
  await act(async () => finish({ quote: first }))
  expect(screen.queryByText(first.text)).toBeNull()
})

it('discards a previous account response when the session changes', async () => {
  let finish!: (value: { quote: typeof first }) => void
  boundary.next.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  mountGate()
  boundary.next.mockResolvedValueOnce({ quote: second })
  act(() => {
    localStorage.setItem('bbtalk_user_info', JSON.stringify({ id: 'another-account' }))
    rotateAuthSession()
  })
  expect(await screen.findByText(second.text)).toBeTruthy()
  await act(async () => finish({ quote: first }))
  expect(screen.queryByText(first.text)).toBeNull()
})

it('clears the previous account editor and pool on session change', async () => {
  render(<MemoryRouter><WelcomeSettingsPage /></MemoryRouter>)
  await screen.findByText(first.text)
  fireEvent.change(screen.getByLabelText('文案内容'), { target: { value: '未保存的私密草稿' } })
  boundary.get.mockResolvedValueOnce({ enabled: false, quotes: [], revision: 0 })
  act(() => {
    localStorage.setItem('bbtalk_user_info', JSON.stringify({ id: 'another-account' }))
    rotateAuthSession()
  })
  expect(await screen.findByText('扉页，等你落笔。')).toBeTruthy()
  expect(screen.queryByText(first.text)).toBeNull()
  expect((screen.getByLabelText('文案内容') as HTMLTextAreaElement).value).toBe('')
})

it('creates, edits, previews, disables and deletes personal quotes', async () => {
  render(<MemoryRouter><WelcomeSettingsPage /></MemoryRouter>)
  await screen.findByText(first.text)
  fireEvent.change(screen.getByLabelText('文案内容'), { target: { value: second.text } })
  fireEvent.click(screen.getByRole('button', { name: '添加文案' }))
  expect(await screen.findByText(second.text)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: `编辑：${second.text}` }))
  fireEvent.change(screen.getByLabelText('文案内容'), { target: { value: '修改后的一句话' } })
  fireEvent.click(screen.getByRole('button', { name: '保存修改' }))
  expect(await screen.findByText('修改后的一句话')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: `预览：${first.text}` }))
  expect(screen.getByRole('button', { name: '返回文案设置' })).toBeTruthy()
  expect(boundary.next).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '返回文案设置' }))
  fireEvent.click(screen.getByRole('checkbox', { name: '开启文案欢迎页' }))
  await waitFor(() => expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: '删除：修改后的一句话' }))
  fireEvent.click(await screen.findByRole('button', { name: '确认删除' }))
  await waitFor(() => expect(screen.queryByText('修改后的一句话')).toBeNull())
})

it('keeps a draft when saving conflicts and allows reloading without dropping it', async () => {
  boundary.save.mockRejectedValue(Object.assign(new Error('文案池已在其他页面更新'), { status: 409 }))
  render(<MemoryRouter><WelcomeSettingsPage /></MemoryRouter>)
  await screen.findByText(first.text)
  fireEvent.change(screen.getByLabelText('文案内容'), { target: { value: second.text } })
  fireEvent.click(screen.getByRole('button', { name: '添加文案' }))
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect((screen.getByLabelText('文案内容') as HTMLTextAreaElement).value).toBe(second.text)
  fireEvent.click(screen.getByRole('button', { name: '重新载入文案池' }))
  await waitFor(() => expect(boundary.get).toHaveBeenCalledTimes(2))
  expect((screen.getByLabelText('文案内容') as HTMLTextAreaElement).value).toBe(second.text)
})
