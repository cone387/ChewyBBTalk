// expo-audio / expo-file-system mocks keep factory-internal mutable state so
// tests can flip Platform.OS and player status between mounts.
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
  const status = { playing: false, didJustFinish: false, duration: 0, currentTime: 0 };
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
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  downloadAsync: jest.fn(async () => ({ uri: 'file:///dl.m4a' })),
}));
jest.mock('../../src/theme/ThemeContext', () => ({ useTheme: () => ({ theme: require('../../src/theme/themes').THEMES[0] }) }));
jest.mock('../../src/utils/imageSource', () => ({
  buildImageSource: (url: string) =>
    url.includes('auth') ? { uri: url, headers: { Authorization: 'Bearer t' } } : { uri: url },
}));

import React from 'react';
import AudioPlayerButton from '../../src/components/AudioPlayerButton';
import type { Attachment } from '../../src/types';

const { create, act } = require('react-test-renderer');
const RN: any = require('react-native');
const Audio: any = require('expo-audio');
const FS: any = require('expo-file-system/legacy');

let tree: any;
const settle = async (rounds = 3) => {
  for (let i = 0; i < rounds; i += 1) await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0); }); });
};

const att = (overrides: Partial<Attachment> = {}): Attachment => ({
  uid: 'u1', url: 'https://a.example/x.m4a', type: 'audio', filename: 'f.m4a', ...overrides,
});

const childText = (children: any): string =>
  typeof children === 'string' ? children
    : typeof children === 'number' ? String(children)
      : Array.isArray(children) ? children.map(childText).join('')
        : '';
const hasText = (s: string) => tree.root.findAllByType('Text').some((t: any) => childText(t.props.children) === s);

beforeEach(() => {
  jest.clearAllMocks();
  RN.__state.os = 'ios';
  Object.assign(Audio.__status, { playing: false, didJustFinish: false, duration: 0, currentTime: 0 });
  Audio.__player.pause.mockClear();
  Audio.__player.play.mockClear();
  Audio.__player.seekTo.mockClear();
  FS.getInfoAsync.mockImplementation(async () => ({ exists: false }));
  FS.downloadAsync.mockImplementation(async () => ({ uri: 'file:///dl.m4a' }));
});

afterEach(() => { act(() => { tree?.unmount(); }); tree = undefined; });

async function mountButton(attachment: Attachment) {
  await act(async () => { tree = create(<AudioPlayerButton attachment={attachment} />); });
  await settle();
}

function cardButton(labelPart: string) {
  return tree.root.findAllByType('TouchableOpacity')
    .find((n: any) => String(n.props.accessibilityLabel ?? '').includes(labelPart));
}

describe('AudioPlayerButton download flow', () => {
  it('plays from the cached file without downloading', async () => {
    FS.getInfoAsync.mockImplementation(async () => ({ exists: true }));
    await mountButton(att({ originalFilename: 'voice_123.m4a' }));
    expect(FS.downloadAsync).not.toHaveBeenCalled();
    expect(Audio.useAudioPlayer).toHaveBeenCalledWith({ uri: 'file:///cache/audio_u1.m4a' });
    expect(hasText('语音记录')).toBe(true);
  });

  it('downloads when the cache is empty and forwards auth headers', async () => {
    await mountButton(att({ url: 'https://a.example/auth/x.m4a', filename: 'song.mp3' }));
    expect(FS.downloadAsync).toHaveBeenCalledWith(
      'https://a.example/auth/x.m4a',
      'file:///cache/audio_u1.mp3',
      { headers: { Authorization: 'Bearer t' } },
    );
    expect(Audio.useAudioPlayer).toHaveBeenCalledWith({ uri: 'file:///dl.m4a' });
  });

  it('falls back to the remote URL when the download fails', async () => {
    FS.downloadAsync.mockImplementationOnce(() => Promise.reject(new Error('空间不足')));
    await mountButton(att());
    expect(Audio.useAudioPlayer).toHaveBeenCalledWith({ uri: 'https://a.example/x.m4a' });
  });

  it('renders the placeholder card with spinner and size while downloading', async () => {
    let resolveDownload!: (v: { uri: string }) => void;
    FS.downloadAsync.mockImplementation(() => new Promise((resolve) => { resolveDownload = resolve; }));
    await act(async () => { tree = create(<AudioPlayerButton attachment={att({ fileSize: 20_480 })} />); });
    await settle();
    // Still on the placeholder card: spinner + loading label, no player yet.
    expect(tree.root.findAllByType('ActivityIndicator')).toHaveLength(1);
    expect(hasText('加载中...')).toBe(true);
    expect(Audio.useAudioPlayer).not.toHaveBeenCalled();

    await act(async () => { resolveDownload({ uri: 'file:///dl.m4a' }); });
    await settle();
    expect(Audio.useAudioPlayer).toHaveBeenCalled();
  });

  it('starts the download on demand when the auto check stalls', async () => {
    let resolveInfo!: (v: { exists: boolean }) => void;
    FS.getInfoAsync.mockImplementation(() => new Promise((resolve) => { resolveInfo = resolve; }));
    FS.downloadAsync.mockImplementationOnce(() => Promise.reject(new Error('手动失败')));
    await act(async () => { tree = create(<AudioPlayerButton attachment={att({ fileSize: 5_120 })} />); });
    await settle();
    // Idle placeholder shows the size instead of a spinner.
    expect(tree.root.findAllByType('ActivityIndicator')).toHaveLength(0);
    expect(hasText('音频 · 5KB')).toBe(true);

    const button = tree.root.findAllByType('TouchableOpacity')[0]!;
    await act(async () => { void button.props.onPress(); });
    await settle();
    // The manual attempt failed, so the remote URL becomes the local source.
    expect(Audio.useAudioPlayer).toHaveBeenCalledWith({ uri: 'https://a.example/x.m4a' });
    void resolveInfo;
  });

  it('uses the remote URL directly on the web platform', async () => {
    RN.__state.os = 'web';
    await mountButton(att());
    expect(FS.getInfoAsync).not.toHaveBeenCalled();
    expect(FS.downloadAsync).not.toHaveBeenCalled();
    expect(Audio.useAudioPlayer).toHaveBeenCalledWith({ uri: 'https://a.example/x.m4a' });
  });
});

describe('PlayerCard playback', () => {
  it('pauses a playing track and shows progress with elapsed time', async () => {
    FS.getInfoAsync.mockImplementation(async () => ({ exists: true }));
    Object.assign(Audio.__status, { playing: true, duration: 200, currentTime: 50 });
    await mountButton(att({ originalFilename: 'voice_7.m4a' }));

    const pauseButton = cardButton('暂停音频');
    expect(pauseButton).toBeDefined();
    expect(hasText('50s / 200s')).toBe(true);
    expect(JSON.stringify(tree.root.findAllByType('View').map((n: any) => n.props.style))).toContain('25%');

    await act(async () => { void pauseButton!.props.onPress(); });
    expect(Audio.__player.pause).toHaveBeenCalledTimes(1);
    expect(Audio.setAudioModeAsync).toHaveBeenCalledWith({ playsInSilentMode: true, allowsRecording: false });
  });

  it('plays a paused track and restarts a finished one', async () => {
    FS.getInfoAsync.mockImplementation(async () => ({ exists: true }));
    await mountButton(att());
    const playButton = cardButton('播放音频');
    expect(playButton).toBeDefined();
    await act(async () => { void playButton!.props.onPress(); });
    expect(Audio.__player.play).toHaveBeenCalledTimes(1);
    expect(Audio.__player.seekTo).not.toHaveBeenCalled();

    Object.assign(Audio.__status, { playing: false, didJustFinish: true });
    await act(async () => { void cardButton('播放音频')!.props.onPress(); });
    expect(Audio.__player.seekTo).toHaveBeenCalledWith(0);
    expect(Audio.__player.play).toHaveBeenCalledTimes(2);
  });

  it('labels an unstarted track by file size or generic name', async () => {
    FS.getInfoAsync.mockImplementation(async () => ({ exists: true }));
    await mountButton(att({ fileSize: 3_072, originalFilename: '', filename: '' }));
    expect(hasText('音频 · 3KB')).toBe(true);

    await mountButton(att({ originalFilename: '', filename: '' }));
    expect(hasText('音频')).toBe(true);
    expect(hasText('语音记录')).toBe(true);
  });
});
