jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-modules-core', () => ({ requireOptionalNativeModule: jest.fn() }));

import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
import { getDeviceLockState, onDeviceLock, setAppPreviewProtection, getPrivacyPreviewRevision, resumePrivacyPreview } from '../../src/services/nativePrivacy';

const load = requireOptionalNativeModule as jest.Mock;
const unsupported = { revision: 0, locked: false, supported: false };

beforeEach(() => { jest.clearAllMocks(); Platform.OS = 'ios'; load.mockReturnValue(null); });

it('returns explicit unsupported state in old binaries, Expo Go and web', async () => {
  expect(await getDeviceLockState()).toEqual(unsupported);
  load.mockReturnValue({});
  expect(await getDeviceLockState()).toEqual(unsupported);
  Platform.OS = 'web';
  expect(await getDeviceLockState()).toEqual(unsupported);
  expect(() => onDeviceLock(() => {})()).not.toThrow();
  await setAppPreviewProtection(true);
  expect(await getPrivacyPreviewRevision()).toBeNull();
  await resumePrivacyPreview(null);
});

it('returns retained native revisions even after device unlock', async () => {
  load.mockReturnValue({ getDeviceLockState: async () => ({ revision: 4, locked: false, supported: true }) });
  expect(await getDeviceLockState()).toEqual({ revision: 4, locked: false, supported: true });
});

it('delivers lock events and removes only its own subscription', () => {
  const listeners = new Set<(state: unknown) => void>();
  load.mockReturnValue({
    getDeviceLockState: async () => unsupported,
    addListener: (event: string, listener: (state: unknown) => void) => {
      if (event !== 'onDeviceLock') throw new Error('Wrong event');
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
  });
  const received: unknown[] = [];
  const unsubscribe = onDeviceLock((state) => received.push(state));
  const state = { revision: 1, locked: true, supported: true };
  listeners.forEach((listener) => listener(state));
  listeners.forEach((listener) => listener({ revision: Number.NaN, locked: true, supported: true }));
  unsubscribe();
  listeners.forEach((listener) => listener({ ...state, revision: 2 }));
  expect(received).toEqual([state]);
});

it('propagates errors and invalid snapshots from an existing native bridge', async () => {
  load.mockReturnValue({ getDeviceLockState: async () => ({ revision: -1, locked: true, supported: true }) });
  await expect(getDeviceLockState()).rejects.toThrow('Invalid native device lock state');
  load.mockReturnValue({ getDeviceLockState: async () => { throw new Error('Unavailable'); } });
  await expect(getDeviceLockState()).rejects.toThrow('Unavailable');
});

it('controls only preview policy and acknowledges foreground without capture methods', async () => {
  const applied: (boolean | number)[] = [];
  load.mockReturnValue({
    setAppPreviewProtection: async (enabled: boolean) => { applied.push(enabled); },
    getPrivacyPreviewRevision: async () => 7,
    resumePrivacyPreview: async (revision: number) => { applied.push(revision); },
    preventScreenCapture: () => { throw new Error('Must remain independent'); },
  });
  await setAppPreviewProtection(true);
  const revision = await getPrivacyPreviewRevision();
  await resumePrivacyPreview(null);
  await resumePrivacyPreview(revision);
  await setAppPreviewProtection(false);
  expect(applied).toEqual([true, 7, false]);
});

it('rejects invalid preview revisions instead of acknowledging an unverified curtain', async () => {
  load.mockReturnValue({ getPrivacyPreviewRevision: async () => -1 });
  await expect(getPrivacyPreviewRevision()).rejects.toThrow('Invalid native privacy preview revision');
});
