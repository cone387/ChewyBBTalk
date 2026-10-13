import AsyncStorage from '@react-native-async-storage/async-storage';
import { bbtalkApi, transformBBTalk } from './api/bbtalkApi';
import { getSession, isCurrentSession, type Session } from './session';
import { uploadRetainedMedia, type PendingMedia } from './pendingMedia';
import type { BBTalk } from '../types';
import { notifyRecordsChanged } from './recordChanges';
import { serializeOutboxWrite, waitForOutboxWrites } from './outboxWrites';
import { clearTransferredDraft } from './drafts';

type Payload = Parameters<typeof bbtalkApi.createBBTalk>[0];
export interface QueuedSubmission {
  id: string;
  payload: Payload;
  pendingMedia: PendingMedia[];
  sourceDraftKey: string;
  draft?: unknown;
  recordId?: string;
  expectedUpdatedAt?: string;
  state: 'queued' | 'syncing' | 'failed' | 'conflict' | 'synced';
  createdAt: string;
  attempted?: boolean;
  error?: string;
  conflict?: BBTalk;
  record?: BBTalk;
}
export type SubmissionInput = Pick<QueuedSubmission, 'payload' | 'pendingMedia' | 'sourceDraftKey' | 'draft' | 'recordId' | 'expectedUpdatedAt' | 'attempted'> & { id?: string };
const workers = new Map<number, Promise<void>>();
const listeners = new Set<() => void>();
export function onOutboxChange(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function assertSession(session: Session) {
  if (!session.scope || !isCurrentSession(session)) throw new Error('账号已切换，请重新登录');
}
export function outboxKey(scope: string) { return `outbox:${scope}`; }
async function read(session: Session): Promise<QueuedSubmission[]> {
  assertSession(session);
  const raw = await AsyncStorage.getItem(outboxKey(session.scope!));
  assertSession(session);
  const entries = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(entries) || entries.some(entry => !entry.id || !entry.payload || !Array.isArray(entry.pendingMedia))) throw new Error('无法读取待同步记录，请保留本机数据');
  return entries;
}
async function mutate<T>(session: Session, change: (entries: QueuedSubmission[]) => T): Promise<T> {
  return serializeOutboxWrite(async () => {
    const entries = await read(session);
    const result = change(entries);
    // Keep a small receipt history; original local files are no longer needed after success.
    let receipts = 0;
    for (let index = entries.length - 1; index >= 0; index--) {
      if (entries[index].state !== 'synced') continue;
      entries[index].draft = undefined;
      entries[index].conflict = undefined;
      entries[index].pendingMedia = [];
      if (++receipts > 20) entries.splice(index, 1);
    }
    assertSession(session);
    await AsyncStorage.setItem(outboxKey(session.scope!), JSON.stringify(entries));
    assertSession(session);
    listeners.forEach(listener => listener());
    return result;
  });
}
export async function listOutbox(session = getSession()) {
  if (!session.scope) return [];
  await waitForOutboxWrites();
  return read(session);
}
export async function enqueueSubmission(input: SubmissionInput, session = getSession()): Promise<QueuedSubmission> {
  return mutate(session, entries => {
    const duplicate = entries.find(entry => input.id ? entry.id === input.id : entry.sourceDraftKey === input.sourceDraftKey && entry.state !== 'synced');
    if (duplicate) {
      if (JSON.stringify(duplicate.payload) !== JSON.stringify(input.payload)) throw new Error('这份草稿已有待同步内容，请先在待同步记录中处理');
      return duplicate;
    }
    const entry: QueuedSubmission = JSON.parse(JSON.stringify({ ...input,
      id: input.id || `mobile_queue_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`,
      state: 'queued', createdAt: new Date().toISOString(),
    }));
    entries.push(entry);
    return entry;
  });
}
async function patch(id: string, changes: Partial<QueuedSubmission>, session: Session) {
  return mutate(session, entries => {
    const entry = entries.find(item => item.id === id);
    if (!entry) throw new Error('待同步记录不存在');
    Object.assign(entry, changes);
    return entry;
  });
}
export function retrySubmission(id: string, resolvedVersion?: string, session = getSession()) {
  return mutate(session, entries => {
    const entry = entries.find(item => item.id === id);
    if (!entry || entry.state === 'synced' || entry.state === 'syncing') return;
    if (entry.state === 'conflict' && (!resolvedVersion || resolvedVersion !== entry.conflict?.updatedAt)) throw new Error('请先查看并确认最新版本');
    if (resolvedVersion) { entry.expectedUpdatedAt = resolvedVersion; entry.attempted = false; }
    entry.state = 'queued'; entry.error = undefined; entry.conflict = undefined;
  });
}
/** Editing is allowed only after a definitive failure, never after an ambiguous network response. */
export function reviseFailedSubmission(id: string, input: SubmissionInput, session = getSession()) {
  return mutate(session, entries => {
    const entry = entries.find(item => item.id === id);
    if (!entry || entry.state !== 'failed') throw new Error('这条记录仍在同步，请先核对结果');
    Object.assign(entry, JSON.parse(JSON.stringify(input)), { id, state: 'queued', attempted: false, error: undefined });
    return entry;
  });
}
export function isRetryableSubmissionError(error: any) {
  return !error?.status || error.status >= 500 || [408, 429].includes(error.status);
}
function matchesRecord(entry: QueuedSubmission, record: BBTalk) {
  const p = entry.payload;
  return record.content === p.content && record.visibility === (p.visibility || 'private') &&
    JSON.stringify(record.tags.map(tag => tag.name).sort()) === JSON.stringify([...(p.tags || [])].sort()) &&
    JSON.stringify(record.attachments.map(att => att.uid)) === JSON.stringify((p.attachments || []).map(att => att.uid)) &&
    Object.entries(p.context || {}).every(([key, value]) => key === 'source' || JSON.stringify(record.context?.[key]) === JSON.stringify(value)) &&
    (!!p.context?.location === !!record.context?.location);
}
async function run(session: Session, canRun: () => boolean) {
  for (let entry of await listOutbox(session)) {
    if (!isCurrentSession(session) || !canRun()) return;
    if (!['queued', 'syncing'].includes(entry.state)) continue;
    try {
      await clearTransferredDraft(entry.sourceDraftKey, entry.draft, session);
      entry = await patch(entry.id, { state: 'syncing', error: undefined }, session);
      while (entry.pendingMedia.length) {
        if (!canRun()) { await patch(entry.id, { state: 'queued' }, session); return; }
        assertSession(session);
        const media = entry.pendingMedia[0];
        const attachment = await uploadRetainedMedia(media, session);
        assertSession(session);
        entry = await patch(entry.id, { payload: { ...entry.payload, attachments: [...(entry.payload.attachments || []), attachment] }, pendingMedia: entry.pendingMedia.slice(1) }, session);
      }
      assertSession(session);
      if (!canRun()) { await patch(entry.id, { state: 'queued' }, session); return; }
      let record: BBTalk;
      // A lost PATCH response can be distinguished from a conflicting remote edit.
      if (entry.recordId && entry.attempted) {
        const current = await bbtalkApi.getBBTalk(entry.recordId);
        assertSession(session);
        if (matchesRecord(entry, current)) {
          await patch(entry.id, { state: 'synced', record: current, error: undefined }, session); notifyRecordsChanged(); continue;
        }
      }
      entry = await patch(entry.id, { attempted: true }, session);
      if (entry.recordId) {
        record = await bbtalkApi.updateBBTalk(entry.recordId, {
          ...entry.payload, tags: (entry.payload.tags || []).map(name => ({ id: '', name, color: '', sortOrder: 0, bbtalkCount: 0 })),
        }, entry.expectedUpdatedAt);
      } else record = await bbtalkApi.createBBTalk({ ...entry.payload, submissionKey: entry.id });
      assertSession(session);
      await patch(entry.id, { state: 'synced', record, error: undefined }, session);
      notifyRecordsChanged();
    } catch (error: any) {
      if (!isCurrentSession(session)) return;
      if (error?.code === 'edit_conflict' && error.current) {
        const conflict = error.current.uid ? transformBBTalk(error.current) : error.current;
        await patch(entry.id, { state: 'conflict', error: '另一端已修改，请比较后再决定', conflict }, session);
      } else {
        const retryable = isRetryableSubmissionError(error);
        await patch(entry.id, { state: retryable ? 'queued' : 'failed', error: error?.message || '同步未完成，内容保留在本机' }, session);
        if (retryable) return;
      }
    }
  }
}
export function drainOutbox(session = getSession(), canRun: () => boolean = () => true): Promise<void> {
  if (!session.scope || !isCurrentSession(session) || !canRun()) return Promise.resolve();
  const existing = workers.get(session.generation);
  if (existing) return existing;
  const work = run(session, canRun).finally(() => { if (workers.get(session.generation) === work) workers.delete(session.generation); });
  workers.set(session.generation, work);
  return work;
}
