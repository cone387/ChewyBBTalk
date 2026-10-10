// Static-only builds retain their Vite values; deployed instances receive this
// allowlist from the backend before the application module executes.
const defaults = {
  VITE_API_BASE_URL: () => import.meta.env.VITE_API_BASE_URL || '',
  VITE_SITE_NAME: () => import.meta.env.VITE_SITE_NAME || 'BBTalk',
  VITE_SITE_COPYRIGHT: () => import.meta.env.VITE_SITE_COPYRIGHT || '',
  VITE_PRIVACY_TIMEOUT_MINUTES: () => import.meta.env.VITE_PRIVACY_TIMEOUT_MINUTES || '5',
  VITE_SHOW_PRIVACY_COUNTDOWN: () => import.meta.env.VITE_SHOW_PRIVACY_COUNTDOWN || 'false',
  VITE_MEDIA_URL_PROTOCOL: () => import.meta.env.VITE_MEDIA_URL_PROTOCOL || '',
}

export type PublicSetting = keyof typeof defaults

declare global {
  interface Window {
    __BBTALK_CONFIG__?: Partial<Record<PublicSetting, string>>
  }
}

export function getPublicSetting(key: PublicSetting): string {
  const runtime = window.__BBTALK_CONFIG__?.[key]
  return typeof runtime === 'string' ? runtime : defaults[key]()
}
