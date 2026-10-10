import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPublicSetting, type PublicSetting } from '../src/config'

afterEach(() => {
  delete window.__BBTALK_CONFIG__
  vi.unstubAllEnvs()
})

describe('public configuration', () => {
  it('preserves explicit empty runtime values over build defaults', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://old.example')
    window.__BBTALK_CONFIG__ = { VITE_API_BASE_URL: '', VITE_SITE_NAME: '部署名称' }
    expect(getPublicSetting('VITE_API_BASE_URL')).toBe('')
    expect(getPublicSetting('VITE_SITE_NAME')).toBe('部署名称')
  })

  it.each([
    ['VITE_API_BASE_URL', ''], ['VITE_SITE_NAME', 'BBTalk'], ['VITE_SITE_COPYRIGHT', ''],
    ['VITE_PRIVACY_TIMEOUT_MINUTES', '5'], ['VITE_SHOW_PRIVACY_COUNTDOWN', 'false'],
    ['VITE_MEDIA_URL_PROTOCOL', ''],
  ] as [PublicSetting, string][])('falls back to the build value then default for %s', (key, fallback) => {
    vi.stubEnv(key, '')
    expect(getPublicSetting(key)).toBe(fallback)
    vi.stubEnv(key, 'configured')
    expect(getPublicSetting(key)).toBe('configured')
  })
})
