import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { shell } from 'electron';
import { acceptTokens, beginLogin, normalizeServer, getApiUrl, getSessionGeneration } from './auth';

let cancelPending: (() => void) | undefined;
export function cancelBrowserLogin() { cancelPending?.(); }

export async function browserLogin(serverUrl = getApiUrl()): Promise<{ ok: boolean; error?: string }> {
  cancelBrowserLogin();
  let apiUrl: string;
  try { apiUrl = normalizeServer(serverUrl); } catch { return { ok: false, error: '服务器地址无效' }; }
  const generation = beginLogin();
  const verifier = randomBytes(32).toString('base64url');
  const state = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return new Promise(resolve => {
    let finished = false;
    let exchanging = false;
    let redirectUri = '';
    const controller = new AbortController();
    const finish = (result: { ok: boolean; error?: string }) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer); controller.abort();
      server.close(); server.closeAllConnections();
      if (cancelPending === cancel) cancelPending = undefined;
      resolve(result);
    };
    const cancel = () => finish({ ok: false, error: '已取消浏览器登录' });
    cancelPending = cancel;
    const server = createServer(async (req, res) => {
      const url = new URL(req.url || '/', redirectUri);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      if (req.method !== 'GET' || url.pathname !== '/callback' || url.searchParams.get('state') !== state || req.headers.host !== new URL(redirectUri).host) {
        res.writeHead(400); res.end('无效的授权回调'); return;
      }
      if (exchanging) { res.writeHead(409); res.end('正在完成登录'); return; }
      if (url.searchParams.has('error')) { res.end('已取消，可以关闭此页面。'); setImmediate(cancel); return; }
      const code = url.searchParams.get('code');
      if (!code || !/^[A-Za-z0-9_-]{43}$/.test(code)) { res.writeHead(400); res.end('授权码无效'); return; }
      exchanging = true;
      try {
        const response = await fetch(`${apiUrl}/api/v1/bbtalk/auth/desktop/exchange/`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, code_verifier: verifier, redirect_uri: redirectUri }),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
        });
        const data = await response.json().catch(() => ({}));
        if (finished) return;
        if (!response.ok) throw new Error(data.detail || '授权失败，请重新发起登录');
        if (generation !== getSessionGeneration()) throw new Error('会话已改变，请重新登录');
        acceptTokens(data, apiUrl, generation);
        res.end('登录成功，请返回 ChewyBBTalk。此页面可以关闭。');
        setImmediate(() => finish({ ok: true }));
      } catch (error) {
        res.end('登录未完成，请返回桌面端重试。');
        setImmediate(() => finish({ ok: false, error: error instanceof Error ? error.message : '授权失败' }));
      }
    });
    const timer = setTimeout(() => finish({ ok: false, error: '等待授权超时，请重新登录' }), 5 * 60_000);
    server.on('error', () => finish({ ok: false, error: '无法建立本地授权回调，请重试' }));
    server.listen(0, '127.0.0.1', async () => {
      const address = server.address();
      if (!address || typeof address === 'string' || finished) return;
      redirectUri = `http://127.0.0.1:${address.port}/callback`;
      const url = new URL('/desktop/authorize', apiUrl);
      url.search = new URLSearchParams({ redirect_uri: redirectUri, code_challenge: challenge, code_challenge_method: 'S256', state }).toString();
      try { await shell.openExternal(url.toString()); }
      catch { finish({ ok: false, error: '无法打开浏览器，请检查默认浏览器设置' }); }
    });
  });
}
