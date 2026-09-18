import { useState, useEffect } from 'react';
import logoUrl from '../../../resources/icon.png';

export function LoginWindow() {
  const [apiUrl, setApiUrl] = useState('https://bbtalk.cone387.top');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordMode, setPasswordMode] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<'browser' | 'password' | null>(null);
  const [success, setSuccess] = useState(false);
  useEffect(() => { void window.desktop.compose.getApiUrl().then(setApiUrl); }, []);
  const signIn = async (mode: 'browser' | 'password') => {
    setPending(mode); setError('');
    try {
      const result = mode === 'browser' ? await window.desktop.auth.browserLogin(apiUrl)
        : await window.desktop.auth.login(username, password, apiUrl);
      if (result.ok) { setSuccess(true); setTimeout(() => window.desktop.login.hide(), 800); }
      else setError(result.error || '登录失败');
    } catch (e) { setError(e instanceof Error ? e.message : '登录失败'); }
    finally { setPending(null); }
  };
  return <div className="login-root">
    <header className="login-titlebar">
      <span className="login-title">登录 ChewyBBTalk</span><div className="login-titlebar-spacer" />
      <button className="login-close-btn" onClick={() => window.desktop.login.hide()} aria-label="关闭">×</button>
    </header>
    <main className="login-body">
      <div className="login-logo"><img src={logoUrl} width="48" height="48" alt="ChewyBBTalk" /></div>
      <label className="login-help" htmlFor="server">服务器地址</label>
      <input id="server" className="login-field" value={apiUrl} disabled={!!pending} onChange={e => setApiUrl(e.target.value)} placeholder="https://your-server.com" />
      <button className="login-submit" disabled={!!pending || success} onClick={() => signIn('browser')}>
        {pending === 'browser' ? '等待浏览器授权…' : '通过浏览器登录'}
      </button>
      <p className="login-help">使用网页账号授权，登录后自动返回。</p>
      {pending === 'browser' && <button className="login-secondary" onClick={() => window.desktop.auth.cancelBrowserLogin()}>取消登录</button>}
      <button className="login-secondary" disabled={!!pending} onClick={() => setPasswordMode(value => !value)}>{passwordMode ? '收起密码登录' : '使用账号密码（兼容旧服务器）'}</button>
      {passwordMode && <>
        <input className="login-field" aria-label="用户名" placeholder="用户名" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" />
        <input className="login-field" aria-label="密码" placeholder="密码" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && !pending) void signIn('password'); }} />
        <button className="login-submit" disabled={!!pending || success || !username || !password} onClick={() => signIn('password')}>{pending === 'password' ? '登录中…' : '密码登录'}</button>
      </>}
      {error && <div className="login-error" role="alert">{error}</div>}
      {success && <div className="login-success" role="status">登录成功</div>}
    </main>
  </div>;
}
