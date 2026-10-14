jest.mock('react-native', () => ({
  __esModule: true,
  View: 'View',
  Text: 'Text', TouchableOpacity: 'TouchableOpacity',
  StyleSheet: { create: (value: unknown) => value },
}));
jest.mock('expo-video', () => {
  const player = { play: jest.fn(), pause: jest.fn(), addListener: jest.fn(() => ({ remove: jest.fn() })) };
  return { useVideoPlayer: jest.fn(() => player), VideoView: 'VideoView', __player: player };
});
jest.mock('../../src/utils/imageSource', () => ({ buildImageSource: jest.fn((url: string) => ({ uri: url })) }));

import React from 'react';
import VideoPlayerButton from '../../src/components/VideoPlayerButton';

const { create, act } = require('react-test-renderer');
const { useVideoPlayer } = require('expo-video');
const { __player: player } = require('expo-video');
const { buildImageSource } = require('../../src/utils/imageSource');

let tree: any;

const att = (over: Record<string, unknown> = {}) => ({
  uid: 'v1', type: 'video', url: 'https://media.example/clip.mp4',
  filename: 'clip.mp4', originalFilename: '', ...over,
});

beforeEach(() => jest.clearAllMocks());
afterEach(() => { act(() => { tree?.unmount(); }); tree = undefined; });

async function mount(attachment: ReturnType<typeof att>) {
  await act(async () => { tree = create(<VideoPlayerButton attachment={attachment as any} />); });
}

describe('VideoPlayerButton', () => {
  it('plays the remote source with native controls', async () => {
    await mount(att());
    expect(useVideoPlayer).not.toHaveBeenCalled();
    expect(tree.root.findAllByType('VideoView')).toHaveLength(0);
    await act(async () => { tree.root.findByType('TouchableOpacity').props.onPress(); });
    expect(buildImageSource).toHaveBeenCalledWith('https://media.example/clip.mp4');
    expect(useVideoPlayer).toHaveBeenCalledWith({ uri: 'https://media.example/clip.mp4' });
    const view = tree.root.findByType('VideoView');
    expect(view.props.player).toBe(player);
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(view.props.nativeControls).toBe(true);
    expect(view.props.allowsPictureInPicture).toBe(true);
    expect(view.props.contentFit).toBe('contain');
    expect(view.props.accessibilityLabel).toBe('播放视频 clip.mp4');
  });

  it('prefers the original filename in the label', async () => {
    await mount(att({ originalFilename: '生日.mp4' }));
    expect(tree.root.findByType('TouchableOpacity').props.accessibilityLabel).toBe('播放视频 生日.mp4');
  });

  it('falls back to an empty name', async () => {
    await mount(att({ filename: '', originalFilename: '' }));
    expect(tree.root.findByType('TouchableOpacity').props.accessibilityLabel).toBe('播放视频 ');
  });

  it('closes the active player and does not reopen it until another tap', async () => {
    await mount(att());
    await act(async () => { tree.root.findByType('TouchableOpacity').props.onPress(); });
    const listener = player.addListener.mock.results.at(-1).value;
    await act(async () => { tree.root.findByType('TouchableOpacity').props.onPress(); });
    expect(tree.root.findAllByType('VideoView')).toHaveLength(0);
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(listener.remove).toHaveBeenCalledTimes(1);
    useVideoPlayer.mockClear();
    await act(async () => { tree.update(<VideoPlayerButton attachment={att() as any} />); });
    expect(useVideoPlayer).not.toHaveBeenCalled();
  });

  it('releases a failed stream and offers an explicit retry', async () => {
    await mount(att());
    await act(async () => { tree.root.findByType('TouchableOpacity').props.onPress(); });
    await act(async () => { player.addListener.mock.calls.at(-1)[1]({ status: 'error' }); });
    expect(tree.root.findAllByType('VideoView')).toHaveLength(0);
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(tree.root.findAllByType('Text').some((node: any) => node.props.children === '视频加载失败，点击重试')).toBe(true);
    await act(async () => { tree.root.findByType('TouchableOpacity').props.onPress(); });
    expect(tree.root.findAllByType('VideoView')).toHaveLength(1);
    expect(player.play).toHaveBeenCalledTimes(2);
  });

  it('stops the previous attachment when a recycled card changes source', async () => {
    await mount(att());
    await act(async () => { tree.root.findByType('TouchableOpacity').props.onPress(); });
    useVideoPlayer.mockClear();
    await act(async () => { tree.update(<VideoPlayerButton attachment={att({ uid: 'v2', url: 'https://media.example/other.mp4' }) as any} />); });
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(useVideoPlayer).not.toHaveBeenCalled();
    expect(tree.root.findAllByType('VideoView')).toHaveLength(0);
  });
});
