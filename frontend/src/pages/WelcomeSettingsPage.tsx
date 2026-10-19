import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import SettingsLayout from '../components/layout/SettingsLayout'
import Button from '../components/ui/Button'
import WelcomePage from '../components/welcome/WelcomePage'
import { welcomeApi, type WelcomeConfig, type WelcomeQuote } from '../services/api/welcomeApi'
import { getAuthSessionScope, subscribeAuthSession } from '../services/authSessionScope'
import { useActionFeedback } from '../hooks/useActionFeedback'
import '../components/welcome/welcome.css'

export default function WelcomeSettingsPage() {
  const scope = useSyncExternalStore(subscribeAuthSession, getAuthSessionScope)
  return <PersonalSettings key={scope} scope={scope} />
}

function PersonalSettings({ scope }: { scope: string }) {
  const location = useLocation()
  const imported = location.state as { welcomeText?: string; welcomeScope?: string } | null
  const [text, setText] = useState(imported?.welcomeScope === scope ? imported.welcomeText || '' : '')
  const [source, setSource] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [config, setConfig] = useState<WelcomeConfig | null>(null)
  const [preview, setPreview] = useState<WelcomeQuote | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [notice, setNotice] = useState('')
  const sending = useRef(false)
  const mounted = useRef(true)
  const input = useRef<HTMLTextAreaElement>(null)
  const feedback = useActionFeedback()
  const live = () => mounted.current && getAuthSessionScope() === scope
  const load = async () => {
    setLoading(true)
    try {
      const data = await welcomeApi.get()
      if (live()) { setConfig(data); setError(''); setConflict(false) }
    } catch { if (live()) setError('文案池加载失败，请检查网络后重试。') }
    finally { if (live()) setLoading(false) }
  }
  useEffect(() => {
    mounted.current = true
    void load()
    return () => { mounted.current = false }
    // This component is keyed by account/session; no read survives a switch.
  }, [scope])

  const persist = async (next: WelcomeConfig): Promise<boolean> => {
    if (sending.current || !live()) return false
    sending.current = true; setBusy(true); setError(''); setNotice('')
    try {
      const saved = await welcomeApi.save(next)
      if (!live()) return false
      setConfig(saved); setNotice('已保存到你的账号'); setConflict(false)
      return true
    } catch (cause) {
      if (live()) {
        const stale = (cause as { status?: number }).status === 409
        setConflict(stale)
        setError(stale ? '文案池已在其他页面更新。请重新载入后再保存，你输入的文案会保留。' : '保存失败，输入内容已保留，请重试。')
      }
      return false
    } finally { sending.current = false; if (live()) setBusy(false) }
  }
  const clearEditor = () => { setText(''); setSource(''); setEditing(null) }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!config || !text.trim() || conflict) return
    if (config.quotes.some(item => item.id !== editing && item.text === text.trim())) {
      setError('这句文案已经在池子里了。'); return
    }
    if (editing && !config.quotes.some(item => item.id === editing)) {
      setError('这条文案已被删除。取消编辑后可以将内容作为新文案保存。'); return
    }
    const id = editing || Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('')
    const quote = { id, text: text.trim(), source: source.trim() }
    const quotes = editing ? config.quotes.map(item => item.id === editing ? quote : item) : [...config.quotes, quote]
    if (await persist({ ...config, quotes })) clearEditor()
  }

  if (preview) return <WelcomePage preview quote={preview} onEnter={() => setPreview(null)} />
  return <SettingsLayout title="文案欢迎页" description="每次打开，遇见一句自己留下的话。" active="/settings/welcome">
    <div className="settings-body welcome-settings">
      {feedback.feedback}
      {error && <div className="welcome-form-error" role="alert"><p>{error}</p>
        <Button variant="ghost" disabled={busy || loading} onClick={() => void load()}>重新载入文案池</Button></div>}
      {loading && <p role="status">正在读取你的文案池…</p>}
      {config && <>
        <section className="settings-panel welcome-preference">
          <label className="welcome-toggle-label">
            <span><strong>开启文案欢迎页</strong><span>打开首页时先看一句文案，随时可以关闭。</span></span>
            <input type="checkbox" aria-label="开启文案欢迎页" checked={config.enabled} disabled={busy || loading || conflict}
              onChange={event => void persist({ ...config, enabled: event.target.checked })} />
          </label>
          <p>随机轮换，每句看过后再开始下一轮。文案与开关跟随你的账号。</p>
          <span className="welcome-save-status" role="status">{busy ? '正在保存…' : notice}</span>
        </section>
        <div className="welcome-settings-columns">
          <section className="settings-panel welcome-editor" aria-labelledby="welcome-editor-heading">
            <h2 id="welcome-editor-heading">{editing ? '编辑这句话' : '留下一句话'}</h2>
            <p>喜欢的句子、自己的念头，都可以留在这里。</p>
            <form onSubmit={event => void submit(event)}>
              <label htmlFor="welcome-text">文案内容</label>
              <textarea id="welcome-text" ref={input} value={text} maxLength={1000} required rows={7} disabled={busy}
                placeholder="写下你想在打开 BBTalk 时看见的话…" onChange={event => setText(event.target.value)} />
              <span className="welcome-character-count">{text.length} / 1000</span>
              <label htmlFor="welcome-source">出处（可选）</label>
              <input id="welcome-source" value={source} maxLength={200} disabled={busy} placeholder="例如：我的手记"
                onChange={event => setSource(event.target.value)} />
              <div className="welcome-editor-actions">
                <Button type="submit" loading={busy} disabled={loading || conflict || !text.trim() || text.length > 1000 || (!editing && config.quotes.length >= 200)}>{editing ? '保存修改' : '添加文案'}</Button>
                {editing && <Button type="button" variant="ghost" disabled={busy} onClick={clearEditor}>取消编辑</Button>}
              </div>
              {text.length > 1000 && <p role="alert">这条记录较长，请选取 1000 字符以内的一段。</p>}
            </form>
          </section>
          <section className="welcome-pool" aria-labelledby="welcome-pool-heading">
            <div className="welcome-pool-heading"><h2 id="welcome-pool-heading">我的文案池</h2><span>{config.quotes.length} / 200</span></div>
            {config.quotes.length === 0 ? <div className="welcome-empty"><p>扉页，等你落笔。</p><span>添加第一句文案后，开启欢迎页即可在下次打开时看见它。空池会直接进入记录。</span></div>
              : <ul>{config.quotes.map(quote => <li key={quote.id} className="welcome-pool-item">
                <blockquote>{quote.text}</blockquote>{quote.source && <p className="welcome-pool-source">{quote.source}</p>}
                <div className="welcome-item-actions">
                  <button type="button" aria-label={`预览：${quote.text}`} onClick={() => setPreview(quote)}>预览</button>
                  <button type="button" disabled={busy || loading} aria-label={`编辑：${quote.text}`} onClick={() => {
                    setEditing(quote.id); setText(quote.text); setSource(quote.source); input.current?.focus()
                  }}>编辑</button>
                  <button type="button" disabled={busy || loading || conflict} aria-label={`删除：${quote.text}`} onClick={() => feedback.confirm({
                    title: '删除文案', message: '只从文案池移除这句话，不影响原来的记录。', confirmLabel: '确认删除',
                    action: async () => { if (await persist({ ...config, quotes: config.quotes.filter(item => item.id !== quote.id) })) { if (editing === quote.id) clearEditor() } else throw new Error('删除未完成，请关闭弹窗后查看提示并重试。') },
                  })}>删除</button>
                </div>
              </li>)}</ul>}
          </section>
        </div>
      </>}
    </div>
  </SettingsLayout>
}
