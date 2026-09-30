jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Linking: { openURL: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(), setItem: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-constants', () => ({
  expoConfig: { version: '1.3.5', ios: { bundleIdentifier: 'com.example.bbtalk' } },
}));
jest.mock('expo-updates', () => ({
  isEnabled: true,
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn().mockResolvedValue({}),
  reloadAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/utils/crossAlert', () => ({ xConfirm: jest.fn() }));

import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import { xConfirm } from '../../src/utils/crossAlert';
import { checkForUpdates, compareVersions } from '../../src/utils/versionChecker';

const originalFetch = global.fetch;
const originalDev = (global as any).__DEV__;
const fetchMock = jest.fn();
const cooldownKey = 'version_check_cooldown_timestamp';

function storeResponse(version = '1.3.5') {
  return { ok: true, json: async () => ({
    resultCount: 1, results: [{ version, trackViewUrl: 'https://example.com/app' }],
  }) };
}

beforeEach(() => {
  jest.clearAllMocks();
  (global as any).__DEV__ = false;
  global.fetch = fetchMock;
  fetchMock.mockReset().mockResolvedValue(storeResponse());
  (Platform as any).OS = 'ios';
  (Updates as any).isEnabled = true;
  (Updates.checkForUpdateAsync as jest.Mock).mockReset().mockResolvedValue({ isAvailable: false });
  (Updates.fetchUpdateAsync as jest.Mock).mockReset().mockResolvedValue({});
  (AsyncStorage.getItem as jest.Mock).mockReset().mockResolvedValue(null);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());
afterAll(() => {
  global.fetch = originalFetch;
  (global as any).__DEV__ = originalDev;
});

describe('compareVersions', () => {
  it.each([
    ['1.10.0', '1.9.9', 1], ['2.0', '1.99.99', 1],
    ['1.3.4', '1.3.5', -1], ['1.3', '1.3.0', 0], ['1.3.5', '1.3.5', 0],
  ])('compares %s with %s numerically', (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
  });
});

describe('checkForUpdates', () => {
  it('reports current only after a successful store lookup', async () => {
    expect(await checkForUpdates(true)).toBe('current');
    expect(fetchMock).toHaveBeenCalledWith('https://itunes.apple.com/lookup?bundleId=com.example.bbtalk');
    expect(xConfirm).not.toHaveBeenCalled();
  });

  it.each(['http', 'network', 'json'])('reports an error for a %s failure and permits retry', async (failure) => {
    if (failure === 'http') fetchMock.mockResolvedValueOnce({ ok: false });
    if (failure === 'network') fetchMock.mockRejectedValueOnce(new Error('offline'));
    if (failure === 'json') fetchMock.mockResolvedValueOnce({ ok: true, json: async () => { throw new Error('invalid JSON'); } });
    expect(await checkForUpdates()).toBe('error');
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(xConfirm).not.toHaveBeenCalled();
    expect(await checkForUpdates()).toBe('current');
  });

  it('reports unavailable for an empty store lookup', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ resultCount: 0, results: [] }) });
    expect(await checkForUpdates(true)).toBe('unavailable');
  });

  it('skips automatic store checks during cooldown but lets manual checks through', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(new Date().toISOString());
    expect(await checkForUpdates()).toBe('skipped');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await checkForUpdates(true)).toBe('current');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('checks again after cooldown expires or storage cannot be read', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(new Date(Date.now() - 25 * 3600000).toISOString());
    expect(await checkForUpdates()).toBe('current');
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('storage unavailable'));
    expect(await checkForUpdates()).toBe('current');
  });

  it('opens the store on confirmation and applies cooldown only on decline', async () => {
    fetchMock.mockResolvedValue(storeResponse('1.4.0'));
    expect(await checkForUpdates(true)).toBe('updated');
    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    const [, , confirm, cancel] = (xConfirm as jest.Mock).mock.calls[0];
    await confirm();
    expect(Linking.openURL).toHaveBeenCalledWith('https://example.com/app');
    await cancel();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(cooldownKey, expect.any(String));
  });

  it('downloads OTA before offering restart, even during store cooldown', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(new Date().toISOString());
    (Updates.checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: true });
    expect(await checkForUpdates()).toBe('updated');
    expect(Updates.fetchUpdateAsync).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(Updates.reloadAsync).not.toHaveBeenCalled();
    await (xConfirm as jest.Mock).mock.calls[0][2]();
    expect(Updates.reloadAsync).toHaveBeenCalledTimes(1);
  });

  it.each(['check', 'download'])('does not report current or ready after an OTA %s failure', async (failure) => {
    if (failure === 'check') (Updates.checkForUpdateAsync as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    else {
      (Updates.checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: true });
      (Updates.fetchUpdateAsync as jest.Mock).mockRejectedValueOnce(new Error('download failed'));
    }
    expect(await checkForUpdates(true)).toBe('error');
    expect(xConfirm).not.toHaveBeenCalled();
    expect(Updates.reloadAsync).not.toHaveBeenCalled();
  });

  it.each(['web', 'android'])('does not claim the %s store version is current', async (platform) => {
    (Platform as any).OS = platform;
    expect(await checkForUpdates(true)).toBe('unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
    if (platform === 'web') expect(Updates.checkForUpdateAsync).not.toHaveBeenCalled();
  });

  it.each(['development', 'disabled'])('skips OTA in %s mode while still checking the iOS store', async (mode) => {
    if (mode === 'development') (global as any).__DEV__ = true;
    else (Updates as any).isEnabled = false;
    expect(await checkForUpdates(true)).toBe('current');
    expect(Updates.checkForUpdateAsync).not.toHaveBeenCalled();
  });
});
