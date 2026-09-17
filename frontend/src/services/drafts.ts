import { openDB, type DBSchema } from 'idb'
import type { Attachment } from '../types'
import type { UploadItem } from '../hooks/useAttachmentUploads'
import type { SubmissionIntent } from './submissions'

export interface DraftData {
  content: string
  tags: string[]
  visibility: 'public' | 'private' | 'friends'
  attachments: Attachment[]
  uploads: UploadItem[]
  location: { latitude: number; longitude: number } | null
  baseUpdatedAt?: string
}

export interface DraftRecord {
  revision: string
  updatedAt: number
  // A tombstone preserves the revision after deletion, preventing stale tabs
  // from recreating a draft they loaded before it was published or discarded.
  data: DraftData | null
}

interface DraftDatabase extends DBSchema {
  drafts: { key: string; value: DraftRecord }
  intents: { key: string; value: SubmissionIntent }
}

export class DraftConflictError extends Error {
  constructor() {
    super('另一标签页已修改或清除了此草稿。当前输入仍保留，请复制内容后刷新核对。')
  }
}

export function draftKey(server: string, userId: number, recordId?: string | number) {
  const url = new URL(server || '/', window.location.origin)
  return JSON.stringify([url.origin, url.pathname.replace(/\/+$/, ''), userId, recordId == null ? 'new' : `edit:${recordId}`])
}

export function openDraftDatabase() {
  return openDB<DraftDatabase>('ChewyBBTalkDrafts', 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) db.createObjectStore('drafts')
      if (oldVersion < 2) db.createObjectStore('intents')
    },
  })
}

export async function readDraft(key: string): Promise<DraftRecord | undefined> {
  const db = await openDraftDatabase()
  try { return await db.get('drafts', key) } finally { db.close() }
}

export async function writeDraft(key: string, data: DraftData | null, expectedRevision: string | null): Promise<DraftRecord> {
  const db = await openDraftDatabase()
  try {
    const tx = db.transaction('drafts', 'readwrite')
    // Requests and transaction completion can reject separately on quota errors.
    void tx.done.catch(() => {})
    const current = await tx.store.get(key)
    if ((current?.revision ?? null) !== expectedRevision) {
      await tx.done
      throw new DraftConflictError()
    }
    // getRandomValues also works for self-hosted HTTP origins.
    const revision = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
    const record: DraftRecord = { revision, updatedAt: Date.now(), data }
    await tx.store.put(record, key)
    await tx.done
    return record
  } finally { db.close() }
}
