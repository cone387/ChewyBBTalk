// Logical login session: token refresh must not invalidate reusable reads.
const SESSION_KEY = 'bbtalk_session_scope';
let generation = 0;
let lastHostToken = '';
let hostGeneration = 0;
const listeners = new Set<() => void>();

function userIdentity(value: string | null): string {
  try { return String(JSON.parse(value || 'null')?.id ?? 'anonymous'); }
  catch { return 'anonymous'; }
}

export function getAuthSessionScope(): string {
  // Embedded hosts own their session lifecycle. A changed host credential must
  // conservatively invalidate cached data even when no storage event is sent.
  const hostToken = window.__POWERED_BY_WUJIE__
    ? window.__WUJIE?.props?.getToken?.() || window.__AUTH_BRIDGE__?.getToken?.() || '' : '';
  if (hostToken !== lastHostToken) {
    lastHostToken = hostToken;
    hostGeneration += 1;
    // Getters run during React render. Notify after it, while the new scope
    // already rejects old responses synchronously.
    queueMicrotask(() => notify(false));
  }
  return `${generation}:${localStorage.getItem(SESSION_KEY) || ''}:${userIdentity(localStorage.getItem('bbtalk_user_info'))}:${!!localStorage.getItem('bbtalk_access_token')}:${hostGeneration}`;
}

function notify(advance = true) {
  if (advance) generation += 1;
  for (const listener of listeners) listener();
}

export function rotateAuthSession(): void {
  // getRandomValues also works on HTTP LAN deployments, unlike randomUUID.
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
  localStorage.setItem(SESSION_KEY, nonce);
  notify();
}

export function subscribeAuthSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

window.addEventListener('storage', event => {
  if (event.key === null || event.key === SESSION_KEY ||
    (event.key === 'bbtalk_user_info' && userIdentity(event.oldValue) !== userIdentity(event.newValue))) notify();
});
