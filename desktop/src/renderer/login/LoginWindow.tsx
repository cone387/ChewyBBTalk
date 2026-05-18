/**
 * 独立登录窗口组件。
 * 支持默认服务器和自定义服务器（类似手机端）。
 */
import { useState } from 'react';

const DEFAULT_SERVER = 'https://bbtalk.cone387.top';

type ServerMode = 'default' | 'custom';

export function LoginWindow() {
  const [form, setForm] = useState({ username: '', password: '', apiUrl: '' });
  const [serverMode, setServerMode] = useState<ServerMode>('default');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const effectiveApiUrl = serverMode === 'default' ? DEFAULT_SERVER : form.apiUrl;

  const handleLogin = async () => {
    if (!form.username || !form.password) return;
    if (serverMode === 'custom' && !form.apiUrl.trim()) {
      setError('请输入服务器地址');
      return;
    }
    setLoading(true);
    setError('');
    const result = await window.desktop.auth.login(
      form.username,
      form.password,
      effectiveApiUrl,
    );
    setLoading(false);
    if (result.ok) {
      setSuccess(true);
      setTimeout(() => window.desktop.login.hide(), 800);
    } else {
      setError(result.error || '登录失败');
    }
  };

  return (
    <div className="login-root">
      <header className="login-titlebar">
        <span className="login-title">登录 BBTalk</span>
        <div className="login-titlebar-spacer" />
        <button className="login-close-btn" onClick={() => window.desktop.login.hide()} aria-label="关闭">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </button>
      </header>

      <main className="login-body">
        <div className="login-logo">
          <span className="login-logo-text">BBTalk</span>
        </div>

        {/* Server selector */}
        <div className="login-server-selector">
          <button
            className={`login-server-tab ${serverMode === 'default' ? 'active' : ''}`}
            onClick={() => setServerMode('default')}
          >
            默认服务器
          </button>
          <button
            className={`login-server-tab ${serverMode === 'custom' ? 'active' : ''}`}
            onClick={() => setServerMode('custom')}
          >
            自定义
          </button>
        </div>

        {serverMode === 'default' && (
          <div className="login-server-info">{DEFAULT_SERVER}</div>
        )}

        {serverMode === 'custom' && (
          <input
            className="login-field"
            placeholder="https://your-server.com"
            value={form.apiUrl}
            onChange={(e) => setForm((f) => ({ ...f, apiUrl: e.target.value }))}
          />
        )}

        <input
          className="login-field"
          placeholder="用户名"
          value={form.username}
          onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
          autoFocus
        />
        <input
          className="login-field"
          type="password"
          placeholder="密码"
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
        />

        {error && <div className="login-error">{error}</div>}
        {success && <div className="login-success">登录成功 ✓</div>}

        <button className="login-submit" onClick={handleLogin} disabled={loading || success || !form.username || !form.password}>
          {loading ? '登录中…' : success ? '✓' : '登录'}
        </button>
      </main>
    </div>
  );
}
