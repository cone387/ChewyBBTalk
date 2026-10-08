const mockXAlert = jest.fn();
const mockXConfirm = jest.fn();

jest.mock('expo-file-system/legacy', () => {
  const state = { cacheDirectory: 'file:///cache/' };
  return {
    __esModule: true,
    get cacheDirectory() { return state.cacheDirectory; },
    readDirectoryAsync: jest.fn(async () => [] as string[]),
    getInfoAsync: jest.fn(async () => ({ exists: false, isDirectory: false, size: 0 })),
    deleteAsync: jest.fn(async () => undefined),
    __state: state,
  };
});

jest.mock('@react-navigation/native', () => {
  const nav: any = { effect: null };
  return { useFocusEffect: (effect: any) => { nav.effect = effect; }, __nav: nav };
});

jest.mock('../../src/utils/crossAlert', () => ({
  xAlert: (...args: any[]) => mockXAlert(...args),
  xConfirm: (...args: any[]) => mockXConfirm(...args),
}));

jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity',
  ScrollView: 'ScrollView', ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: (value: unknown) => value },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 10, bottom: 12, left: 0, right: 0 }) }));
jest.mock('../../src/theme/ThemeContext', () => ({ useTheme: () => ({ theme: require('../../src/theme/themes').THEMES[0] }) }));

import React from 'react';
import CacheManagementScreen from '../../src/screens/CacheManagementScreen';

const { create, act } = require('react-test-renderer');

const FS: any = require('expo-file-system/legacy');
const Nav: any = require('@react-navigation/native');

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
function tappable(label: string) {
  const matches = tree.root.findAllByType('TouchableOpacity').filter((node: any) =>
    node.findAllByType('Text').some((text: any) => childText(text.props.children) === label));
  return matches.find((node: any) => !matches.some((other: any) => other !== node && node.findAllByType('TouchableOpacity').includes(other)));
}
async function press(label: string) { await act(async () => { void tappable(label)!.props.onPress(); }); }

interface FakeFile { name: string; size?: number; exists?: boolean; isDirectory?: boolean }
function setFiles(files: FakeFile[]) {
  FS.readDirectoryAsync.mockImplementation(async () => files.map((f: FakeFile) => f.name));
  FS.getInfoAsync.mockImplementation(async (path: string) => {
    const name = path.split('/').pop();
    const f = files.find((x: FakeFile) => x.name === name);
    return { exists: f ? (f.exists ?? true) : false, isDirectory: f?.isDirectory ?? false, size: f?.size ?? 0 };
  });
}

const media = (): FakeFile[] => [
  { name: 'audio_a.m4a', size: 1536 },
  { name: 'video_b.mp4', size: 2097152 },
  { name: 'video_c.mkv', size: 3145728 },
  { name: 'audio_d.txt', size: 512 },
  { name: 'expo_system.png', size: 999999 },
  { name: 'audio_folder', isDirectory: true },
  { name: 'audio_missing.m4a', exists: false },
];

beforeEach(() => {
  jest.clearAllMocks();
  FS.__state.cacheDirectory = 'file:///cache/';
  FS.readDirectoryAsync.mockImplementation(async () => [] as string[]);
  FS.getInfoAsync.mockImplementation(async () => ({ exists: false, isDirectory: false, size: 0 }));
  FS.deleteAsync.mockImplementation(async () => undefined);
});

afterEach(() => { act(() => { tree?.unmount(); }); tree = undefined; });

async function mountScreen(focus = true) {
  await act(async () => { tree = create(<CacheManagementScreen />); });
  await settle();
  if (focus) {
    await act(async () => { void Nav.__nav.effect(); });
    await settle();
  }
}

describe('CacheManagementScreen scan', () => {
  it('sums owned media files and groups them by category', async () => {
    setFiles(media());
    await mountScreen();
    expect(hasText('5.0 MB')).toBe(true);
    expect(hasText('缓存总大小 · 4 个文件')).toBe(true);
    expect(hasText('音频')).toBe(true);
    expect(hasText('1.5 KB')).toBe(true);
    expect(hasText('视频')).toBe(true);
    expect(tappable('清理全部缓存')).toBeDefined();
  });

  it('hides empty categories and the clear button for an empty cache', async () => {
    setFiles([{ name: 'expo_system.png', size: 5000 }]);
    await mountScreen();
    expect(hasText('0 B')).toBe(true);
    expect(hasText('缓存总大小 · 0 个文件')).toBe(true);
    expect(hasText('音频')).toBe(false);
    expect(hasText('视频')).toBe(false);
    expect(hasText('其他')).toBe(false);
    expect(tappable('清理全部缓存')).toBeUndefined();
  });

  it('keeps the spinner until the focus effect loads data', async () => {
    setFiles(media());
    await mountScreen(false);
    expect(tree.root.findAllByType('ActivityIndicator')).toHaveLength(1);
    await act(async () => { void Nav.__nav.effect(); });
    await settle();
    expect(hasText('5.0 MB')).toBe(true);
  });

  it('explains scan failures and retries', async () => {
    FS.readDirectoryAsync.mockImplementationOnce(() => Promise.reject(new Error('权限被拒绝')));
    await mountScreen();
    expect(hasText('权限被拒绝')).toBe(true);
    expect(hasText('重新读取')).toBe(true);
    setFiles([{ name: 'audio_a.mp3', size: 700 }]);
    await press('重新读取');
    await settle();
    expect(hasText('权限被拒绝')).toBe(false);
    expect(hasText('700 B')).toBe(true);
  });

  it('falls back to a generic message and handles a missing cache directory', async () => {
    FS.readDirectoryAsync.mockImplementationOnce(() => Promise.reject({}));
    await mountScreen();
    expect(hasText('无法读取缓存大小，请重试')).toBe(true);
  });

  it('treats a null cache directory as an empty cache', async () => {
    FS.__state.cacheDirectory = null;
    await mountScreen();
    expect(FS.readDirectoryAsync).not.toHaveBeenCalled();
    expect(hasText('0 B')).toBe(true);
  });
});

describe('CacheManagementScreen clearing', () => {
  it('deletes only owned files after confirmation and rescans', async () => {
    setFiles(media());
    await mountScreen();
    await press('清理全部缓存');
    expect(mockXConfirm).toHaveBeenCalledWith(
      '清理缓存',
      '将删除所有已下载的音频、视频缓存，不会影响服务器上的数据。',
      expect.any(Function), undefined,
      { confirmText: '清理', destructive: true },
    );
    expect(FS.deleteAsync).not.toHaveBeenCalled();
    await act(async () => { await mockXConfirm.mock.calls[0]![2](); });
    await settle();
    // Clearing works purely by name prefix: directories and already-missing
    // owned files are still passed to deleteAsync (idempotent).
    expect(FS.deleteAsync).toHaveBeenCalledTimes(6);
    expect(FS.deleteAsync).toHaveBeenCalledWith('file:///cache/audio_a.m4a', { idempotent: true });
    expect(FS.deleteAsync).toHaveBeenCalledWith('file:///cache/video_c.mkv', { idempotent: true });
    expect(FS.deleteAsync).toHaveBeenCalledWith('file:///cache/audio_folder', { idempotent: true });
    expect(FS.deleteAsync).not.toHaveBeenCalledWith('file:///cache/expo_system.png', expect.anything());
    expect(mockXAlert).toHaveBeenCalledWith('完成', '缓存已清理');
  });

  it('reports clear failures and reloads afterwards', async () => {
    setFiles(media());
    FS.deleteAsync.mockImplementationOnce(() => Promise.reject(new Error('文件被占用')));
    await mountScreen();
    await press('清理全部缓存');
    await act(async () => { await mockXConfirm.mock.calls[0]![2](); });
    await settle();
    expect(mockXAlert).toHaveBeenCalledWith('清理失败', '文件被占用');
    expect(FS.readDirectoryAsync).toHaveBeenCalledTimes(3);
  });

  it('shows progress and disables the button while clearing', async () => {
    setFiles(media());
    const pendingDeletes: ((value: undefined) => void)[] = [];
    FS.deleteAsync.mockImplementation(() => new Promise(resolve => { pendingDeletes.push(resolve); }));
    await mountScreen();
    await press('清理全部缓存');
    await act(async () => { void mockXConfirm.mock.calls[0]![2](); });
    await settle(1);
    // While clearing, the button label is replaced by a spinner.
    const clearButton = tree.root.findAllByType('TouchableOpacity')
      .find((node: any) => node.findAllByType('ActivityIndicator').length > 0);
    expect(clearButton!.props.disabled).toBe(true);
    // Deletes run one file at a time; release them until the flow completes.
    for (let round = 0; round < 10 && mockXAlert.mock.calls.length === 0; round += 1) {
      await act(async () => { pendingDeletes.splice(0).forEach((resolve) => { resolve(undefined); }); });
      await settle(1);
    }
    expect(mockXAlert).toHaveBeenCalledWith('完成', '缓存已清理');
  });
});
