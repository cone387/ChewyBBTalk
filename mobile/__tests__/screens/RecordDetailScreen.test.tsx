jest.mock('react-native', () => ({
  __esModule: true,
  View: 'View', Text: 'Text', ScrollView: 'ScrollView', TouchableOpacity: 'TouchableOpacity',
  Modal: 'Modal', Linking: { openURL: jest.fn(async () => undefined) },
  StyleSheet: { create: (value: unknown) => value },
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ popToTop: mockNav.popToTop, navigate: mockNav.navigate }),
  useRoute: () => ({ params: mockNav.params }),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 10, bottom: 20 }) }));
jest.mock('react-native-markdown-display', () => ({ __esModule: true, default: 'Markdown' }));
jest.mock('expo-image', () => ({ __esModule: true, Image: 'Image' }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('../../src/theme/ThemeContext', () => ({ useTheme: () => ({ theme: require('../../src/theme/themes').THEMES[0] }) }));
jest.mock('../../src/store/hooks', () => ({
  useAppSelector: (selector: any) => selector({ bbtalk: { bbtalks: mockStoreRecords } }),
}));
jest.mock('../../src/utils/markdownStyles', () => ({ getMarkdownStyles: jest.fn(() => ({ base: {} })) }));
jest.mock('../../src/utils/imageSource', () => ({ buildImageSource: jest.fn((url: string) => ({ uri: url })) }));
jest.mock('../../src/utils/formatTime', () => ({ formatTime: jest.fn(() => '2026-10-08 09:00') }));
jest.mock('../../src/utils/crossAlert', () => ({ xAlert: jest.fn() }));
jest.mock('../../src/services/historyPrivacy', () => ({
  subscribeHistoryPrivacy: jest.fn(() => jest.fn()),
  historyIsLocked: jest.fn(() => false),
  recordHistoryActivity: jest.fn(),
}));
jest.mock('../../src/components/AudioPlayerButton', () => ({ __esModule: true, default: 'AudioPlayerButton' }));
jest.mock('../../src/components/VideoPlayerButton', () => ({ __esModule: true, default: 'VideoPlayerButton' }));
jest.mock('../../src/components/ImageViewer', () => ({ __esModule: true, default: 'ImageViewer' }));

import React from 'react';
import RecordDetailScreen from '../../src/screens/RecordDetailScreen';

const { create, act } = require('react-test-renderer');
const { Linking } = require('react-native');
const { xAlert } = require('../../src/utils/crossAlert');
const { recordHistoryActivity } = require('../../src/services/historyPrivacy');
const { historyIsLocked } = require('../../src/services/historyPrivacy');
const { buildImageSource } = require('../../src/utils/imageSource');
const { formatTime } = require('../../src/utils/formatTime');

const mockNav: any = { popToTop: jest.fn(), navigate: jest.fn(), params: undefined as unknown };
const mockStoreRecords: any[] = [];

let tree: any;
const childText = (children: any): string =>
  typeof children === 'string' ? children
    : typeof children === 'number' ? String(children)
      : Array.isArray(children) ? children.map(childText).join('')
        : '';
const hasText = (s: string) => tree.root.findAllByType('Text').some((t: any) => childText(t.props.children) === s);
const tappable = (label: string) => tree.root.findAllByType('TouchableOpacity')
  .find((n: any) => n.props.accessibilityLabel === label);

const ITEM = {
  id: 'r1',
  content: '# 你好\n世界',
  createdAt: '2026-10-08T01:00:00Z',
  visibility: 'public',
  tags: [{ id: 't1', name: '日记' }, { id: 't2', name: '随笔' }],
  attachments: [
    { uid: 'a1', type: 'image', url: 'https://img.example/1.jpg', filename: '1.jpg', originalFilename: '' },
    { uid: 'a2', type: 'audio', url: 'https://img.example/2.m4a', filename: '2.m4a', originalFilename: '' },
    { uid: 'a3', type: 'video', url: 'https://img.example/3.mp4', filename: '3.mp4', originalFilename: '' },
    { uid: 'a4', type: 'file', url: 'https://img.example/4.pdf', filename: '4.pdf', originalFilename: '报告.pdf' },
  ],
};

async function mount() {
  await act(async () => { tree = create(<RecordDetailScreen />); });
}

beforeEach(() => {
  jest.clearAllMocks();
  (historyIsLocked as jest.Mock).mockReturnValue(false);
  mockNav.params = { item: ITEM };
  mockStoreRecords.length = 0;
});
afterEach(() => { act(() => { tree?.unmount(); }); tree = undefined; });

describe('RecordDetailScreen guards', () => {
  it('shows the lock shield while history is locked', async () => {
    (historyIsLocked as jest.Mock).mockReturnValue(true);
    await mount();
    expect(hasText('记录已锁定')).toBe(true);
    const back = tree.root.findAllByType('TouchableOpacity')[0];
    await act(async () => { void back.props.onPress(); });
    expect(mockNav.popToTop).toHaveBeenCalledTimes(1);
  });

  it('prompts to pick a record when the params are missing', async () => {
    mockNav.params = undefined;
    await mount();
    expect(hasText('请从记录列表选择一条记录。')).toBe(true);
    await act(async () => { void tree.root.findAllByType('TouchableOpacity')[0].props.onPress(); });
    expect(mockNav.navigate).toHaveBeenCalledWith('Home', { screen: 'Records' });
  });
});

describe('RecordDetailScreen content', () => {
  it('renders header, markdown, tags and reports scroll activity', async () => {
    await mount();
    expect(formatTime).toHaveBeenCalledWith(ITEM.createdAt);
    expect(hasText('2026-10-08 09:00 · 公开可见')).toBe(true);
    expect(tree.root.findByType('Markdown').props.children).toBe('# 你好\n世界');
    expect(hasText('#日记')).toBe(true);
    expect(hasText('#随笔')).toBe(true);
    const scroll = tree.root.findByType('ScrollView');
    await act(async () => { void scroll.props.onTouchStart(); });
    await act(async () => { void scroll.props.onScrollBeginDrag(); });
    expect(recordHistoryActivity).toHaveBeenCalledTimes(2);
  });

  it('marks private records and opens the editor', async () => {
    mockNav.params = { item: { ...ITEM, visibility: 'private' } };
    await mount();
    expect(hasText('2026-10-08 09:00 · 仅自己可见')).toBe(true);
    const edit = tree.root.findAllByType('TouchableOpacity')
      .find((n: any) => n.findAllByType('Text').some((t: any) => childText(t.props.children) === '编辑'))!;
    await act(async () => { void edit.props.onPress(); });
    expect(mockNav.navigate).toHaveBeenCalledWith('Compose', { editItem: mockNav.params.item });
  });

  it('prefers the fresh store copy over the routed item', async () => {
    mockStoreRecords.push({ ...ITEM, content: '最新内容' });
    await mount();
    expect(tree.root.findByType('Markdown').props.children).toBe('最新内容');
  });

  it('delegates attachments to their players', async () => {
    await mount();
    const audio = tree.root.findByType('AudioPlayerButton');
    expect(audio.props.attachment.uid).toBe('a2');
    const video = tree.root.findByType('VideoPlayerButton');
    expect(video.props.attachment.uid).toBe('a3');
  });

  it('opens generic attachments externally and alerts on failure', async () => {
    await mount();
    const file = tree.root.findAllByType('TouchableOpacity')
      .find((n: any) => n.findAllByType('Text').some((t: any) => childText(t.props.children) === '报告.pdf'))!;
    await act(async () => { void file.props.onPress(); });
    expect(Linking.openURL).toHaveBeenCalledWith('https://img.example/4.pdf');
    (Linking.openURL as jest.Mock).mockRejectedValueOnce(new Error('nope'));
    await act(async () => { void file.props.onPress(); });
    expect(xAlert).toHaveBeenCalledWith('无法打开附件', '请稍后重试');
  });

  it('falls back through the filename chain for generic attachments', async () => {
    mockNav.params = {
      item: {
        ...ITEM,
        attachments: [
          { uid: 'b1', type: 'file', url: 'u', filename: 'doc.bin', originalFilename: '' },
          { uid: 'b2', type: 'file', url: 'u', filename: '', originalFilename: '' },
        ],
      },
    };
    await mount();
    expect(hasText('doc.bin')).toBe(true);
    expect(hasText('打开附件')).toBe(true);
  });
});

describe('RecordDetailScreen image viewer', () => {
  it('opens the first image in the viewer and closes it', async () => {
    await mount();
    expect(tree.root.findByType('Modal').props.visible).toBe(false);
    await act(async () => { void tappable('查看照片')!.props.onPress(); });
    expect(tree.root.findByType('Modal').props.visible).toBe(true);
    expect(tree.root.findByType('ImageViewer').props.imageUrl).toBe('https://img.example/1.jpg');
    expect(buildImageSource).toHaveBeenCalledWith('https://img.example/1.jpg');
    await act(async () => { void tappable('关闭照片')!.props.onPress(); });
    expect(tree.root.findByType('Modal').props.visible).toBe(false);

    await act(async () => { void tappable('查看照片')!.props.onPress(); });
    await act(async () => { void tree.root.findByType('Modal').props.onRequestClose(); });
    expect(tree.root.findByType('Modal').props.visible).toBe(false);
  });
});
