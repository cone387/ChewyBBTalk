// Factory-internal mutable state lets tests flip Platform.OS, player status
// and route params between mounts.
jest.mock('react-native', () => {
  const state = { os: 'ios' };
  return {
    __esModule: true,
    View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', ActivityIndicator: 'ActivityIndicator',
    StyleSheet: { create: (value: unknown) => value },
    get Platform() { return { get OS() { return state.os; } }; },
    __state: state,
  };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('expo-audio', () => {
  const player = { pause: jest.fn(), play: jest.fn(), seekTo: jest.fn() };
  const status = { playing: false, didJustFinish: false, duration: 0, currentTime: 0, isLoaded: true };
  return {
    __esModule: true,
    useAudioPlayer: jest.fn(() => player),
    useAudioPlayerStatus: jest.fn(() => status),
    setAudioModeAsync: jest.fn(() => Promise.resolve()),
    __player: player,
    __status: status,
  };
});
jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  cacheDirectory: 'file:///cache/',
  downloadAsync: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 47, bottom: 34 }) }));
jest.mock('@react-navigation/native', () => {
  const state: any = { params: null };
  return { __esModule: true, useRoute: () => ({ params: state.params }), __state: state };
});
jest.mock('../../src/theme/ThemeContext', () => ({ useTheme: () => ({ theme: require('../../src/theme/themes').THEMES[0] }) }));

import React from 'react';
import AudioPlayScreen from '../../src/screens/AudioPlayScreen';

const { create, act } = require('react-test-renderer');
const RN: any = require('react-native');
const Audio: any = require('expo-audio');
const FS: any = require('expo-file-system/legacy');
const RouteState: any = require('@react-navigation/native').__state;

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
const playButton = () => tree.root.findAllByType('TouchableOpacity')
  .find((n: any) => ['播放音频', '暂停音频'].includes(n.props.accessibilityLabel));
const buttonByText = (s: string) => tree.root.findAllByType('TouchableOpacity')
  .find((n: any) => n.findAllByType('Text').some((t: any) => childText(t.props.children).includes(s)));

beforeEach(() => {
  jest.clearAllMocks();
  RN.__state.os = 'ios';
  Object.assign(Audio.__status, { playing: false, didJustFinish: false, duration: 0, currentTime: 0, isLoaded: true });
  FS.downloadAsync.mockReset().mockImplementation(async () => ({ uri: 'file:///cache/dl.m4a', status: 200 }));
});

afterEach(() => { act(() => { tree?.unmount(); }); tree = undefined; });

async function mount(params: any) {
  RouteState.params = params;
  await act(async () => { tree = create(<AudioPlayScreen />); });
  await settle();
}

describe('AudioPlayScreen download flow', () => {
  it('asks for a real audio source when the route has no url', async () => {
    await mount(undefined); // route.params is undefined → defaults apply
    expect(hasText('请从记录中选择一段音频播放')).toBe(true);
    expect(tree.root.findAllByType('TouchableOpacity')).toHaveLength(0);
    expect(FS.downloadAsync).not.toHaveBeenCalled();
  });

  it('downloads the file on native and hands it to the player', async () => {
    await mount({ url: 'https://a.example/v.m4a', name: 'song.mp3' });
    expect(FS.downloadAsync).toHaveBeenCalledWith('https://a.example/v.m4a', expect.stringMatching(/audio_\d+\.mp3$/));
    expect(hasText('song.mp3')).toBe(true);
    expect(Audio.useAudioPlayer).toHaveBeenCalledWith('file:///cache/dl.m4a');
    expect(Audio.setAudioModeAsync).toHaveBeenCalledWith({ playsInSilentMode: true, allowsRecording: false });
  });

  it('falls back to the m4a extension for empty names', async () => {
    await mount({ url: 'https://a.example/v', name: '' });
    expect(FS.downloadAsync).toHaveBeenCalledWith('https://a.example/v', expect.stringMatching(/audio_\d+\.m4a$/));
  });

  it('reports non-2xx downloads and recovers through retry', async () => {
    FS.downloadAsync.mockResolvedValueOnce({ uri: 'file:///cache/x.m4a', status: 404 });
    await mount({ url: 'https://a.example/v.m4a', name: 'v.m4a' });
    expect(hasText('音频下载失败，请重试')).toBe(true);
    expect(buttonByText('重新加载')).toBeDefined();

    await act(async () => { void buttonByText('重新加载')!.props.onPress(); });
    await settle();
    expect(FS.downloadAsync).toHaveBeenCalledTimes(2);
    expect(Audio.useAudioPlayer).toHaveBeenCalledWith('file:///cache/dl.m4a');
  });

  it.each([
    ['the thrown message', new Error('空间不足'), '空间不足'],
    ['a generic fallback', new Error(''), '下载失败'],
  ])('shows %s when the download throws', async (_name, err, expected) => {
    FS.downloadAsync.mockRejectedValueOnce(err);
    await mount({ url: 'https://a.example/v.m4a', name: 'v.m4a' });
    expect(hasText(expected)).toBe(true);
  });

  it('keeps the spinner while the download is pending', async () => {
    let resolveDownload!: (v: { uri: string; status: number }) => void;
    FS.downloadAsync.mockImplementation(() => new Promise((resolve) => { resolveDownload = resolve; }));
    await mount({ url: 'https://a.example/v.m4a', name: 'v.m4a' });
    expect(hasText('下载音频中...')).toBe(true);
    expect(tree.root.findAllByType('ActivityIndicator')).toHaveLength(1);
    expect(Audio.useAudioPlayer).not.toHaveBeenCalled();

    await act(async () => { resolveDownload({ uri: 'file:///cache/dl.m4a', status: 200 }); });
    await settle();
    expect(Audio.useAudioPlayer).toHaveBeenCalled();
  });

  it('ignores a stale successful download after the url changes', async () => {
    const resolvers: Array<(v: { uri: string; status: number }) => void> = [];
    FS.downloadAsync.mockImplementation(() => new Promise((resolve) => { resolvers.push(resolve); }));
    RouteState.params = { url: 'https://a.example/a.m4a', name: 'a.m4a' };
    await act(async () => { tree = create(<AudioPlayScreen />); });
    await settle();

    RouteState.params = { url: 'https://a.example/b.m4a', name: 'b.m4a' };
    await act(async () => { tree.update(<AudioPlayScreen />); });
    await settle();

    await act(async () => { resolvers[0]!({ uri: 'file:///stale.m4a', status: 200 }); });
    await settle();
    expect(Audio.useAudioPlayer).not.toHaveBeenCalledWith('file:///stale.m4a');
    expect(hasText('下载音频中...')).toBe(true);

    await act(async () => { resolvers[1]!({ uri: 'file:///fresh.m4a', status: 200 }); });
    await settle();
    expect(Audio.useAudioPlayer).toHaveBeenCalledWith('file:///fresh.m4a');
  });

  it('discards a stale download after the url changes', async () => {
    let rejectFirst!: (e: Error) => void;
    let resolveSecond!: (v: { uri: string; status: number }) => void;
    FS.downloadAsync
      .mockImplementationOnce(() => new Promise((_res, rej) => { rejectFirst = rej; }))
      .mockImplementationOnce(() => new Promise((res) => { resolveSecond = res; }));
    RouteState.params = { url: 'https://a.example/a.m4a', name: 'a.m4a' };
    await act(async () => { tree = create(<AudioPlayScreen />); });
    await settle();

    RouteState.params = { url: 'https://a.example/b.m4a', name: 'b.m4a' };
    await act(async () => { tree.update(<AudioPlayScreen />); });
    await settle();

    // The stale request's rejection is ignored: still downloading, no error UI.
    await act(async () => { rejectFirst(new Error('stale failure')); });
    await settle();
    expect(hasText('stale failure')).toBe(false);
    expect(hasText('下载音频中...')).toBe(true);

    await act(async () => { resolveSecond({ uri: 'file:///fresh.m4a', status: 200 }); });
    await settle();
    expect(Audio.useAudioPlayer).toHaveBeenCalledWith('file:///fresh.m4a');
  });

  it('streams directly from the url on the web platform', async () => {
    RN.__state.os = 'web';
    await mount({ url: 'https://a.example/v.m4a' });
    expect(FS.downloadAsync).not.toHaveBeenCalled();
    expect(Audio.useAudioPlayer).toHaveBeenCalledWith('https://a.example/v.m4a');
    expect(hasText('音频')).toBe(true); // default display name
  });
});

describe('AudioPlayScreen player UI', () => {
  it('pauses a playing track and shows progress and times', async () => {
    Object.assign(Audio.__status, { playing: true, duration: 200, currentTime: 50 });
    await mount({ url: 'https://a.example/v.m4a', name: 'v.m4a' });
    expect(playButton()!.props.accessibilityLabel).toBe('暂停音频');
    expect(hasText('0:50')).toBe(true);
    expect(hasText('3:20')).toBe(true);
    expect(JSON.stringify(tree.root.findAllByType('View').map((n: any) => n.props.style))).toContain('25%');

    await act(async () => { void playButton()!.props.onPress(); });
    expect(Audio.__player.pause).toHaveBeenCalledTimes(1);
    expect(Audio.__player.play).not.toHaveBeenCalled();
  });

  it('plays a paused track without seeking', async () => {
    await mount({ url: 'https://a.example/v.m4a', name: 'v.m4a' });
    expect(playButton()!.props.accessibilityLabel).toBe('播放音频');
    await act(async () => { void playButton()!.props.onPress(); });
    expect(Audio.__player.play).toHaveBeenCalledTimes(1);
    expect(Audio.__player.seekTo).not.toHaveBeenCalled();
  });

  it('restarts a finished track from the beginning', async () => {
    Object.assign(Audio.__status, { didJustFinish: true });
    await mount({ url: 'https://a.example/v.m4a', name: 'v.m4a' });
    await act(async () => { void playButton()!.props.onPress(); });
    expect(Audio.__player.seekTo).toHaveBeenCalledWith(0);
    expect(Audio.__player.play).toHaveBeenCalledTimes(1);
  });

  it('disables the play button while the track is not loaded', async () => {
    Object.assign(Audio.__status, { isLoaded: false });
    await mount({ url: 'https://a.example/v.m4a', name: 'v.m4a' });
    expect(playButton()!.props.disabled).toBe(true);
    expect(hasText('准备播放...')).toBe(true);
    expect(JSON.stringify(tree.root.findAllByType('View').map((n: any) => n.props.style))).toContain('0%');
  });
});
