const mockXAlert = jest.fn();
const mockInlineComments = jest.fn((_props: any) => null as any);
const mockAudioPlayer = jest.fn((_props: any) => null as any);
const mockVideoPlayer = jest.fn((_props: any) => null as any);
const mockMarkdown = jest.fn((props: any) => props.children as any);

jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity',
  StyleSheet: { create: (value: unknown) => value },
  Linking: { openURL: jest.fn(() => Promise.resolve()) },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('expo-image', () => ({ Image: 'ExpoImage' }));
jest.mock('react-native-markdown-display', () => (props: any) => mockMarkdown(props));
jest.mock('../../src/components/AudioPlayerButton', () => ({ __esModule: true, get default() { return mockAudioPlayer; } }));
jest.mock('../../src/components/VideoPlayerButton', () => ({ __esModule: true, get default() { return mockVideoPlayer; } }));
jest.mock('../../src/components/InlineComments', () => ({ __esModule: true, get default() { return mockInlineComments; } }));
jest.mock('../../src/utils/crossAlert', () => ({ xAlert: (...args: any[]) => mockXAlert(...args) }));
jest.mock('../../src/utils/imageSource', () => ({ buildImageSource: (url: string) => ({ uri: url }) }));

import React from 'react';
import BBTalkCard, { arePropsEqual } from '../../src/components/BBTalkCard';
import type { BBTalkCardProps } from '../../src/components/BBTalkCard';
import { THEMES } from '../../src/theme/themes';
import type { BBTalk, Comment } from '../../src/types';

const { create, act } = require('react-test-renderer');
const { Linking } = require('react-native');

let tree: any;
const settle = async (rounds = 2) => {
  for (let i = 0; i < rounds; i += 1) await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0); }); });
};

const callbacks = () => ({
  onMenu: jest.fn(), onEdit: jest.fn(), onToggleVisibility: jest.fn(),
  onImagePreview: jest.fn(), onLocationPress: jest.fn(), onComment: jest.fn(),
});

const talk = (overrides: Partial<BBTalk> = {}): BBTalk => ({
  id: 't1', content: '今天天气不错', visibility: 'public', tags: [], attachments: [],
  createdAt: '2026-10-08T08:00:00.000Z', updatedAt: '2026-10-08T08:00:00.000Z', ...overrides,
});

let cb: ReturnType<typeof callbacks>;
const mountCard = async (item: BBTalk, extra: Partial<BBTalkCardProps> = {}) => {
  await act(async () => {
    tree = create(<BBTalkCard item={item} theme={THEMES[0]} {...cb} {...extra} />);
  });
};

const childText = (children: any): string =>
  typeof children === 'string' ? children
    : typeof children === 'number' ? String(children)
      : Array.isArray(children) ? children.map(childText).join('')
        : '';
const hasText = (s: string) => tree.root.findAllByType('Text').some((t: any) => childText(t.props.children) === s);
function tappable(label: string) {
  const matches = tree.root.findAllByType('TouchableOpacity').filter((node: any) =>
    node.props.accessibilityLabel === label);
  return matches.find((node: any) => !matches.some((other: any) => other !== node && node.findAllByType('TouchableOpacity').includes(other)));
}
async function press(label: string) { await act(async () => { void tappable(label)!.props.onPress(); }); }

beforeEach(() => {
  jest.clearAllMocks();
  cb = callbacks();
});

afterEach(() => { act(() => { tree?.unmount(); }); tree = undefined; });

describe('BBTalkCard rendering', () => {
  it('renders markdown content, tags and the pinned marker', async () => {
    const item = talk({
      content: '一条 **加粗** 的内容',
      isPinned: true,
      tags: [{ id: 'a', name: '日常', color: '#3B82F6' }, { id: 'b', name: '随笔', color: '' }],
    });
    await mountCard(item);
    expect(mockMarkdown).toHaveBeenCalled();
    expect(mockMarkdown.mock.calls[0]![0].children).toBe('一条 **加粗** 的内容');
    expect(hasText('日常')).toBe(true);
    expect(hasText('随笔')).toBe(true);
    expect(hasText('置顶')).toBe(true);
    expect(tappable('更多操作')).toBeDefined();
  });

  it('hides the tag row and pin marker when absent', async () => {
    await mountCard(talk());
    expect(hasText('置顶')).toBe(false);
    expect(tree.root.findAllByType('Text').filter((t: any) => t.props.style?.borderRadius === 12)).toHaveLength(0);
  });

  it('opens the image viewer for the tapped thumbnail', async () => {
    const item = talk({
      attachments: [
        { uid: 'i1', url: 'https://img.example/1.png', type: 'image' },
        { uid: 'i2', url: 'https://img.example/2.png', type: 'image' },
      ],
    });
    await mountCard(item);
    const thumbs = tree.root.findAllByType('ExpoImage');
    expect(thumbs.map((n: any) => n.props.source)).toEqual([
      { uri: 'https://img.example/1.png' }, { uri: 'https://img.example/2.png' },
    ]);
    await press('查看图片 2');
    expect(cb.onImagePreview).toHaveBeenCalledWith(['https://img.example/1.png', 'https://img.example/2.png'], 1);
  });

  it('routes audio and video attachments to their player buttons', async () => {
    const audio = { uid: 'a1', url: 'https://f.example/a.m4a', type: 'audio' };
    const video = { uid: 'v1', url: 'https://f.example/v.mp4', type: 'video' };
    await mountCard(talk({ attachments: [audio, video] }));
    expect(mockAudioPlayer.mock.calls[0]![0]).toMatchObject({ attachment: audio });
    expect(mockVideoPlayer.mock.calls[0]![0]).toMatchObject({ attachment: video });
    expect(tree.root.findAllByType('TouchableOpacity').some((n: any) => n.props.accessibilityLabel?.startsWith('打开附件'))).toBe(false);
  });

  it('renders a generic file card with size and opens it externally', async () => {
    const att = { uid: 'f1', url: 'https://f.example/doc.pdf', type: 'file', filename: '报告.pdf', fileSize: 12_288 };
    await mountCard(talk({ attachments: [att] }));
    expect(tappable('打开附件 报告.pdf')).toBeDefined();
    expect(hasText('文件 · 12KB')).toBe(true);
    await press('打开附件 报告.pdf');
    expect(Linking.openURL).toHaveBeenCalledWith('https://f.example/doc.pdf');
    expect(mockXAlert).not.toHaveBeenCalled();
  });

  it('falls back to the generic name and reports unopenable files', async () => {
    const att = { uid: 'f2', url: 'https://f.example/x.bin', type: 'file' };
    await mountCard(talk({ attachments: [att] }));
    expect(hasText('附件')).toBe(true);
    expect(hasText('文件')).toBe(true);

    (Linking.openURL as jest.Mock).mockImplementationOnce(() => Promise.reject(new Error('no app')));
    await press('打开附件 附件');
    await settle();
    expect(mockXAlert).toHaveBeenCalledWith('提示', '无法打开此文件');
  });
});

describe('BBTalkCard footer interactions', () => {
  it('forwards menu, edit, comment and visibility presses', async () => {
    const item = talk();
    await mountCard(item);
    await press('更多操作');
    expect(cb.onMenu).toHaveBeenCalledWith(item);
    await press('评论');
    expect(cb.onComment).toHaveBeenCalledWith(item);
    await press('切换为私密');
    expect(cb.onToggleVisibility).toHaveBeenCalledWith(item);
    await press(`碎碎念：${item.content}`);
    expect(cb.onEdit).toHaveBeenCalledWith(item);
  });

  it('labels the visibility toggle for private records', async () => {
    await mountCard(talk({ visibility: 'private' }));
    expect(tappable('切换为公开')).toBeDefined();
    expect(tappable('切换为私密')).toBeUndefined();
  });

  it('shows the location button only with a context location', async () => {
    const loc = { latitude: 31.2, longitude: 121.5 };
    await mountCard(talk({ context: { location: loc } }));
    await press('查看位置');
    expect(cb.onLocationPress).toHaveBeenCalledWith(loc);

    await mountCard(talk());
    expect(tappable('查看位置')).toBeUndefined();
  });

  it('shows the count and inline comments only when comments exist', async () => {
    await mountCard(talk({ commentCount: 3 }));
    expect(hasText('3')).toBe(true);
    expect(mockInlineComments.mock.calls[0]![0]).toMatchObject({ bbtalkId: 't1', commentCount: 3 });

    mockInlineComments.mockClear();
    await mountCard(talk({ commentCount: 0 }));
    expect(hasText('0')).toBe(false);
    expect(mockInlineComments).not.toHaveBeenCalled();

    const newComment = { uid: 'c9' } as Comment;
    await mountCard(talk(), { newComment });
    expect(mockInlineComments.mock.calls[0]![0]).toMatchObject({ commentCount: 0, newComment });
  });
});

describe('arePropsEqual', () => {
  const baseItem = () => talk({
    tags: [{ id: 'a', name: 'x', color: '#111111' }],
    attachments: [{ uid: 'f1', url: 'u', type: 'file' }],
    commentCount: 2,
  });
  const baseProps = (): BBTalkCardProps => ({
    item: baseItem(), newComment: null, theme: THEMES[0], ...callbacks(),
  });

  const cloneProps = (p: BBTalkCardProps): BBTalkCardProps => ({
    ...p,
    item: { ...p.item, tags: [...p.item.tags], attachments: [...p.item.attachments] },
  });

  it('treats structurally identical props as equal', () => {
    const prev = baseProps();
    expect(arePropsEqual(prev, cloneProps(prev))).toBe(true);
  });

  it('detects every changed item field', () => {
    const cases: Array<(p: BBTalkCardProps) => void> = [
      (p) => { p.item = { ...p.item, id: 'other' }; },
      (p) => { p.item = { ...p.item, content: 'changed' }; },
      (p) => { p.item = { ...p.item, updatedAt: '2026-10-09T00:00:00.000Z' }; },
      (p) => { p.item = { ...p.item, isPinned: true }; },
      (p) => { p.item = { ...p.item, commentCount: 9 }; },
      (p) => { p.item = { ...p.item, visibility: 'private' }; },
      (p) => { p.item = { ...p.item, tags: [...p.item.tags, { id: 'b', name: 'y', color: '#222222' }] }; },
      (p) => { p.item = { ...p.item, tags: [{ id: 'z', name: 'x', color: '#111111' }] }; },
      (p) => { p.item = { ...p.item, attachments: [...p.item.attachments, { uid: 'f2', url: 'u', type: 'file' }] }; },
      (p) => { p.item = { ...p.item, attachments: [{ uid: 'other', url: 'u', type: 'file' }] }; },
    ];
    cases.forEach((mutate) => {
      const prev = baseProps();
      const next = cloneProps(prev);
      mutate(next);
      expect(arePropsEqual(prev, next)).toBe(false);
    });
  });

  it('detects changed callbacks, comments and theme', () => {
    const callbackKeys = ['onMenu', 'onEdit', 'onToggleVisibility', 'onImagePreview', 'onLocationPress', 'onComment'] as const;
    callbackKeys.forEach((key) => {
      const prev = baseProps();
      const next = cloneProps(prev);
      (next as any)[key] = jest.fn();
      expect(arePropsEqual(prev, next)).toBe(false);
    });

    const withComment = cloneProps(baseProps());
    withComment.newComment = { uid: 'c1' } as Comment;
    expect(arePropsEqual(baseProps(), withComment)).toBe(false);

    const withTheme = cloneProps(baseProps());
    withTheme.theme = THEMES[1] ?? THEMES[0];
    if (withTheme.theme !== baseProps().theme) {
      expect(arePropsEqual(baseProps(), withTheme)).toBe(false);
    }
  });
});
