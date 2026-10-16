import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSession, isCurrentSession, type Session } from './session';

// One queue per key also orders writes across editor remounts.
const queues = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
export function onDraftsChange(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export interface DraftEntry { key: string; preview: string; pendingCount: number; recordId?: string; }
/** Only a complete edit snapshot can prove there are no changes to recover. */
export function isUnchangedEditDraft(value: any): boolean {
  const original = value?.editItem;
  if (value?.version !== 1 || typeof value.content !== 'string' ||
      !['public', 'private'].includes(value.visibility) || !Array.isArray(value.attachments) || !Array.isArray(value.pendingMedia) ||
      !original || typeof original.content !== 'string' || !['public', 'private'].includes(original.visibility) ||
      !Array.isArray(original.tags) || original.tags.some((tag: any) => typeof tag?.name !== 'string') ||
      !Array.isArray(original.attachments) || [...value.attachments, ...original.attachments].some((attachment: any) => typeof attachment?.uid !== 'string')) return false;
  const sameTextAndTags = Array.isArray(value.tagNames)
    ? value.content === original.content && value.tagNames.every((name: unknown) => typeof name === 'string') &&
      JSON.stringify([...new Set(value.tagNames)].sort()) === JSON.stringify([...new Set(original.tags.map((tag: any) => tag.name))].sort())
    : value.content === original.tags.map((tag: any) => `#${tag.name} `).join('') + original.content;
  return sameTextAndTags &&
    value.visibility === original.visibility && value.pendingMedia.length === 0 &&
    JSON.stringify(value.attachments) === JSON.stringify(original.attachments) &&
    JSON.stringify(value.location || null) === JSON.stringify(original.context?.location || null);
}
export function isScopedDraftKey(key: string, session: Session) {
  const prefix = `compose_draft:${session.scope}`;
  return !!session.scope && (key === prefix || key.startsWith(`${prefix}:edit:`) || key.startsWith(`${prefix}:locked:`));
}
export async function listDrafts(session: Session): Promise<DraftEntry[]> {
  if (!session.scope) return [];
  if (!isCurrentSession(session)) throw new Error('账号已切换');
  await waitForDraftWrites(session.scope);
  const keys = (await AsyncStorage.getAllKeys()).filter(key => isScopedDraftKey(key, session));
  const values = await Promise.all(keys.map(async key => [key, await readDraft(key)] as const));
  if (!isCurrentSession(session)) throw new Error('账号已切换');
  return values.flatMap(([key, raw]) => {
    if (!raw) return [];
    let value: any;
    try { value = JSON.parse(raw); } catch { value = { content: raw }; }
    if (isUnchangedEditDraft(value)) return [];
    const content = typeof value?.content === 'string' ? value.content.trim() : '';
    const pendingCount = Array.isArray(value?.pendingMedia) ? value.pendingMedia.length : 0;
    const tagNames: string[] = Array.isArray(value?.tagNames) ? value.tagNames.filter((name: unknown) => typeof name === 'string') : [];
    if (!content && !pendingCount && !value?.attachments?.length && !tagNames.length) return [];
    const prefix = `compose_draft:${session.scope}:edit:`;
    return [{ key, preview: content.slice(0, 100) || (tagNames.length ? tagNames.map(name => `#${name}`).join(' ').slice(0, 100) : '附件记录'), pendingCount,
      ...(key.startsWith(prefix) ? { recordId: key.slice(prefix.length) } : {}) }];
  });
}
export function writeDraft(key: string, value: unknown | null, session: Session): Promise<void> {
  const serialized = value === null ? null : JSON.stringify(value);
  const next = (queues.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
    if (!isCurrentSession(session)) throw new Error('账号已切换，请重新打开编辑器');
    if (serialized === null) await AsyncStorage.removeItem(key);
    else await AsyncStorage.setItem(key, serialized);
    if (isCurrentSession(session)) listeners.forEach(listener => listener());
  });
  queues.set(key, next);
  void next.finally(() => { if (queues.get(key) === next) queues.delete(key); }).catch(() => {});
  return next;
}

export async function readDraft(key: string): Promise<string | null> {
  await queues.get(key)?.catch(() => {});
  const raw = await AsyncStorage.getItem(key);
  const session = getSession();
  if (!raw || !isScopedDraftKey(key, session)) return raw;
  const saved = await AsyncStorage.getItem(`outbox:${session.scope}`);
  const entries = saved ? JSON.parse(saved) : [];
  if (!isCurrentSession(session)) throw new Error('账号已切换');
  return Array.isArray(entries) && entries.some(entry => entry.sourceDraftKey === key && entry.draft && JSON.stringify(entry.draft) === raw) ? null : raw;
}

/** Order the transfer cleanup with editor writes and preserve any newer draft. */
export function clearTransferredDraft(key: string, snapshot: unknown, session: Session): Promise<void> {
  if (!snapshot || !isScopedDraftKey(key, session)) return Promise.resolve();
  const next = (queues.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
    if (!isCurrentSession(session)) throw new Error('账号已切换');
    const raw = await AsyncStorage.getItem(key);
    if (!isCurrentSession(session)) throw new Error('账号已切换');
    if (raw === JSON.stringify(snapshot)) await AsyncStorage.removeItem(key);
  });
  queues.set(key, next);
  void next.finally(() => { if (queues.get(key) === next) queues.delete(key); }).catch(() => {});
  return next;
}

export async function waitForDraftWrites(scope: string) {
  await Promise.allSettled([...queues.entries()].filter(([key]) => key.startsWith(`compose_draft:${scope}`)).map(([, promise]) => promise));
}
