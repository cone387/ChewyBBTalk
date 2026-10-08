jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', ScrollView: 'ScrollView',
  Switch: 'Switch', StyleSheet: { create: (value: unknown) => value, hairlineWidth: 0.5 },
  Linking: { openURL: jest.fn(() => Promise.resolve()) },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('expo-image', () => ({ Image: 'ExpoImage' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 34 }) }));
jest.mock('@react-navigation/native', () => {
  const state: any = { lastCb: null, cleanup: null, navigate: jest.fn() };
  return {
    __esModule: true,
    useFocusEffect: jest.fn((cb: any) => {
      if (state.lastCb !== cb) { state.lastCb = cb; state.cleanup?.(); state.cleanup = cb(); }
    }),
    useNavigation: () => ({ navigate: state.navigate }),
    __state: state,
  };
});
jest.mock('../../src/utils/imageSource', () => ({ buildImageSource: (url: string) => ({ uri: url }) }));
jest.mock('../../src/services/auth', () => ({ getCurrentUser: jest.fn(), logout: jest.fn(async () => undefined) }));
jest.mock('../../src/config', () => ({ getApiBaseUrl: () => 'https://example.test' }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
jest.mock('../../src/utils/crossAlert', () => ({ xConfirm: jest.fn(), xAlert: jest.fn() }));

import React from 'react';
import SettingsScreen from '../../src/screens/SettingsScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentUser, logout } from '../../src/services/auth';
import { xConfirm, xAlert } from '../../src/utils/crossAlert';

const { create, act } = require('react-test-renderer');
const { Linking } = require('react-native');
const NavState: any = require('@react-navigation/native').__state;

let tree: any;
let onLogout: jest.Mock;
const settle = async (rounds = 3) => {
  for (let i = 0; i < rounds; i += 1) await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0); }); });
};

const childText = (children: any): string =>
  typeof children === 'string' ? children
    : typeof children === 'number' ? String(children)
      : Array.isArray(children) ? children.map(childText).join('')
        : '';
const hasText = (s: string) => tree.root.findAllByType('Text').some((t: any) => childText(t.props.children) === s);
const buttonByText = (s: string) => tree.root.findAllByType('TouchableOpacity')
  .find((n: any) => n.findAllByType('Text').some((t: any) => childText(t.props.children) === s));
const tagTabsSwitch = () => tree.root.findAllByType('Switch')
  .find((n: any) => n.props.accessibilityLabel === '显示记录页标签栏');

beforeEach(() => {
  jest.clearAllMocks();
  onLogout = jest.fn();
  NavState.lastCb = null;
  NavState.cleanup = null;
  (getCurrentUser as jest.Mock).mockReset().mockReturnValue(null);
  (AsyncStorage.getItem as jest.Mock).mockReset().mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockReset().mockResolvedValue(undefined);
});

afterEach(() => { act(() => { tree?.unmount(); }); tree = undefined; });

async function mount() {
  await act(async () => { tree = create(<SettingsScreen onLogout={onLogout} />); });
  await settle();
}

describe('SettingsScreen user card', () => {
  it('shows the profile with avatar and opens the editor', async () => {
    (getCurrentUser as jest.Mock).mockReturnValue({
      username: 'alice', display_name: 'Alice A', email: 'a@b.c', avatar: 'https://img.example/a.png',
    });
    await mount();
    expect(tree.root.findByType('ExpoImage').props.source).toEqual({ uri: 'https://img.example/a.png' });
    expect(hasText('Alice A')).toBe(true);
    expect(hasText('a@b.c')).toBe(true);

    await act(async () => { void buttonByText('Alice A')!.props.onPress(); });
    expect(NavState.navigate).toHaveBeenCalledWith('ProfileEdit');
  });

  it('falls back to the initial letter and handle when details are missing', async () => {
    (getCurrentUser as jest.Mock).mockReturnValue({ username: 'bob' });
    await mount();
    expect(tree.root.findAllByType('ExpoImage')).toHaveLength(0);
    expect(hasText('B')).toBe(true);
    expect(hasText('bob')).toBe(true);
    expect(hasText('@bob')).toBe(true);
  });

  it('hides the user card when nobody is logged in', async () => {
    await mount();
    expect(tree.root.findAllByType('TouchableOpacity').some((n: any) => n.props.accessibilityLabel === '编辑个人信息')).toBe(false);
  });

  it('refreshes the cached user when the screen regains focus', async () => {
    (getCurrentUser as jest.Mock).mockReturnValue({ username: 'alice' });
    await mount();
    expect(hasText('alice')).toBe(true);

    (getCurrentUser as jest.Mock).mockReturnValue({ username: 'renamed' });
    await act(async () => { void NavState.cleanup?.(); NavState.lastCb = null; tree.update(<SettingsScreen onLogout={onLogout} />); });
    expect(hasText('renamed')).toBe(true);
  });
});

describe('SettingsScreen tag-tabs switch', () => {
  it('defaults to enabled and persists toggles', async () => {
    await mount();
    expect(tagTabsSwitch()!.props.value).toBe(true);
    await act(async () => { void tagTabsSwitch()!.props.onValueChange(false); });
    await settle();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('show_tag_tabs', 'false');
    expect(tagTabsSwitch()!.props.value).toBe(false);
  });

  it('restores a disabled switch from storage', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('false');
    await mount();
    expect(tagTabsSwitch()!.props.value).toBe(false);
  });

  it('reports read and write failures', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('locked'));
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('full'));
    await mount();
    expect(xAlert).toHaveBeenCalledWith('读取设置失败', '请稍后重试');

    await act(async () => { void tagTabsSwitch()!.props.onValueChange(false); });
    await settle();
    expect(xAlert).toHaveBeenCalledWith('保存失败', '标签栏设置未生效，请重试');
    expect(tagTabsSwitch()!.props.value).toBe(true);
  });

  it('ignores a second toggle while a save is in flight', async () => {
    let resolveSave!: (value?: unknown) => void;
    (AsyncStorage.setItem as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => { resolveSave = resolve; }));
    await mount();
    await act(async () => { void tagTabsSwitch()!.props.onValueChange(false); });
    expect(tagTabsSwitch()!.props.disabled).toBe(true);
    await act(async () => { void tagTabsSwitch()!.props.onValueChange(true); });
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);

    await act(async () => { resolveSave(); });
    await settle();
    expect(tagTabsSwitch()!.props.value).toBe(false);
    expect(tagTabsSwitch()!.props.disabled).toBe(false);
  });
});

describe('SettingsScreen navigation and logout', () => {
  it.each([
    ['账号与安全', 'AccountSecurity'],
    ['标签管理', 'TagManagement'],
    ['外观', 'ThemeSettings'],
    ['防窥设置', 'PrivacySettings'],
    ['备份与导出', 'DataManagement'],
    ['高级设置', 'AdvancedSettings'],
    ['帮助与关于', 'About'],
  ])('navigates from %s', async (title, route) => {
    await mount();
    await act(async () => { void buttonByText(title)!.props.onPress(); });
    expect(NavState.navigate).toHaveBeenCalledWith(route);
  });

  it('confirms before logging out', async () => {
    await mount();
    await act(async () => {
      void tree.root.findAllByType('TouchableOpacity').find((n: any) => n.props.accessibilityLabel === '退出登录')!.props.onPress();
    });
    expect(xConfirm).toHaveBeenCalledWith(
      '确认退出', '确定要退出登录吗？', expect.any(Function), undefined,
      { confirmText: '退出', destructive: true },
    );
    const confirm = (xConfirm as jest.Mock).mock.calls[0]![2] as () => Promise<void>;
    await act(async () => { await confirm(); });
    expect(logout).toHaveBeenCalledTimes(1);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
