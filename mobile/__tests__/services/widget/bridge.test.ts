// bridge.ts reads Platform.OS / NativeModules.HomeWidget at call time and
// references the __DEV__ global, so the factory keeps mutable internal state.
jest.mock('react-native', () => {
  const state = { os: 'ios', nativeModules: {} as Record<string, unknown> };
  return {
    __esModule: true,
    get Platform() { return { get OS() { return state.os; } }; },
    get NativeModules() { return state.nativeModules; },
    __state: state,
  };
});

import { isSupported, writeWidgetData, reloadWidget, readWidgetData } from '../../../src/services/widget/bridge';

const RN: any = require('react-native');

const nativeModule = () => ({
  writeWidgetData: jest.fn(() => Promise.resolve()),
  reloadWidget: jest.fn(() => Promise.resolve()),
  readWidgetData: jest.fn(() => Promise.resolve('widget-data')),
});

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  RN.__state.os = 'ios';
  RN.__state.nativeModules = {};
  (global as any).__DEV__ = false;
  warnSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => { warnSpy.mockRestore(); });

describe('isSupported', () => {
  it('requires a native platform and the HomeWidget module', () => {
    RN.__state.nativeModules.HomeWidget = nativeModule();
    expect(isSupported()).toBe(true);
    RN.__state.os = 'android';
    expect(isSupported()).toBe(true);

    RN.__state.nativeModules = {};
    expect(isSupported()).toBe(false);
    RN.__state.os = 'web';
    RN.__state.nativeModules.HomeWidget = nativeModule();
    expect(isSupported()).toBe(false);
    RN.__state.os = 'macos';
    expect(isSupported()).toBe(false);
  });
});

describe('writeWidgetData and reloadWidget', () => {
  it('delegate to the native module', async () => {
    const mod = nativeModule();
    RN.__state.nativeModules.HomeWidget = mod;
    await writeWidgetData('{"v":1}');
    await reloadWidget();
    expect(mod.writeWidgetData).toHaveBeenCalledWith('{"v":1}');
    expect(mod.reloadWidget).toHaveBeenCalledTimes(1);
  });

  it('become silent no-ops without the native module', async () => {
    await writeWidgetData('{}');
    await reloadWidget();
    expect(warnSpy).not.toHaveBeenCalled();

    (global as any).__DEV__ = true;
    await writeWidgetData('{}');
    await reloadWidget();
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });
});

describe('readWidgetData', () => {
  it('returns null without the native module and delegates when present', async () => {
    expect(await readWidgetData()).toBeNull();

    const mod = nativeModule();
    RN.__state.nativeModules.HomeWidget = mod;
    expect(await readWidgetData()).toBe('widget-data');
    expect(mod.readWidgetData).toHaveBeenCalledTimes(1);
  });
});
