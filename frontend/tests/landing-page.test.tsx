import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import LandingPage from '../src/pages/LandingPage'

afterEach(cleanup)

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
