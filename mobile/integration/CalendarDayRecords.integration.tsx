import React from 'react';
import { Linking } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import CalendarDayRecords from '../src/components/CalendarDayRecords';
import { bbtalkApi } from '../src/services/api/bbtalkApi';
import { setSession } from '../src/services/session';
import { setHistoryLocked } from '../src/services/historyPrivacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BBTalk } from '../src/types';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../src/services/api/bbtalkApi', () => ({ bbtalkApi: { getBBTalks: jest.fn() } }));
jest.mock('../src/config', () => ({ getApiBaseUrl: () => 'https://calendar.example' }));
jest.mock('../src/services/auth', () => ({ getAccessTokenSync: () => 'token' }));

const item: BBTalk = {
  id: 'rich', content: '散步后的 **灵感**', tags: [{ id: 'walk', name: '散步', color: '#123456' }],
  attachments: [
    { uid: 'image', type: 'image', url: 'https://calendar.example/api/media/image', originalFilename: '公园.jpg' },
    { uid: 'audio', type: 'audio', url: 'https://calendar.example/api/media/audio', originalFilename: '鸟鸣.m4a', fileSize: 4096 },
    { uid: 'video', type: 'video', url: 'https://calendar.example/api/media/video', originalFilename: '河边.mp4' },
    { uid: 'file', type: 'file', url: 'https://calendar.example/api/media/file', originalFilename: '路线.pdf' },
  ],
  createdAt: '2026-10-01T08:35:00', updatedAt: '2026-10-01T08:35:00', isPinned: true, visibility: 'private',
};

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  setSession('https://calendar.example', 'owner');
  setHistoryLocked(false);
  (bbtalkApi.getBBTalks as jest.Mock).mockResolvedValue({ items: [item], page: 1, has_more: false });
});

test('day cards expose time, tags, formatted text and attachment previews before opening a record', async () => {
  const screen = render(<CalendarDayRecords date="2026-10-01" />);
  await screen.findByText('08:35');
  expect(screen.getByText('散步')).toBeTruthy();
  expect(screen.getByText('灵感')).toBeTruthy();
  expect(screen.queryByText('散步后的 **灵感**')).toBeNull();
  expect(screen.getByText('置顶')).toBeTruthy();
  expect(screen.getByText('仅自己')).toBeTruthy();
  expect(screen.getByLabelText('图片预览 1：公园.jpg')).toBeTruthy();
  expect(screen.getByText('鸟鸣.m4a')).toBeTruthy();
  expect(screen.getByText('音频 · 4KB')).toBeTruthy();
  expect(screen.getByText('河边.mp4')).toBeTruthy();
  expect(screen.getByText('路线.pdf')).toBeTruthy();
  fireEvent.press(screen.getByText('鸟鸣.m4a'));
  expect(mockNavigate).toHaveBeenCalledWith('RecordDetail', { item });
});

test('all preview presses retain the history lock and session guards', async () => {
  const screen = render(<CalendarDayRecords date="2026-10-01" />);
  await screen.findByText('鸟鸣.m4a');
  setHistoryLocked(true);
  fireEvent.press(screen.getByText('鸟鸣.m4a'));
  expect(mockNavigate).not.toHaveBeenCalled();
  setHistoryLocked(false);
  setSession('https://calendar.example', 'other-owner');
  fireEvent.press(screen.getByLabelText('图片预览 1：公园.jpg'));
  expect(mockNavigate).not.toHaveBeenCalled();
});

test('large media records bound image previews and long text while keeping the original detail payload', async () => {
  const largeItem: BBTalk = { ...item, content: '很长的日记。'.repeat(300), visibility: 'public', attachments: Array.from({ length: 12 }, (_, index) => ({ uid: `${index}`, type: 'image', url: `https://calendar.example/${index}.jpg` })) };
  (bbtalkApi.getBBTalks as jest.Mock).mockResolvedValue({ items: [largeItem], page: 1, has_more: false });
  const screen = render(<CalendarDayRecords date="2026-10-01" />);
  await screen.findByText('公开可见');
  expect(screen.getAllByLabelText(/^图片预览 /)).toHaveLength(4);
  expect(screen.getByText('+8')).toBeTruthy();
  expect(screen.queryByText(largeItem.content)).toBeNull();
  fireEvent.press(screen.getByText('阅读全文'));
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('RecordDetail', { item: largeItem }));
});

test('linked markdown images cannot bypass the guarded record action', async () => {
  const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  const linkedItem = { ...item, content: '[![地图预览](https://external.example/map.png)](https://external.example/map)', attachments: [] };
  (bbtalkApi.getBBTalks as jest.Mock).mockResolvedValue({ items: [linkedItem], page: 1, has_more: false });
  const screen = render(<CalendarDayRecords date="2026-10-01" />);
  const preview = await screen.findByText('地图预览');
  setHistoryLocked(true);
  fireEvent.press(preview);
  expect(openURL).not.toHaveBeenCalled();
  expect(mockNavigate).not.toHaveBeenCalled();
  setHistoryLocked(false);
  fireEvent.press(preview);
  expect(mockNavigate).toHaveBeenCalledWith('RecordDetail', { item: linkedItem });
  expect(openURL).not.toHaveBeenCalled();
  openURL.mockRestore();
});
