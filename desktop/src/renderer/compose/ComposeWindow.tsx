/**
 * Compose 编辑窗口组件。
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export function ComposeWindow() {
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '', apiUrl: '' });
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const draftTimerRef = useRef<number | null>(null);

  // 检查登录态
  useEffect(() => {
    window.desktop.auth.isLoggedIn().then(setLoggedIn);
  }, []);

  // 加载草稿 + 聚焦
  useEffect(() => {
    window.desktop.compose.getDraft().then((draft) => {
      if (draft) setContent(draft);
    });
    setTimeout(() => textareaRef.current?.focus(), 100);
  }, []);

  // 草稿自动保存
  useEffect(() => {
    if (draftTimerRef.current != null) window.clearTimeout(draftTimerRef.current);
    draftTimerRef.current = window.setTimeout(() => {
      window.desktop.compose.saveDraft(content);
    }, 2000);
    return () => {
      if (draftTimerRef.current != null) window.clearTimeout(draftTimerRef.current);
    };
  }, [content]);

  // 键盘快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        publish();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (showLogin) setShowLogin(false);
        else window.desktop.compose.hide();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const showToastMsg = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 2000);
  };

  const handleLogin = async () => {
    if (!loginForm.username || !loginForm.password) return;
    setLoggingIn(true);
    setLoginError('');
    const result = await window.desktop.auth.login(
      loginForm.username,
      loginForm.password,
      loginForm.apiUrl || undefined,
    );
    setLoggingIn(false);
    if (result.ok) {
      setLoggedIn(true);
      setShowLogin(false);
    } else {
      setLoginError(result.error || '登录失败');
    }
  };

  const publish = useCallback(async () => {
    const trimmed = content.trim();
    if (!trimmed || submitting) return;
    if (!loggedIn) {
      setShowLogin(true);
      return;
    }

    setSubmitting(true);
    try {
      const apiUrl = await window.desktop.compose.getApiUrl();
      const token = await window.desktop.auth.getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${apiUrl}/api/v1/bbtalk/`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ content: trimmed, visibility: 'private' }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || err.error || `HTTP ${response.status}`);
      }

      showToastMsg('success', '已发布');
      setContent('');
      await window.desktop.compose.clearDraft();
      setTimeout(() => window.desktop.compose.hide(), 1000);
    } catch (err: unknown) {
      showToastMsg('error', err instanceof Error ? err.message : '发布失败');
    } finally {
      setSubmitting(false);
    }
  }, [content, submitting, loggedIn]);

  // Loading 态
  if (loggedIn === null) {
    return (
      <div className="compose-root">
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: '#9CA3AF', fontSize: 13 }}>
          加载中…
        </div>
      </div>
    );
  }

  return (
    <div className="compose-root">
      <header className="compose-titlebar">
        <div className="titlebar-spacer" />
        <button className="close-btn" onClick={() => window.desktop.compose.hide()} aria-label="关闭">
          ×
        </button>
      </header>

      <main className="compose-body">
        <textarea
          ref={textareaRef}
          className="compose-textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="记一下点什么…"
          spellCheck={false}
        />
      </main>

      <footer className="compose-toolbar">
        <button className="tool-btn" title="可见性">🔒</button>
        <button className="tool-btn" title="标签">🏷️</button>
        <button className="tool-btn" title="附件">📎</button>
        <button className="tool-btn" title="定位">📍</button>
        <div className="toolbar-spacer" />
        <span className="char-count">{content.length}</span>
        {loggedIn ? (
          <button className="publish-btn" onClick={publish} disabled={!content.trim() || submitting}>
            {submitting ? '…' : '发布'}
            <span className="hint">⌘⏎</span>
          </button>
        ) : (
          <button className="publish-btn login-btn" onClick={() => setShowLogin(true)}>
            登录
          </button>
        )}
      </footer>

      {toast && <div className={`toast ${toast.kind}`}>{toast.text}</div>}

      {showLogin && (
        <div className="login-overlay">
          <div className="login-panel">
            <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600 }}>登录</h3>
            <input className="login-input" placeholder="API 地址（可选）" value={loginForm.apiUrl} onChange={(e) => setLoginForm((f) => ({ ...f, apiUrl: e.target.value }))} />
            <input className="login-input" placeholder="用户名" value={loginForm.username} onChange={(e) => setLoginForm((f) => ({ ...f, username: e.target.value }))} />
            <input className="login-input" type="password" placeholder="密码" value={loginForm.password} onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && handleLogin()} />
            {loginError && <div style={{ color: '#EF4444', fontSize: 11, marginTop: 2 }}>{loginError}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="publish-btn" style={{ flex: 1, justifyContent: 'center' }} onClick={handleLogin} disabled={loggingIn}>{loggingIn ? '…' : '登录'}</button>
              <button className="publish-btn" style={{ flex: 1, justifyContent: 'center', background: '#E5E7EB', color: '#374151' }} onClick={() => setShowLogin(false)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
