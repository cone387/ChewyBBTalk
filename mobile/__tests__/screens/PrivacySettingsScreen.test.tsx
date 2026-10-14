jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', Switch: 'Switch', ScrollView: 'ScrollView',
  TouchableOpacity: 'TouchableOpacity', StyleSheet: { create: (value: unknown) => value },
}));
jest.mock('@react-native-community/slider', () => ({ __esModule: true, default: 'Slider' }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 34 }) }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  multiGet: jest.fn(),
  setItem: jest.fn(),
}));
jest.mock('../../src/theme/ThemeContext', () => ({ useTheme: () => ({ theme: require('../../src/theme/themes').THEMES[0] }) }));
jest.mock('../../src/services/privacyPreferences', () => ({ notifyPrivacyPreferencesChanged: jest.fn() }), { virtual: true });

import React from 'react';
import PrivacySettingsScreen from '../../src/screens/PrivacySettingsScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { notifyPrivacyPreferencesChanged } from '../../src/services/privacyPreferences';

const { create, act } = require('react-test-renderer');

let tree: any;
const settle = async (rounds = 3) => {
  for (let i = 0; i < rounds; i += 1) await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0); }); });
};

const childText = (children: any): string =>
  typeof children === 'string' ? children
    : typeof children === 'number' ? String(children)
      : Array.isArray(children) ? children.map(childText).join('')
        : '';
const hasText = (s: string) => tree.root.findAllByType('Text').some((t: any) => childText(t.props.children) === s);
const switchBy = (label: string) => tree.root.findAllByType('Switch')
  .find((n: any) => n.props.accessibilityLabel === label);
const buttonByText = (s: string) => tree.root.findAllByType('TouchableOpacity')
  .find((n: any) => n.findAllByType('Text').some((t: any) => childText(t.props.children).includes(s)));

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage.multiGet as jest.Mock).mockReset().mockResolvedValue([]);
  (AsyncStorage.setItem as jest.Mock).mockReset().mockResolvedValue(undefined);
});

afterEach(() => { act(() => { tree?.unmount(); }); tree = undefined; });

async function mount() {
  await act(async () => { tree = create(<PrivacySettingsScreen />); });
  await settle();
}

const stored = (entries: Array<[string, string | null]>) =>
  (AsyncStorage.multiGet as jest.Mock).mockResolvedValue(entries);

describe('PrivacySettingsScreen loading', () => {
  it('applies defaults when nothing is stored', async () => {
    await mount();
    expect(AsyncStorage.multiGet).toHaveBeenCalledWith([
      'privacy_enabled', 'privacy_timeout_minutes', 'show_privacy_countdown', 'privacy_allow_compose',
      'privacy_lock_on_launch', 'privacy_lock_on_device_lock', 'privacy_hide_app_preview', 'privacy_block_capture',
    ]);
    expect(switchBy('启用自动锁定')!.props.value).toBe(true);
    expect(switchBy('显示防窥倒计时')!.props.value).toBe(true);
    expect(switchBy('锁定时允许新建')!.props.value).toBe(true);
    expect(switchBy('启动时锁定')!.props.value).toBe(true);
    expect(switchBy('设备锁屏后锁定')!.props.value).toBe(true);
    expect(switchBy('隐藏后台预览')!.props.value).toBe(true);
    expect(switchBy('阻止截图与录屏')!.props.value).toBe(false);
    expect(hasText('5 分钟')).toBe(true);
    expect(hasText('修改后自动保存')).toBe(true);
  });

  it('restores stored values and clamps the timeout into range', async () => {
    stored([['privacy_enabled', 'false'], ['privacy_timeout_minutes', '120'],
      ['show_privacy_countdown', 'false'], ['privacy_allow_compose', 'false']]);
    await mount();
    expect(switchBy('启用自动锁定')!.props.value).toBe(false);
    expect(hasText('60 分钟')).toBe(true);
    expect(switchBy('显示防窥倒计时')!.props.value).toBe(false);
    expect(switchBy('锁定时允许新建')!.props.value).toBe(false);
    // With privacy off the dependent sections dim and block interaction.
    expect(switchBy('显示防窥倒计时')!.props.disabled).toBe(true);
    expect(tree.root.findAllByType('View').some((n: any) =>
      Array.isArray(n.props.style) && n.props.style.some((s: any) => s?.opacity === 0.4))).toBe(true);
  });

  it.each([['0', '1 分钟'], ['abc', '5 分钟']])('normalizes a stored timeout of %s to %s', async (raw, expected) => {
    stored([['privacy_timeout_minutes', raw]]);
    await mount();
    expect(hasText(expected)).toBe(true);
  });

  it('disables controls while the initial read is pending', async () => {
    let resolveRead!: (v: Array<[string, string | null]>) => void;
    (AsyncStorage.multiGet as jest.Mock).mockImplementation(() => new Promise((resolve) => { resolveRead = resolve; }));
    await act(async () => { tree = create(<PrivacySettingsScreen />); });
    await settle();
    expect(hasText('正在读取设置…')).toBe(true);
    expect(switchBy('启用自动锁定')!.props.disabled).toBe(true);
    act(() => { void switchBy('启用自动锁定')!.props.onValueChange(false); });
    await settle();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();

    await act(async () => { resolveRead([]); });
    await settle();
    expect(hasText('修改后自动保存')).toBe(true);
    expect(switchBy('启用自动锁定')!.props.disabled).toBe(false);
  });

  it('reports a read failure and recovers through the reload button', async () => {
    (AsyncStorage.multiGet as jest.Mock)
      .mockRejectedValueOnce(new Error('storage locked'))
      .mockResolvedValueOnce([['privacy_timeout_minutes', '10']]);
    await mount();
    expect(hasText('读取设置失败，请重新加载后再修改')).toBe(true);
    const alertText = tree.root.findAllByType('Text').find((t: any) => childText(t.props.children) === '读取设置失败，请重新加载后再修改');
    expect(alertText!.props.accessibilityRole).toBe('alert');

    await act(async () => { void buttonByText('重新加载')!.props.onPress(); });
    await settle();
    expect(hasText('10 分钟')).toBe(true);
    expect(hasText('修改后自动保存')).toBe(true);
  });

  it('discards an old reload when a newer reload has already completed', async () => {
    (AsyncStorage.multiGet as jest.Mock).mockRejectedValueOnce(new Error('storage locked'));
    await mount();
    let resolveOld!: (values: Array<[string, string]>) => void;
    let resolveNew!: (values: Array<[string, string]>) => void;
    (AsyncStorage.multiGet as jest.Mock)
      .mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { resolveNew = resolve; }));
    const reload = buttonByText('重新加载')!.props.onPress;
    act(() => { void reload(); void reload(); });
    await act(async () => { resolveNew([['privacy_block_capture', 'false']]); });
    await act(async () => { resolveOld([['privacy_block_capture', 'true']]); });
    expect(switchBy('阻止截图与录屏')!.props.value).toBe(false);
  });
});

describe('PrivacySettingsScreen persistence', () => {
  it.each([
    ['启动时锁定', 'privacy_lock_on_launch', false],
    ['设备锁屏后锁定', 'privacy_lock_on_device_lock', false],
    ['隐藏后台预览', 'privacy_hide_app_preview', false],
    ['阻止截图与录屏', 'privacy_block_capture', true],
  ])('saves %s and notifies active privacy consumers', async (label, key, value) => {
    await mount();
    await act(async () => { await switchBy(label as string)!.props.onValueChange(value); });
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(key, String(value));
    expect(switchBy(label as string)!.props.value).toBe(value);
    expect(notifyPrivacyPreferencesChanged).toHaveBeenCalledTimes(1);
  });

  it('keeps preview and capture independently adjustable with automatic privacy locking disabled', async () => {
    stored([['privacy_enabled', 'false'], ['privacy_block_capture', 'true']]);
    await mount();
    expect(switchBy('启动时锁定')!.props.disabled).toBe(true);
    expect(switchBy('设备锁屏后锁定')!.props.disabled).toBe(true);
    expect(switchBy('隐藏后台预览')!.props.disabled).toBe(false);
    expect(switchBy('阻止截图与录屏')!.props.disabled).toBe(false);
    expect(switchBy('阻止截图与录屏')!.props.value).toBe(true);
    await act(async () => { await switchBy('阻止截图与录屏')!.props.onValueChange(false); });
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('privacy_block_capture', 'false');
  });

  it('retains opt-out and does not notify when saving capture opt-in fails', async () => {
    await mount();
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    await act(async () => { await switchBy('阻止截图与录屏')!.props.onValueChange(true); });
    expect(switchBy('阻止截图与录屏')!.props.value).toBe(false);
    expect(notifyPrivacyPreferencesChanged).not.toHaveBeenCalled();
    expect(hasText('保存失败，修改未生效，请重试')).toBe(true);
  });

  it('saves toggle changes immediately', async () => {
    await mount();
    await act(async () => { void switchBy('启用自动锁定')!.props.onValueChange(false); });
    await settle();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('privacy_enabled', 'false');
    expect(switchBy('启用自动锁定')!.props.value).toBe(false);
    expect(hasText('修改后自动保存')).toBe(true);

    await act(async () => { void switchBy('显示防窥倒计时')!.props.onValueChange(false); });
    await settle();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('show_privacy_countdown', 'false');

    await act(async () => { void switchBy('锁定时允许新建')!.props.onValueChange(false); });
    await settle();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('privacy_allow_compose', 'false');
  });

  it('updates the label while sliding and persists the completed value', async () => {
    await mount();
    await act(async () => { void tree.root.findByType('Slider').props.onValueChange(7.4); });
    expect(hasText('7 分钟')).toBe(true);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();

    await act(async () => { void tree.root.findByType('Slider').props.onSlidingComplete(7.6); });
    await settle();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('privacy_timeout_minutes', '8');
    expect(hasText('8 分钟')).toBe(true);
  });

  it('reverts the slider when saving fails', async () => {
    stored([['privacy_timeout_minutes', '5']]);
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    await mount();
    await act(async () => { void tree.root.findByType('Slider').props.onValueChange(30); });
    await act(async () => { void tree.root.findByType('Slider').props.onSlidingComplete(30); });
    await settle();
    expect(hasText('保存失败，修改未生效，请重试')).toBe(true);
    expect(hasText('5 分钟')).toBe(true);
  });

  it('ignores a second change while a save is still in flight', async () => {
    let resolveSave!: (value?: unknown) => void;
    (AsyncStorage.setItem as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => { resolveSave = resolve; }));
    await mount();
    await act(async () => { void switchBy('启用自动锁定')!.props.onValueChange(false); });
    expect(hasText('正在保存…')).toBe(true);
    expect(switchBy('显示防窥倒计时')!.props.disabled).toBe(true);

    await act(async () => { void switchBy('显示防窥倒计时')!.props.onValueChange(false); });
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);

    await act(async () => { resolveSave(); });
    await settle();
    expect(switchBy('启用自动锁定')!.props.value).toBe(false);
    expect(switchBy('显示防窥倒计时')!.props.value).toBe(true);
    expect(hasText('修改后自动保存')).toBe(true);
  });
});
