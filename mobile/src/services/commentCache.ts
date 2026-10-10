import { bbtalkApi } from './api/bbtalkApi';
import { getSession, isCurrentSession, onSessionChange } from './session';
import type { Comment } from '../types';

export interface CommentEntry {
  revision?: string;
  pageRevision?: string;
  mutation: number;
  comments: Comment[];
  page: number;
  next: boolean;
  loaded: boolean;
  touched: number;
  pending?: Promise<void>;
  deleted: Set<string>;
  added: Map<string, Comment>;
}
const entries = new Map<string, CommentEntry>();
onSessionChange(() => entries.clear());

export function commentEntry(id: string, preview?: Comment[], revision?: string): CommentEntry {
  let entry = entries.get(id);
  if (!entry || entry.revision !== revision || Date.now() - entry.touched > 5 * 60_000) {
    entry = { revision, mutation: 0, comments: preview ?? [], page: 0, next: true, loaded: preview !== undefined,
      touched: Date.now(), deleted: new Set(), added: new Map() };
    entries.set(id, entry);
  }
  entry.touched = Date.now();
  entries.delete(id); entries.set(id, entry);
  while (entries.size > 100) entries.delete(entries.keys().next().value!);
  return entry;
}

export function invalidateCommentPages(entry: CommentEntry): void {
  entry.mutation++;
  entry.page = 0;
}

export async function loadCommentEntry(id: string, entry: CommentEntry, legacy: boolean): Promise<void> {
  if (entry.pending) return entry.pending;
  const session = getSession();
  const page = entry.page + 1;
  const mutation = entry.mutation;
  const request = (async () => {
    const result = legacy
      ? { results: await bbtalkApi.getComments(id), next: null, revision: entry.revision }
      : await bbtalkApi.getCommentPage(id, page);
    if (!isCurrentSession(session) || entries.get(id) !== entry) return;
    // A collection changed between pages. Restart from page one on the next action.
    if (page > 1 && result.revision && result.revision !== entry.pageRevision) {
      entry.page = 0; entry.next = true;
      throw new Error('评论已更新，请重新加载');
    }
    const merged = new Map((page > 1 ? entry.comments : []).map(c => [c.uid, c]));
    result.results.forEach(c => { if (!entry.deleted.has(c.uid)) merged.set(c.uid, c); });
    entry.added.forEach(c => merged.set(c.uid, c));
    entry.comments = [...merged.values()];
    entry.pageRevision = result.revision;
    entry.page = mutation === entry.mutation ? page : 0;
    entry.next = !!result.next || (mutation !== entry.mutation && page > 1);
    entry.loaded = true;
  })();
  entry.pending = request;
  try { await request; } finally { if (entry.pending === request) entry.pending = undefined; }
}
