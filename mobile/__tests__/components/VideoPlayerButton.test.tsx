jest.mock('react-native', () => ({
  __esModule: true,
  View: 'View',
  StyleSheet: { create: (value: unknown) => value },
}));
jest.mock('expo-video', () => ({ useVideoPlayer: jest.fn(() => 'mock-player'), VideoView: 'VideoView' }));
jest.mock('../../src/utils/imageSource', () => ({ buildImageSource: jest.fn((url: string) => ({ uri: url })) }));

import React from 'react';
import VideoPlayerButton from '../../src/components/VideoPlayerButton';

const { create, act } = require('react-test-renderer');
const { useVideoPlayer } = require('expo-video');
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
    expect(buildImageSource).toHaveBeenCalledWith('https://media.example/clip.mp4');
    expect(useVideoPlayer).toHaveBeenCalledWith({ uri: 'https://media.example/clip.mp4' });
    const view = tree.root.findByType('VideoView');
    expect(view.props.player).toBe('mock-player');
    expect(view.props.nativeControls).toBe(true);
    expect(view.props.allowsPictureInPicture).toBe(true);
    expect(view.props.contentFit).toBe('contain');
    expect(view.props.accessibilityLabel).toBe('播放视频 clip.mp4');
  });

  it('prefers the original filename in the label', async () => {
    await mount(att({ originalFilename: '生日.mp4' }));
    expect(tree.root.findByType('VideoView').props.accessibilityLabel).toBe('播放视频 生日.mp4');
  });

  it('falls back to an empty name', async () => {
    await mount(att({ filename: '', originalFilename: '' }));
    expect(tree.root.findByType('VideoView').props.accessibilityLabel).toBe('播放视频 ');
  });
});
