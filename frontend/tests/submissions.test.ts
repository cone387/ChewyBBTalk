import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DraftConflictError, writeDraft, type DraftData } from '../src/services/drafts';
import { beginSubmission, confirmSubmission, discardSubmission, forgetConfirmedSubmission, readSubmission, type PublishInput } from '../src/services/submissions';

const draft: DraftData = { content: 'body', tags: [], attachments: [], uploads: [], visibility: 'private', location: null };
const payload: PublishInput = { content: 'body', tags: [], attachments: [], visibility: 'private' };
beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()));
afterEach(() => vi.unstubAllGlobals());
async function start(scope = 'alice') {
  const record = await writeDraft(scope, draft, null);
  return { revision: record.revision, intent: await beginSubmission(scope, payload, record.revision) };
}
it('rejects publication if no durable draft exists', async () => {
  await expect(beginSubmission('alice', payload, null)).rejects.toBeInstanceOf(DraftConflictError);
  expect(await readSubmission('alice')).toBeUndefined();
});
it('rejects a cleared draft even when its tombstone revision matches', async () => {
  const record = await writeDraft('alice', null, null);
  await expect(beginSubmission('alice', payload, record.revision)).rejects.toBeInstanceOf(DraftConflictError);
});
it('rejects a draft changed by another tab without replacing the existing intent', async () => {
  const { revision, intent } = await start();
  await writeDraft('alice', { ...draft, content: 'another tab' }, revision);
  await expect(beginSubmission('alice', payload, revision)).rejects.toBeInstanceOf(DraftConflictError);
  expect((await readSubmission('alice'))?.key).toBe(intent.key);
});
it('concurrent attempts for the same payload share exactly one identity', async () => {
  const record = await writeDraft('alice', draft, null);
  const [first, second] = await Promise.all([
    beginSubmission('alice', payload, record.revision), beginSubmission('alice', payload, record.revision),
  ]);
  expect(first.key).toMatch(/^[a-f0-9]{32}$/);
  expect(first).toEqual(second);
  expect(await readSubmission('alice')).toEqual(first);
});
it('does not overwrite an unknown publication with a different payload', async () => {
  const { revision, intent } = await start();
  await expect(beginSubmission('alice', { ...payload, content: 'changed' }, revision)).rejects.toThrow('先核对或重试原提交');
  expect(await readSubmission('alice')).toEqual(intent);
});
it('keeps a confirmed identity for unchanged payload and gives a different payload a new identity', async () => {
  const { revision, intent } = await start(); await confirmSubmission('alice', intent.key);
  expect((await beginSubmission('alice', payload, revision)).key).toBe(intent.key);
  const changed = await beginSubmission('alice', { ...payload, content: 'changed' }, revision);
  expect(changed.key).not.toBe(intent.key);
  expect(changed.state).toBe('pending');
});
it('cannot confirm a different publication or a nonexistent scope', async () => {
  const { intent } = await start();
  await confirmSubmission('alice', 'different-key'); await confirmSubmission('missing', intent.key);
  expect((await readSubmission('alice'))?.state).toBe('pending');
  expect(await readSubmission('missing')).toBeUndefined();
});
it('cannot forget a pending publication or a confirmed publication with another key', async () => {
  const { intent } = await start();
  await forgetConfirmedSubmission('alice', intent.key);
  expect((await readSubmission('alice'))?.state).toBe('pending');
  await confirmSubmission('alice', intent.key);
  await forgetConfirmedSubmission('alice', 'different-key');
  expect((await readSubmission('alice'))?.state).toBe('confirmed');
  await forgetConfirmedSubmission('missing', intent.key);
  expect(await readSubmission('missing')).toBeUndefined();
});
it('forgets a confirmed publication only after matching its original identity', async () => {
  const { intent } = await start(); await confirmSubmission('alice', intent.key);
  await forgetConfirmedSubmission('alice', intent.key);
  expect(await readSubmission('alice')).toBeUndefined();
});
it('isolates accounts when explicitly discarding a pending intent', async () => {
  await start('alice'); const bob = await start('bob');
  await discardSubmission('alice');
  expect(await readSubmission('alice')).toBeUndefined();
  expect(await readSubmission('bob')).toEqual(bob.intent);
});
it('stores a snapshot so later caller changes cannot mutate the original submission', async () => {
  const record = await writeDraft('alice', draft, null);
  const mutable = { ...payload, tags: ['Work'] };
  await beginSubmission('alice', mutable, record.revision);
  mutable.content = 'later'; mutable.tags.push('Life');
  expect((await readSubmission('alice'))?.payload).toMatchObject({ content: 'body', tags: ['Work'] });
});
