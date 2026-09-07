import AsyncStorage from '@react-native-async-storage/async-storage';
import { beginSubmission, readSubmission, confirmSubmission, forgetConfirmedSubmission } from '../../src/services/submissions';
import { setSession, getSession, clearSession } from '../../src/services/session';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const payload = { content: 'original', tags: ['tag'], visibility: 'private' as const, attachments: [] };
beforeEach(async () => { await AsyncStorage.clear(); clearSession(); setSession('https://one.test', 1); });

it('persists the original payload and serializes concurrent attempts with one identity', async () => {
  const [a, b] = await Promise.all([beginSubmission(payload), beginSubmission(payload)]);
  expect(a.key).toBe(b.key);
  expect(await readSubmission()).toEqual(a);
  await expect(beginSubmission({ ...payload, content: 'changed' })).rejects.toThrow('未确认');
  await forgetConfirmedSubmission(a.key);
  expect(await readSubmission()).toEqual(a);
  await confirmSubmission(a.key);
  const changed = await beginSubmission({ ...payload, content: 'changed' });
  expect(changed.key).not.toBe(a.key);
  await forgetConfirmedSubmission(a.key);
  expect((await readSubmission())?.key).toBe(changed.key);
});

it('isolates accounts and servers and refuses work from a stale session', async () => {
  const session = getSession();
  const original = await beginSubmission(payload);
  setSession('https://one.test', 2);
  expect(await readSubmission()).toBeUndefined();
  await expect(beginSubmission(payload, session)).rejects.toThrow('账号已切换');
  setSession('https://two.test', 1);
  expect(await readSubmission()).toBeUndefined();
  setSession('https://one.test', 1);
  expect(await readSubmission()).toEqual(original);
});

it('propagates storage failure before a caller can publish and recovers on retry', async () => {
  jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));
  await expect(beginSubmission(payload)).rejects.toThrow('disk full');
  expect(await readSubmission()).toBeUndefined();
  expect((await beginSubmission(payload)).state).toBe('pending');
});

it('reads the original identity after the module restarts and does not erase an uncertain submission', async () => {
  const original = await beginSubmission(payload);
  const persistentStorage = AsyncStorage;
  jest.resetModules();
  // Restart JS modules while keeping the device's persisted storage.
  jest.doMock('@react-native-async-storage/async-storage', () => persistentStorage);
  const sessionModule = require('../../src/services/session');
  sessionModule.setSession('https://one.test', 1);
  const restarted = require('../../src/services/submissions');
  expect(await restarted.readSubmission()).toEqual(original);
  await restarted.forgetConfirmedSubmission(original.key);
  expect(await restarted.readSubmission()).toEqual(original);
  await restarted.confirmSubmission(original.key);
  await restarted.forgetConfirmedSubmission(original.key);
  expect(await restarted.readSubmission()).toBeUndefined();
});
