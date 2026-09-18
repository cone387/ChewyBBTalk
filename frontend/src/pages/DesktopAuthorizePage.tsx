import { useState } from 'react';
import { getCurrentUser } from '../services/auth';
import { apiClient } from '../services/api/apiClient';

export default function DesktopAuthorizePage() {
  const params = new URLSearchParams(window.location.search);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const user = getCurrentUser();
  const redirect = params.get('redirect_uri') || '';
  const state = params.get('state') || '';
  const challenge = params.get('code_challenge') || '';
  let valid = false;
  try {
    const url = new URL(redirect);
    valid = url.protocol === 'http:' && url.hostname === '127.0.0.1' && Number(url.port) >= 1024
      && url.pathname === '/callback' && !url.search && !url.hash && !url.username && !url.password
      && /^[A-Za-z0-9_-]{43}$/.test(challenge) && /^[A-Za-z0-9_-]{43}$/.test(state)
      && params.get('code_challenge_method') === 'S256';
  } catch { /* Show an invalid request without navigating anywhere. */ }
  const returnToDesktop = (values: Record<string, string>) => {
    const url = new URL(redirect);
    url.search = new URLSearchParams({ ...values, state }).toString();
    window.location.assign(url.toString());
  };
  const authorize = async () => {
    setBusy(true); setError('');
    try {
      const result = await apiClient.post<{ code: string }>('/api/v1/bbtalk/auth/desktop/authorize/', {
        redirect_uri: redirect, code_challenge: challenge, code_challenge_method: 'S256',
      });
      returnToDesktop({ code: result.code });
    } catch (e) { setError(e instanceof Error ? e.message : '授权失败，请重试'); setBusy(false); }
  };
  return <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
    <section className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 space-y-6">
      <p className="text-sm font-semibold text-blue-700">ChewyBBTalk · 桌面登录</p>
      <h1 className="text-2xl font-semibold text-gray-900">连接你的桌面端</h1>
      {!valid ? <p role="alert" className="text-red-700">授权链接无效，请回到桌面端重新发起登录。</p> : <>
        <p className="text-gray-600 leading-relaxed">{user ? `使用 ${user.display_name || user.username} 登录桌面端，随时记录和上传附件。` : '先登录网页账号，再确认连接桌面端。'}</p>
        <p className="text-sm text-gray-600">仅在你刚刚从 ChewyBBTalk 桌面端发起登录时继续。</p>
        {error && <p role="alert" className="text-red-700">{error}</p>}
        {user ? <button className="w-full min-h-12 rounded-lg bg-blue-600 text-white font-medium disabled:opacity-50" disabled={busy} onClick={authorize}>{busy ? '正在连接…' : '确认登录桌面端'}</button>
          : <a className="flex min-h-12 items-center justify-center rounded-lg bg-blue-600 text-white" href={`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`}>登录并继续</a>}
        <button className="w-full min-h-12 rounded-lg text-gray-700 hover:bg-gray-100" disabled={busy} onClick={() => returnToDesktop({ error: 'access_denied' })}>取消</button>
      </>}
    </section>
  </main>;
}
