import { randomUUID } from 'node:crypto';
import { store } from './store';
import { getSubmissionSession, getValidAccessToken, tryRestoreSession } from './auth';
import type { SubmissionIntent, SubmissionPayload, SubmissionSession, SubmissionSnapshot } from '../shared/ipc-types';

export function assertSession(expected: SubmissionSession) {
  const current = getSubmissionSession();
  if (!current || current.scope !== expected.scope || current.generation !== expected.generation) {
    throw new Error('账号或服务器已切换，请重新打开编辑器');
  }
  return current;
}
function read(scope: string): SubmissionIntent | undefined {
  return store.get('compose.submissions')?.[scope];
}
function write(scope: string, intent: SubmissionIntent) {
  store.set('compose.submissions', { ...store.get('compose.submissions'), [scope]: intent });
}
const busy = new Set<string>();
async function exclusive<T>(expected: SubmissionSession, work: () => Promise<T>): Promise<T> {
  assertSession(expected);
  if (busy.has(expected.scope)) throw new Error('原提交正在处理中，请稍候');
  busy.add(expected.scope);
  try { return await work(); } finally { busy.delete(expected.scope); }
}
export async function submissionSnapshot(): Promise<SubmissionSnapshot | null> {
  if (!getSubmissionSession()) await tryRestoreSession();
  const session = getSubmissionSession();
  if (!session) return null;
  await getValidAccessToken();
  assertSession(session);
  return { session: { scope: session.scope, generation: session.generation }, intent: read(session.scope) };
}
async function request(expected: SubmissionSession, intent: SubmissionIntent, retry: boolean) {
  const token = await getValidAccessToken();
  const session = assertSession(expected);
  if (!token) throw new Error('请先登录');
  const response = await fetch(retry
    ? `${session.apiUrl}/api/v1/bbtalk/`
    : `${session.apiUrl}/api/v1/bbtalk/submission-status/?key=${encodeURIComponent(intent.key)}`, {
    method: retry ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': intent.key },
    ...(retry ? { body: JSON.stringify(intent.payload) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  assertSession(expected);
  if (response.status === 410) {
    const confirmed: SubmissionIntent = { ...intent, state: 'confirmed', deleted: true };
    write(expected.scope, confirmed);
    return confirmed;
  }
  if (!response.ok) throw new Error(response.status === 404
    ? '暂未查到原提交，可重试原提交；当前输入已保留'
    : data.error || data.detail || `请求失败 (${response.status})，原提交已保留`);
  if (!data.uid) throw new Error('服务器返回的结果无法确认，请核对原提交');
  const confirmed: SubmissionIntent = { ...intent, state: 'confirmed' };
  write(expected.scope, confirmed);
  return confirmed;
}
export function publishSubmission(expected: SubmissionSession, payload: SubmissionPayload) {
  return exclusive(expected, async () => {
    const current = read(expected.scope);
    const same = current && JSON.stringify(current.payload) === JSON.stringify(payload);
    if (current?.state === 'pending' && !same) throw new Error('还有一份发布结果未确认，请先核对或重试原提交');
    const intent: SubmissionIntent = same ? current : {
      key: randomUUID(), payload: JSON.parse(JSON.stringify(payload)), state: 'pending',
    };
    // electron-store writes synchronously; no request can start if storage fails.
    write(expected.scope, intent);
    return request(expected, intent, true);
  });
}
export function recoverSubmission(expected: SubmissionSession, retry: boolean) {
  return exclusive(expected, async () => {
    const intent = read(expected.scope);
    if (!intent) throw new Error('没有待核对的原提交');
    return request(expected, intent, retry);
  });
}
export function forgetSubmission(expected: SubmissionSession, key: string) {
  assertSession(expected);
  const entries = { ...store.get('compose.submissions') };
  if (entries[expected.scope]?.key === key && entries[expected.scope].state === 'confirmed') {
    delete entries[expected.scope];
    store.set('compose.submissions', entries);
  }
}
