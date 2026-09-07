import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSession, isCurrentSession, type Session } from './session';
import type { bbtalkApi } from './api/bbtalkApi';

export interface SubmissionIntent {
  key: string;
  payload: Parameters<typeof bbtalkApi.createBBTalk>[0];
  state: 'pending' | 'confirmed';
}
let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(work: () => Promise<T>): Promise<T> {
  const result = queue.then(work);
  queue = result.catch(() => {});
  return result;
}
function storageKey(session: Session): string {
  if (!session.scope || !isCurrentSession(session)) throw new Error('账号已切换，请重新打开编辑器');
  return `submission:${session.scope}`;
}
async function read(key: string): Promise<SubmissionIntent | undefined> {
  const raw = await AsyncStorage.getItem(key);
  if (raw === null) return undefined;
  const value = JSON.parse(raw) as SubmissionIntent;
  if (!value.key || !value.payload || !['pending', 'confirmed'].includes(value.state)) {
    throw new Error('无法读取原提交，请保留当前内容后重试');
  }
  return value;
}
export function readSubmission(session = getSession()) {
  return serialize(async () => {
    const key = storageKey(session);
    const result = await read(key);
    storageKey(session);
    return result;
  });
}
export function beginSubmission(payload: SubmissionIntent['payload'], session = getSession()) {
  return serialize(async () => {
    const key = storageKey(session);
    const current = await read(key);
    storageKey(session);
    if (current && JSON.stringify(current.payload) === JSON.stringify(payload)) return current;
    if (current?.state === 'pending') throw new Error('还有一份发布结果未确认，请先核对或重试原提交');
    // Correlation identifier only, never used as an authentication credential.
    const intent: SubmissionIntent = {
      key: `mobile_${Date.now().toString(36)}_${Array.from({ length: 4 }, () => Math.random().toString(36).slice(2)).join('')}`,
      payload: JSON.parse(JSON.stringify(payload)), state: 'pending',
    };
    await AsyncStorage.setItem(key, JSON.stringify(intent));
    storageKey(session);
    return intent;
  });
}
export function confirmSubmission(intentKey: string, session = getSession()) {
  return serialize(async () => {
    const key = storageKey(session);
    const current = await read(key);
    storageKey(session);
    if (current?.key === intentKey) await AsyncStorage.setItem(key, JSON.stringify({ ...current, state: 'confirmed' }));
    storageKey(session);
  });
}
export function forgetConfirmedSubmission(intentKey: string, session = getSession()) {
  return serialize(async () => {
    const key = storageKey(session);
    const current = await read(key);
    storageKey(session);
    if (current?.key === intentKey && current.state === 'confirmed') await AsyncStorage.removeItem(key);
    storageKey(session);
  });
}
