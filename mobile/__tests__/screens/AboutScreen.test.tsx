jest.mock('react-native', () => ({
  __esModule: true,
  View: 'View', Text: 'Text', ScrollView: 'ScrollView', TouchableOpacity: 'TouchableOpacity',
  Linking: { openURL: jest.fn(async () => undefined) },
  ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: (value: unknown) => value },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 34 }) }));
jest.mock('../../src/theme/ThemeContext', () => ({ useTheme: () => ({ theme: require('../../src/theme/themes').THEMES[0] }) }));
jest.mock('../../src/utils/crossAlert', () => ({ xAlert: jest.fn() }));
jest.mock('../../src/utils/versionChecker', () => ({ checkForUpdates: jest.fn(async () => 'current') }));
jest.mock('../../src/config', () => ({ getApiBaseUrl: () => 'https://api.example' }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { get expoConfig() { return mockConstantsState.expoConfig; } },
}));

import React from 'react';
import AboutScreen from '../../src/screens/AboutScreen';

const { create, act } = require('react-test-renderer');
const { Linking } = require('react-native');
const { xAlert } = require('../../src/utils/crossAlert');
const { checkForUpdates } = require('../../src/utils/versionChecker');

const mockConstantsState: { expoConfig: { version?: string; ios?: { buildNumber?: string } } | null } = { expoConfig: null };

let tree: any;
const childText = (children: any): string =>
  typeof children === 'string' ? children
    : typeof children === 'number' ? String(children)
      : Array.isArray(children) ? children.map(childText).join('')
        : '';
const hasText = (s: string) => tree.root.findAllByType('Text').some((t: any) => childText(t.props.children) === s);
const card = (title: string) => tree.root.findAllByType('TouchableOpacity')
  .find((n: any) => n.findAllByType('Text').some((t: any) => childText(t.props.children) === title))!;

async function mount() {
  await act(async () => { tree = create(<AboutScreen />); });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockConstantsState.expoConfig = null;
});
afterEach(() => { act(() => { tree?.unmount(); }); tree = undefined; });

describe('AboutScreen version display', () => {
  it('reads the version and build number from expo config', async () => {
    mockConstantsState.expoConfig = { version: '2.4.0', ios: { buildNumber: '42' } };
    await mount();
    expect(hasText('版本 2.4.0 (Build 42)')).toBe(true);
  });

  it('falls back to bundled defaults without expo config', async () => {
    await mount();
    expect(hasText('版本 1.1.0 (Build 1)')).toBe(true);
    expect(hasText('ChewyBBTalk')).toBe(true);
    expect(tree.root.findAllByType('Text').some((t: any) => childText(t.props.children).includes('© 2024-2026'))).toBe(true);
  });
});

describe('AboutScreen update check', () => {
  it.each([
    ['current', '检查完成', '当前已是最新版本'],
    ['error', '检查失败', '暂时无法获取版本信息，请检查网络后重试'],
    ['unavailable', '暂时无法检查版本', '此版本无法自动确认商店更新，请前往应用下载渠道查看。'],
  ])('reports %s results', async (result, title, message) => {
    (checkForUpdates as jest.Mock).mockResolvedValueOnce(result);
    await mount();
    await act(async () => { void card('检查更新').props.onPress(); });
    expect(checkForUpdates).toHaveBeenCalledWith(true);
    expect(xAlert).toHaveBeenCalledWith(title, message);
    expect(tree.root.findAllByType('ActivityIndicator')).toHaveLength(0);
  });

  it('alerts on an unexpected failure', async () => {
    (checkForUpdates as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await mount();
    await act(async () => { void card('检查更新').props.onPress(); });
    expect(xAlert).toHaveBeenCalledWith('检查失败', '暂时无法获取版本信息，请稍后重试');
  });

  it('shows a spinner, disables the row and ignores re-presses while checking', async () => {
    let resolveCheck!: (v: string) => void;
    (checkForUpdates as jest.Mock).mockReturnValueOnce(new Promise((resolve) => { resolveCheck = resolve; }));
    await mount();
    await act(async () => { void card('检查更新').props.onPress(); });
    expect(hasText('正在检查...')).toBe(true);
    expect(tree.root.findAllByType('ActivityIndicator')).toHaveLength(1);
    const busy = card('正在检查...');
    expect(busy.props.disabled).toBe(true);

    await act(async () => { void busy.props.onPress(); }); // busy guard
    expect(checkForUpdates).toHaveBeenCalledTimes(1);

    await act(async () => { resolveCheck('current'); });
    expect(card('检查更新').props.disabled).toBe(false);
    expect(hasText('正在检查...')).toBe(false);
  });
});

describe('AboutScreen external links', () => {
  it('opens the privacy policy and support pages', async () => {
    await mount();
    await act(async () => { void card('隐私政策').props.onPress(); });
    await act(async () => { void card('联系支持').props.onPress(); });
    expect(Linking.openURL).toHaveBeenCalledTimes(2);
    expect(Linking.openURL).toHaveBeenNthCalledWith(1, 'https://api.example/privacy-policy/');
    expect(Linking.openURL).toHaveBeenNthCalledWith(2, 'https://api.example/support/');
  });

  it('opens the github repository', async () => {
    await mount();
    await act(async () => { void card('GitHub 仓库').props.onPress(); });
    expect(Linking.openURL).toHaveBeenCalledWith('https://github.com/cone387/ChewyBBTalk');
  });

  it('alerts when a link cannot be opened', async () => {
    (Linking.openURL as jest.Mock).mockRejectedValueOnce(new Error('no browser'));
    await mount();
    await act(async () => { void card('GitHub 仓库').props.onPress(); });
    expect(xAlert).toHaveBeenCalledWith('无法打开仓库', '请检查网络后重试');
  });
});
