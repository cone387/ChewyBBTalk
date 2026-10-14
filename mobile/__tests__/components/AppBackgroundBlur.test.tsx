jest.mock('react-native', () => {
  const listeners: any[] = [];
  return { View: 'View', Text: 'Text', StyleSheet: { absoluteFillObject: {} }, Platform: { OS: 'ios' },
    AppState: { currentState: 'active', addEventListener: jest.fn((_type, callback) => { listeners.push(callback); return { remove: jest.fn() }; }) }, __listeners: listeners };
});
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('expo-screen-capture', () => ({ enableAppSwitcherProtectionAsync: jest.fn(async () => {}), disableAppSwitcherProtectionAsync: jest.fn(async () => {}) }));
jest.mock('../../src/services/nativePrivacy', () => ({ setAppPreviewProtection: jest.fn(async () => {}), getPrivacyPreviewRevision: jest.fn(async () => 0), resumePrivacyPreview: jest.fn(async () => {}) }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(async () => null) }));
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AppBackgroundBlur from '../../src/components/AppBackgroundBlur';
import { setHistoryPrivacySuspended, setHistoryPrivacyResumePending } from '../../src/services/historyPrivacy';
import { notifyPrivacyPreferencesChanged } from '../../src/services/privacyPreferences';
const { create, act } = require('react-test-renderer');
const RN = require('react-native');
const native = require('../../src/services/nativePrivacy');
let tree: any;
beforeEach(() => { jest.clearAllMocks(); native.setAppPreviewProtection.mockResolvedValue(undefined); native.getPrivacyPreviewRevision.mockResolvedValue(0); global.requestAnimationFrame = jest.fn(() => 1); global.cancelAnimationFrame = jest.fn(); RN.AppState.currentState = 'active'; RN.__listeners.length = 0; setHistoryPrivacySuspended(false); setHistoryPrivacyResumePending(false); (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null); });
afterEach(async () => { await act(async () => tree?.unmount()); tree = undefined; });
const mount = async () => { await act(async () => { tree = create(<AppBackgroundBlur />); }); };
const fire = async (state: string) => { await act(async () => { RN.AppState.currentState = state; RN.__listeners.forEach((callback: any) => callback(state)); }); };
test('background preview uses blur without the opaque black curtain', async () => {
  await mount(); await fire('inactive');
  expect(tree.root.findByType('BlurView').props.intensity).toBe(100);
  expect(tree.root.findByType('View').props.style.backgroundColor).toBeUndefined();
  await fire('active');
  expect(tree.toJSON()).toBeNull();
  expect(native.setAppPreviewProtection).toHaveBeenCalledWith(true);
});
test('foreground waits for the lock decision behind a blur, never an empty page', async () => {
  await mount(); await act(async () => setHistoryPrivacySuspended(true)); await fire('background');
  native.resumePrivacyPreview.mockClear(); await fire('active');
  expect(tree.root.findByType('BlurView')).toBeTruthy();
  expect(native.resumePrivacyPreview).not.toHaveBeenCalled();
  await act(async () => setHistoryPrivacySuspended(false));
  expect(tree.toJSON()).toBeNull();
});
test('preview protection can be disabled independently', async () => {
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue('false');
  await mount(); await fire('background');
  expect(tree.toJSON()).toBeNull();
  expect(native.setAppPreviewProtection).toHaveBeenCalledWith(false);
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue('true');
  await act(async () => notifyPrivacyPreferencesChanged());
  expect(tree.root.findByType('BlurView')).toBeTruthy();
});
test('batched background and active events still schedule a fresh native release', async () => {
  await mount();
  (global.requestAnimationFrame as jest.Mock).mockClear();
  await act(async () => {
    RN.__listeners.forEach((callback: any) => callback('background'));
    RN.__listeners.forEach((callback: any) => callback('active'));
  });
  expect(global.requestAnimationFrame).toHaveBeenCalledTimes(1);
  native.resumePrivacyPreview.mockClear();
  await act(async () => { (global.requestAnimationFrame as jest.Mock).mock.calls[0][0](); });
  expect(native.resumePrivacyPreview).toHaveBeenCalledTimes(1);
});
test('stale preference reads cannot reenable preview after a newer save', async () => {
  let finish!: (value: string) => void;
  (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await mount();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue('false');
  await act(async () => notifyPrivacyPreferencesChanged());
  await act(async () => finish('true')); await fire('background');
  expect(tree.toJSON()).toBeNull();
  expect(native.setAppPreviewProtection).toHaveBeenLastCalledWith(false);
});

test('an old queued release cannot uncover a later foreground before its lock decision', async () => {
  let finishNative!: () => void;
  native.setAppPreviewProtection.mockImplementationOnce(() => new Promise<void>(resolve => { finishNative = resolve; }));
  native.getPrivacyPreviewRevision.mockResolvedValue(10);
  await mount();
  await act(async () => { (global.requestAnimationFrame as jest.Mock).mock.calls.at(-1)[0](); });
  await fire('background');
  await act(async () => setHistoryPrivacyResumePending(true));
  await fire('active');
  await act(async () => finishNative());
  expect(native.resumePrivacyPreview).not.toHaveBeenCalled();
  expect(tree.root.findByType('BlurView')).toBeTruthy();
  native.getPrivacyPreviewRevision.mockResolvedValue(11);
  await act(async () => setHistoryPrivacyResumePending(false));
  await act(async () => { (global.requestAnimationFrame as jest.Mock).mock.calls.at(-1)[0](); });
  expect(native.resumePrivacyPreview).toHaveBeenCalledTimes(1);
  expect(native.resumePrivacyPreview).toHaveBeenCalledWith(11);
});

test('an inactive resume waits for its native state query without suspending content operations', async () => {
  await mount(); await fire('inactive');
  (global.requestAnimationFrame as jest.Mock).mockClear();
  await act(async () => setHistoryPrivacyResumePending(true));
  await fire('active');
  expect(global.requestAnimationFrame).not.toHaveBeenCalled();
  expect(tree.root.findByType('BlurView')).toBeTruthy();
  await act(async () => setHistoryPrivacyResumePending(false));
  expect(global.requestAnimationFrame).toHaveBeenCalledTimes(1);
});
