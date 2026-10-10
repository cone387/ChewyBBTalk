import { getPublicSetting } from '../../config';
import { getAuthSessionScope, subscribeAuthSession } from '../authSessionScope';
import type { Comment, CommentPage } from '../../types';

export interface CommentSnapshot {
  comments: Comment[];
  count: number;
  loaded: boolean;
  nextPage: number | null;
  revision?: string;
  source: string;
  recordId: string;
}
type Loader = (page: number) => Promise<CommentPage>;

class CommentCache {
  private scope = '';
  private entries = new Map<string, CommentSnapshot>();
  private pending = new Map<string, { entry: CommentSnapshot; promise: Promise<CommentSnapshot> }>();
  private listeners = new Map<string, Set<() => void>>();

  constructor() { subscribeAuthSession(() => this.clear()); }

  private key(id: string, isPublic: boolean): string {
    const scope = JSON.stringify([getPublicSetting('VITE_API_BASE_URL') || window.location.origin, getAuthSessionScope()]);
    if (scope !== this.scope) {
      this.entries.clear();
      this.pending.clear();
      this.scope = scope;
    }
    return JSON.stringify([scope, isPublic, id]);
  }

  subscribe = (id: string, isPublic: boolean, listener: () => void): (() => void) => {
    const key = this.key(id, isPublic);
    const listeners = this.listeners.get(key) || new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(key, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.listeners.delete(key);
    };
  };
  private notify(key?: string) {
    if (key) this.listeners.get(key)?.forEach(listener => listener());
    else this.listeners.forEach(listeners => listeners.forEach(listener => listener()));
  }
  clear(): void { this.entries.clear(); this.pending.clear(); this.notify(); }

  seed(id: string, count: number, preview: Comment[] | undefined, revision: string | undefined, isPublic: boolean): CommentSnapshot {
    const key = this.key(id, isPublic);
    const source = JSON.stringify([revision, count, preview !== undefined]);
    const existing = this.entries.get(key);
    if (existing?.source === source) {
      this.entries.delete(key);
      this.entries.set(key, existing);
      return existing;
    }
    const comments = preview || [];
    const complete = count === 0 || (preview !== undefined && comments.length >= count);
    const entry = { comments, count, source, recordId: id, revision, loaded: complete, nextPage: complete ? null : 1 };
    this.entries.set(key, entry);
    // Bound cross-mount retention. Evicted pending reads cannot repopulate it.
    while (this.entries.size > 200) this.entries.delete(this.entries.keys().next().value!);
    return entry;
  }

  async load(id: string, isPublic: boolean, page: number, loader: Loader): Promise<CommentSnapshot> {
    const key = this.key(id, isPublic);
    const entry = this.entries.get(key);
    if (!entry) throw new Error('评论已失效，请重新加载');
    if (page === 1 && entry.loaded) return entry;
    const requestKey = JSON.stringify([key, entry.source, page]);
    const pending = this.pending.get(requestKey);
    if (pending?.entry === entry) return pending.promise;
    const request = loader(page).then(async data => {
      if (this.key(id, isPublic) !== key || this.entries.get(key) !== entry) {
        throw new Error('评论已失效，请重新加载');
      }
      // Offset pages from different revisions must never be stitched together.
      if (page > 1 && data.revision !== entry.revision) {
        this.entries.set(key, { ...entry, loaded: false, nextPage: 1 });
        return this.load(id, isPublic, 1, loader);
      }
      const comments = page === 1 ? data.results : [...entry.comments, ...data.results];
      const unique = [...new Map(comments.map(comment => [comment.uid, comment])).values()];
      const next = { ...entry, comments: unique, count: data.count, revision: data.revision, loaded: true, nextPage: data.next ? page + 1 : null };
      this.entries.set(key, next);
      this.notify(key);
      return next;
    }).finally(() => {
      if (this.pending.get(requestKey)?.promise === request) this.pending.delete(requestKey);
    });
    this.pending.set(requestKey, { entry, promise: request });
    return request;
  }

  mutate(id: string, isPublic: boolean, change: { add: Comment } | { remove: string }): CommentSnapshot {
    const key = this.key(id, isPublic);
    const entry = this.entries.get(key);
    if (!entry) throw new Error('评论已失效，请重新加载');
    const adding = 'add' in change;
    const present = entry.comments.some(comment => comment.uid === (adding ? change.add.uid : change.remove));
    if ((adding && present) || (!adding && !present)) return entry;
    const comments = adding ? [...entry.comments, change.add] : entry.comments.filter(comment => comment.uid !== change.remove);
    const complete = entry.loaded && entry.nextPage === null;
    const next = { ...entry, comments, count: Math.max(0, entry.count + (adding ? 1 : -1)), loaded: complete, nextPage: complete ? null : 1 };
    this.entries.set(key, next);
    // The same record may also have a public view cached in this session.
    this.entries.delete(this.key(id, !isPublic));
    this.notify(key);
    return next;
  }
}

export const commentCache = new CommentCache();
