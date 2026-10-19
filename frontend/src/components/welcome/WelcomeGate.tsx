import { useEffect, useState, useSyncExternalStore, useRef, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getAuthSessionScope, subscribeAuthSession } from '../../services/authSessionScope'
import { welcomeApi, type WelcomeQuote } from '../../services/api/welcomeApi'
import WelcomePage from './WelcomePage'
import Button from '../ui/Button'

// Memory only: a document reload is a new opening, route remounts are not.
let opening: { scope: string; done: boolean; request?: ReturnType<typeof welcomeApi.next> } | undefined

export default function WelcomeGate({ children }: { children: ReactNode }) {
  const scope = useSyncExternalStore(subscribeAuthSession, getAuthSessionScope)
  return <ScopedGate key={scope} scope={scope}>{children}</ScopedGate>
}

function ScopedGate({ children, scope }: { children: ReactNode; scope: string }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [session] = useState(() => {
    if (!opening || opening.scope !== scope) opening = { scope, done: !['/', '/app', '/login', '/locked'].includes(pathname) }
    return opening
  })
  const [done, setDone] = useState(session.done)
  const [quote, setQuote] = useState<WelcomeQuote | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const busyRef = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const home = pathname === '/' || pathname === '/app'
  const enter = () => { session.done = true; setDone(true); setQuote(null) }

  useEffect(() => {
    if (!home || session.done) return
    let active = true
    const skip = () => { if (active) { session.done = true; setDone(true) } }
    const timer = window.setTimeout(skip, 5000)
    session.request ??= welcomeApi.next()
    void session.request.then(result => {
      if (!active || session.done || getAuthSessionScope() !== scope) return
      if (result.quote) setQuote(result.quote)
      else skip()
    }).catch(skip).finally(() => window.clearTimeout(timer))
    return () => { active = false; window.clearTimeout(timer) }
  }, [home, scope, session])

  const next = async () => {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true); setError('')
    try {
      const result = await welcomeApi.next()
      if (!mounted.current || session.done || getAuthSessionScope() !== scope) return
      if (result.quote) setQuote(result.quote)
      else enter()
    } catch {
      if (mounted.current && getAuthSessionScope() === scope) setError('暂时无法换一句，请重试或直接进入记录。')
    } finally {
      busyRef.current = false
      if (mounted.current) setBusy(false)
    }
  }
  if (!home || done) return <>{children}</>
  if (!quote) return <div className="welcome-loading"><p role="status">翻开你的扉页…</p><Button variant="ghost" onClick={enter}>直接进入记录</Button></div>
  return <WelcomePage quote={quote} onEnter={enter} onNext={() => void next()} busy={busy} error={error}
    onSettings={() => { enter(); navigate('/settings/welcome') }} />
}
