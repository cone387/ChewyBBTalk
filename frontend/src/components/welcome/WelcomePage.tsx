import { useEffect, useRef } from 'react'
import { Navigate } from 'react-router-dom'
import type { WelcomeQuote } from '../../services/api/welcomeApi'
import { usePrivacyMode } from '../../hooks/usePrivacyMode'
import { usePrivacyEnabled } from '../../hooks/usePrivacyEnabled'
import { getPublicSetting } from '../../config'
import Button from '../ui/Button'
import Icon from '../ui/Icon'
import './welcome.css'

export default function WelcomePage({ quote, onEnter, onNext, onSettings, busy = false, error, preview = false }: {
  quote: WelcomeQuote; onEnter: () => void; onNext?: () => void; onSettings?: () => void;
  busy?: boolean; error?: string; preview?: boolean
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  const [privacyEnabled] = usePrivacyEnabled()
  const minutes = Number(localStorage.getItem('privacy_timeout_minutes') || getPublicSetting('VITE_PRIVACY_TIMEOUT_MINUTES') || 5)
  const { isPrivacyMode } = usePrivacyMode({ enabled: privacyEnabled,
    timeout: (Number.isFinite(minutes) && minutes > 0 ? minutes : 5) * 60_000 })
  useEffect(() => { heading.current?.focus() }, [])
  if (isPrivacyMode) return <Navigate to="/locked" replace />
  const date = new Date()
  return <main className="welcome-page" aria-label={preview ? '文案欢迎页预览' : '文案欢迎页'}>
    <div className="welcome-scenery" aria-hidden="true">
      <div className="welcome-sun" />
      <div className="welcome-orbit" />
      <svg className="welcome-hills" viewBox="0 0 800 440" preserveAspectRatio="none" focusable="false">
        <path className="welcome-hill-far" d="M0 180C140 55 230 275 420 140S690 70 800 130V440H0Z" />
        <path className="welcome-hill-middle" d="M0 270C180 330 255 160 460 235S680 340 800 200V440H0Z" />
        <path className="welcome-hill-near" d="M0 380C180 260 360 410 530 330S720 300 800 360V440H0Z" />
        <path className="welcome-hill-line" d="M-20 365C180 245 360 395 530 315S720 285 820 350" />
      </svg>
      <span className="welcome-spark welcome-spark-one">✦</span>
      <span className="welcome-spark welcome-spark-two">✦</span>
    </div>
    <header className="welcome-top">
      <span className="welcome-brand"><span className="welcome-brand-mark" aria-hidden="true">bb</span>BBTalk</span>
      <span className="welcome-date">{preview ? '扉页预览' : <><span>{date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}</span><span>{date.toLocaleDateString('zh-CN', { weekday: 'long' })}</span></>}</span>
    </header>
    <div className="welcome-reading">
      <div className="welcome-postcard">
        <h1 className="welcome-title" ref={heading} tabIndex={-1}><span className="welcome-title-dot" aria-hidden="true" />写在今天之前</h1>
        <span className="welcome-quote-mark" aria-hidden="true">“</span>
        <figure className="welcome-quote" aria-live="polite" aria-atomic="true">
          <blockquote className={quote.text.length > 160 ? 'welcome-long-quote' : undefined}>{quote.text}</blockquote>
          {quote.source && <figcaption><span aria-hidden="true" />{quote.source}</figcaption>}
        </figure>
        <div className="welcome-card-colors" aria-hidden="true"><i /><i /><i /></div>
      </div>
      {error && <p className="welcome-error" role="alert">{error}</p>}
      <div className="welcome-actions">
        <Button size="large" onClick={onEnter}>{preview ? '返回文案设置' : '进入记录'}<Icon><path d="M5 12h14m-5-5 5 5-5 5" /></Icon></Button>
        {onNext && <Button variant="ghost" onClick={onNext} loading={busy} icon={<Icon><path d="M20 7v5h-5M4 17v-5h5M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 18 17" /></Icon>}>换一句</Button>}
      </div>
    </div>
    <footer className="welcome-bottom">
      <p>留一句话，给此刻的自己。</p>
      {onSettings && <button type="button" onClick={onSettings}><Icon name="edit" size={14} />管理我的文案</button>}
    </footer>
  </main>
}
