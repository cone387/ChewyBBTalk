import AsyncStorage from '@react-native-async-storage/async-storage';
import { enqueueSubmission, listOutbox, drainOutbox, retrySubmission } from '../../src/services/outbox';
import { setSession, clearSession, getSession } from '../../src/services/session';
import { bbtalkApi } from '../../src/services/api/bbtalkApi';
import { uploadRetainedMedia } from '../../src/services/pendingMedia';
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../../src/services/api/bbtalkApi', () => ({ bbtalkApi: { createBBTalk: jest.fn(), updateBBTalk: jest.fn(), getBBTalk: jest.fn() } }));
jest.mock('../../src/services/pendingMedia', () => ({ uploadRetainedMedia: jest.fn() }));
const record = { id: 'record', content: '地铁上的记录', visibility: 'private', tags: [], attachments: [], context: {}, updatedAt: 'v2' };
const input = () => ({ payload: { content: '地铁上的记录', visibility: 'private' as const, tags: [], attachments: [] }, pendingMedia: [], sourceDraftKey: `compose_draft:${getSession().scope}` });
beforeEach(async () => {
  jest.clearAllMocks(); Object.values(bbtalkApi).forEach(fn => (fn as jest.Mock).mockReset());
  (uploadRetainedMedia as jest.Mock).mockReset();
  await AsyncStorage.clear(); clearSession(); setSession('https://outbox.example', 'owner');
});

test('persists before sending and reuses the same create identity after a lost response', async () => {
  const entry = await enqueueSubmission(input());
  expect((await listOutbox())[0].state).toBe('queued');
  expect(bbtalkApi.createBBTalk).not.toHaveBeenCalled();
  (bbtalkApi.createBBTalk as jest.Mock).mockRejectedValueOnce(new Error('response lost')).mockResolvedValueOnce(record);
  await drainOutbox();
  expect((await listOutbox())[0].state).toBe('queued');
  await drainOutbox();
  expect((await listOutbox())[0]).toMatchObject({ state: 'synced', record });
  expect((bbtalkApi.createBBTalk as jest.Mock).mock.calls.map(call => call[0].submissionKey)).toEqual([entry.id, entry.id]);
});

test('single worker persists uploaded attachments and retries without uploading them again', async () => {
  const media = { id: 'photo', uri: 'file:///photo', mime: 'image/jpeg', name: 'photo.jpg' };
  const uploaded = { uid: 'photo', type: 'image', url: '/photo' };
  await enqueueSubmission({ ...input(), pendingMedia: [media] });
  (uploadRetainedMedia as jest.Mock).mockResolvedValue(uploaded);
  (bbtalkApi.createBBTalk as jest.Mock).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(record);
  await Promise.all([drainOutbox(), drainOutbox()]);
  expect((await listOutbox())[0].pendingMedia).toEqual([]);
  await drainOutbox();
  expect(uploadRetainedMedia).toHaveBeenCalledTimes(1);
  expect((bbtalkApi.createBBTalk as jest.Mock).mock.calls.at(-1)[0].attachments).toEqual([uploaded]);
});

test('conflicts preserve both versions and never retry until explicitly resolved', async () => {
  const entry = await enqueueSubmission({ ...input(), recordId: 'record', expectedUpdatedAt: 'v1' });
  (bbtalkApi.updateBBTalk as jest.Mock).mockRejectedValueOnce({ code: 'edit_conflict', status: 409, current: { ...record, content: '另一端修改' } });
  await drainOutbox(); await drainOutbox();
  expect(bbtalkApi.updateBBTalk).toHaveBeenCalledTimes(1);
  expect((await listOutbox())[0]).toMatchObject({ state: 'conflict', payload: { content: '地铁上的记录' }, conflict: { content: '另一端修改' } });
  await retrySubmission(entry.id, 'v2');
  (bbtalkApi.updateBBTalk as jest.Mock).mockResolvedValueOnce(record);
  await drainOutbox();
  expect((bbtalkApi.updateBBTalk as jest.Mock).mock.calls.at(-1)[2]).toBe('v2');
  expect((await listOutbox())[0].state).toBe('synced');
});

test('switching accounts during upload stops the old submission and preserves it for its owner', async () => {
  const owner = getSession();
  await enqueueSubmission({ ...input(), pendingMedia: [{ id: 'p', uri: 'file:///p', name: 'p.jpg', mime: 'image/jpeg' }] });
  (uploadRetainedMedia as jest.Mock).mockImplementation(async () => { setSession('https://outbox.example', 'other'); return { uid: 'p' }; });
  await drainOutbox(owner);
  expect(bbtalkApi.createBBTalk).not.toHaveBeenCalled();
  expect(await listOutbox()).toEqual([]);
  setSession('https://outbox.example', 'owner');
  expect((await listOutbox())[0].pendingMedia).toHaveLength(1);
});

test('disk failure rejects enqueue and sends nothing; validation errors remain actionable', async () => {
  (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
  await expect(enqueueSubmission(input())).rejects.toThrow('disk full');
  expect(bbtalkApi.createBBTalk).not.toHaveBeenCalled();
  await enqueueSubmission(input());
  (bbtalkApi.createBBTalk as jest.Mock).mockRejectedValue({ status: 422, message: '正文过长' });
  await drainOutbox(); await drainOutbox();
  expect(bbtalkApi.createBBTalk).toHaveBeenCalledTimes(1);
  expect((await listOutbox())[0]).toMatchObject({ state: 'failed', error: '正文过长' });
});

test('successful receipts release retained draft data and bound history without dropping pending work', async () => {
  (bbtalkApi.createBBTalk as jest.Mock).mockResolvedValue(record);
  for (let index = 0; index < 25; index++) {
    await enqueueSubmission({ ...input(), id: `entry_${index}`, draft: { content: 'saved', pendingMedia: [{ uri: 'data:large-original' }] } });
    await drainOutbox();
  }
  await enqueueSubmission({ ...input(), id: 'still-pending' });
  const entries = await listOutbox();
  expect(entries.filter(entry => entry.state === 'synced')).toHaveLength(20);
  expect(entries.find(entry => entry.id === 'still-pending')?.state).toBe('queued');
  expect(JSON.stringify(entries)).not.toContain('data:large-original');
});
