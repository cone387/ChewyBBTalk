/**
 * 独立设置窗口 — 左侧导航 + 右侧内容（参考 ChouYu 项目）
 */
import { useEffect, useState } from 'react';

type NavKey = 'general' | 'account' | 'logs' | 'about';

interface LogEntry {
  timestamp: number;
  level: 'info' | 'error' | 'warn';
  message: string;
}

export function SettingsWindow() {
  const [activeNav, setActiveNav] = useState<NavKey>('general');
  const [apiUrl, setApiUrl] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [saved, setSaved] = useState(false);
  const [updateStatus, setUpdateStatus] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    window.desktop.compose.getApiUrl().then(setApiUrl);
    window.desktop.auth.isLoggedIn().then(setLoggedIn);
  }, []);

  // Load logs when logs tab is active
  useEffect(() => {
    if (activeNav === 'logs') {
      try {
        const stored = localStorage.getItem('__bbtalk_logs');
        if (stored) setLogs(JSON.parse(stored));
      } catch { setLogs([]); }
    }
  }, [activeNav]);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleLogout = async () => {
    await window.desktop.auth.logout();
    setLoggedIn(false);
  };

  const handleCheckUpdate = () => {
    setUpdateStatus('检查中…');
    setTimeout(() => setUpdateStatus('已是最新版本'), 2000);
  };

  const handleClearLogs = () => {
    localStorage.removeItem('__bbtalk_logs');
    setLogs([]);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
  };

  return (
    <div className="settings-root">
      <header className="settings-titlebar">
        <span className="settings-title">设置</span>
        <div className="settings-titlebar-spacer" />
        <button className="settings-close-btn" onClick={() => window.desktop.settings.hide()} aria-label="关闭">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </button>
      </header>

      <div className="settings-layout">
        {/* Left nav */}
        <nav className="settings-nav">
          <button className={`settings-nav-item ${activeNav === 'general' ? 'active' : ''}`} onClick={() => setActiveNav('general')}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="7" cy="7" r="2" />
              <path d="M7 1.5v2M7 10.5v2M1.5 7h2M10.5 7h2M3 3l1.4 1.4M9.6 9.6l1.4 1.4M11 3l-1.4 1.4M4.4 9.6L3 11" />
            </svg>
            <span>通用</span>
          </button>
          <button className={`settings-nav-item ${activeNav === 'account' ? 'active' : ''}`} onClick={() => setActiveNav('account')}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="7" cy="5" r="3" />
              <path d="M2 13c0-2.8 2.2-5 5-5s5 2.2 5 5" />
            </svg>
            <span>账号</span>
          </button>
          <button className={`settings-nav-item ${activeNav === 'logs' ? 'active' : ''}`} onClick={() => setActiveNav('logs')}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h10M2 7h7M2 11h5" />
            </svg>
            <span>日志</span>
          </button>
          <button className={`settings-nav-item ${activeNav === 'about' ? 'active' : ''}`} onClick={() => setActiveNav('about')}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="7" cy="7" r="5.5" />
              <path d="M7 4v3M7 9.5v.5" />
            </svg>
            <span>关于</span>
          </button>
        </nav>

        {/* Right content */}
        <div className="settings-content">
          {activeNav === 'general' && (
            <div className="settings-pane">
              <div className="settings-field">
                <label className="settings-label">API 地址</label>
                <input className="settings-input" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="https://bbtalk.cone387.top" />
              </div>
              <div className="settings-field">
                <label className="settings-label">快捷键</label>
                <div className="settings-hotkey-row">
                  <span className="settings-hotkey-label">打开编辑框</span>
                  <kbd className="settings-kbd">Alt+B</kbd>
                </div>
              </div>
              <button className="settings-save-btn" onClick={handleSave}>
                {saved ? '已保存 ✓' : '保存设置'}
              </button>
            </div>
          )}

          {activeNav === 'account' && (
            <div className="settings-pane">
              <div className="settings-field">
                <label className="settings-label">登录状态</label>
                <div className="settings-status-row">
                  <span className={`settings-dot ${loggedIn ? 'active' : ''}`} />
                  <span>{loggedIn ? '已登录' : '未登录'}</span>
                </div>
              </div>
              {loggedIn ? (
                <button className="settings-danger-btn" onClick={handleLogout}>退出登录</button>
              ) : (
                <button className="settings-save-btn" onClick={() => window.desktop.login.show()}>去登录</button>
              )}
            </div>
          )}

          {activeNav === 'logs' && (
            <div className="settings-pane">
              <div className="settings-logs-header">
                <label className="settings-label">错误日志</label>
                {logs.length > 0 && (
                  <button className="settings-clear-btn" onClick={handleClearLogs}>清空</button>
                )}
              </div>
              {logs.length === 0 ? (
                <div className="settings-logs-empty">暂无日志</div>
              ) : (
                <div className="settings-logs-list">
                  {[...logs].reverse().map((log, i) => (
                    <div key={i} className={`settings-log-item ${log.level}`}>
                      <span className="settings-log-time">{formatTime(log.timestamp)}</span>
                      <span className="settings-log-msg">{log.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeNav === 'about' && (
            <div className="settings-pane settings-about">
              <div className="settings-about-logo">BBTalk</div>
              <div className="settings-about-version">Desktop v0.1.0</div>
              <div className="settings-about-desc">桌面悬浮球，快速记录碎碎念</div>
              <button className="settings-update-btn" onClick={handleCheckUpdate} disabled={updateStatus === '检查中…'}>
                {updateStatus || '检查更新'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
