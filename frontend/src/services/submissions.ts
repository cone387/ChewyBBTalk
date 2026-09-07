import { openDraftDatabase, DraftConflictError } from './drafts'
import type { Attachment } from '../types'

export interface PublishInput {
  content: string
  tags: string[]
  attachments: Attachment[]
  visibility: 'public' | 'private' | 'friends'
  context?: Record<string, unknown>
}
export interface SubmissionIntent {
  key: string
  payload: PublishInput
  state: 'pending' | 'confirmed'
}
export async function readSubmission(scope: string) {
  const db = await openDraftDatabase()
  try { return await db.get('intents', scope) } finally { db.close() }
}
export async function beginSubmission(scope: string, payload: PublishInput, draftRevision: string | null): Promise<SubmissionIntent> {
  const db = await openDraftDatabase()
  try {
    const tx = db.transaction(['drafts', 'intents'], 'readwrite')
    void tx.done.catch(() => {})
    const draft = await tx.objectStore('drafts').get(scope)
    if ((draft?.revision ?? null) !== draftRevision || !draft?.data) {
      await tx.done
      throw new DraftConflictError()
    }
    const store = tx.objectStore('intents')
    const current = await store.get(scope)
    if (current && JSON.stringify(current.payload) === JSON.stringify(payload)) {
      await tx.done
      return current
    }
    if (current?.state === 'pending') {
      await tx.done
      throw new Error('还有一份发布结果未确认，请先核对或重试原提交；当前修改已保留。')
    }
    const intent: SubmissionIntent = { key: Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join(''), payload, state: 'pending' }
    await store.put(intent, scope)
    await tx.done
    return intent
  } finally { db.close() }
}
export async function confirmSubmission(scope: string, key: string) {
  const db = await openDraftDatabase()
  try {
    const tx = db.transaction('intents', 'readwrite')
    void tx.done.catch(() => {})
    const current = await tx.store.get(scope)
    if (current?.key === key) await tx.store.put({ ...current, state: 'confirmed' }, scope)
    await tx.done
  } finally { db.close() }
}
// Only called after successful draft cleanup or an explicit user clear.
export async function forgetConfirmedSubmission(scope: string, key: string) {
  const db = await openDraftDatabase()
  try {
    const tx = db.transaction('intents', 'readwrite')
    void tx.done.catch(() => {})
    const current = await tx.store.get(scope)
    if (current?.key === key && current.state === 'confirmed') await tx.store.delete(scope)
    await tx.done
  } finally { db.close() }
}
