import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import LandingPage from '../src/pages/LandingPage'

afterEach(cleanup)

it('distinguishes available clients and explains voice, offline and hosting limits', () => {
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><LandingPage /></MemoryRouter>)
  expect(screen.getByRole('img', { name: 'BBTalk 移动端记录界面示意' })).toBeTruthy()
  expect(screen.getByRole('heading', { level: 1 }).querySelector('.text-gradient')?.textContent).toBe('私人碎碎念')
  expect(document.querySelector('.landing-root .glass')).toBeTruthy()
  expect(document.querySelector('.landing-root .grid-bg .anim-float')).toBeTruthy()
  expect(screen.getByRole('link', { name: '查看 Windows 安装包' }).getAttribute('href')).toBe('https://github.com/cone387/ChewyBBTalk/releases/tag/desktop-stable')
  expect(screen.getByText(/TestFlight 内测/)).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Android 构建说明' })).toBeTruthy()
  expect(screen.getByText(/Web 支持上传和播放音频附件，暂不提供内置录音/)).toBeTruthy()
  expect(screen.getByText(/服务器、域名与存储费用/)).toBeTruthy()
  expect(screen.getByRole('link', { name: '隐私政策' }).getAttribute('href')).toBe('/privacy-policy/')
  expect(screen.queryByText('永久免费')).toBeNull()
})

it('keeps application links inside the deployment basename and restores the app title on exit', () => {
  document.title = 'My BBTalk'
  render(<MemoryRouter basename="/notes" initialEntries={['/notes/about']}
    future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes>
      <Route path="/about" element={<LandingPage />} />
      <Route path="/app" element={<div>Application</div>} />
    </Routes>
  </MemoryRouter>)
  expect(document.title).toBe('BBTalk · 你的私人碎碎念')
  const entry = screen.getByRole('link', { name: '立即开始', exact: true })
  expect(entry.getAttribute('href')).toBe('/notes/app')
  fireEvent.click(entry)
  expect(screen.getByText('Application')).toBeTruthy()
  expect(document.title).toBe('My BBTalk')
})
