import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { render, fireEvent, waitFor, act, cleanup } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import HomeScreen from '../src/screens/HomeScreen';
import bbtalkReducer from '../src/store/slices/bbtalkSlice';
import tagReducer from '../src/store/slices/tagSlice';
import { apiClient } from '../src/services/api/apiClient';

const mockFocus = new Set<() => void>();
const mockNavigation = { navigate: jest.fn(), isFocused: () => true, addListener: (_event: string, callback: () => void) => { mockFocus.add(callback); return () => mockFocus.delete(callback); } };
const mockPrivacy = { resetPrivacyTimer: jest.fn(), loadPrivacySettings: jest.fn(), locked: false };
const mockCache = { isOffline: false, initCache: async () => {}, loadCachedData: async () => [], syncToCache: async () => {} };
const mockBatch = { selectedIds: new Set(), batchMode: false };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNavigation }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../src/services/api/apiClient', () => ({ apiClient: { get: jest.fn() } }));
jest.mock('../src/config', () => ({ getApiBaseUrl: () => 'https://integration.example' }));
jest.mock('../src/services/api/mediaApi', () => ({ attachmentApi: {} }));
jest.mock('../src/hooks/usePrivacyMode', () => ({ usePrivacyMode: () => mockPrivacy }));
jest.mock('../src/hooks/useOfflineCache', () => ({ useOfflineCache: () => mockCache }));
jest.mock('../src/hooks/useBatchMode', () => ({ useBatchMode: () => mockBatch }));
jest.mock('../src/hooks/useTagSwipe', () => ({ useTagSwipe: () => ({}) }));
jest.mock('../src/hooks/useBBTalkActions', () => ({ useBBTalkActions: () => ({}) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
jest.mock('../src/components/SwipeableBBTalkCard', () => ({ item }: any) => {
  const { Text } = require('react-native');
  return <Text>{item.content}</Text>;
});
jest.mock('../src/components/VoiceRecordingOverlay', () => () => null);
jest.mock('../src/components/UndoToast', () => () => null);
jest.mock('../src/components/SkeletonCard', () => () => null);
jest.mock('../src/components/ImageViewer', () => () => null);
jest.mock('../src/components/EmptyState', () => () => null);
jest.mock('../src/components/PrivacyLockOverlay', () => () => null);
jest.mock('../src/components/TagTabs', () => () => null);
jest.mock('../src/components/BatchToolbar', () => () => null);
jest.mock('../src/components/TagPickerModal', () => () => null);
jest.mock('../src/components/VisibilityPickerModal', () => () => null);
jest.mock('../src/components/OfflineBanner', () => () => null);
jest.mock('../src/components/CommentInputModal', () => () => null);

const tag = { id: 'tag-1', name: '工作', color: '#123456', sortOrder: 0, bbtalkCount: 1 };
function result(content: string) { return { count: 1, next: null, results: [{ uid: 'record', content, tags: [], attachments: [] }] }; }
function mount() {
  const store = configureStore({ reducer: { bbtalk: bbtalkReducer, tag: tagReducer }, preloadedState: { tag: { tags: [tag], isLoading: false, error: null } } });
  const tree = () => <Provider store={store}><HomeScreen selectedTag="tag-1" selectedDate="2026-09-07" onOpenDrawer={() => {}} /></Provider>;
  return { ...render(tree()), tree };
}
beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks(); mockFocus.clear(); mockCache.isOffline = false;
  AppState.currentState = 'active';
  (apiClient.get as jest.Mock).mockImplementation((url: string) => Promise.resolve(url.includes('/tags/') ? [] : result('初始记录')));
});
afterEach(() => { cleanup(); jest.restoreAllMocks(); });

test('foreground and network recovery preserve applied filters and unsubmitted search input', async () => {
  let active: (state: AppStateStatus) => void = () => {};
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => { active = callback; return { remove: jest.fn() }; });
  let now = 10000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  (apiClient.get as jest.Mock).mockImplementation((url: string) => Promise.resolve(url.includes('/tags/') ? [{ uid: 'tag-1', name: '工作' }] : result('初始记录')));
  const screen = mount();
  await screen.findByText('初始记录');
  fireEvent.press(screen.getByLabelText('搜索'));
  const input = screen.getByPlaceholderText('搜索碎碎念...');
  fireEvent.changeText(input, '已提交关键词');
  fireEvent(input, 'submitEditing');
  await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/api/v1/bbtalk/', expect.objectContaining({ search: '已提交关键词' })));
  fireEvent.changeText(input, '尚未提交的新关键词');
  (apiClient.get as jest.Mock).mockImplementation((url: string) => Promise.resolve(url.includes('/tags/') ? [{ uid: 'tag-1', name: '工作' }] : result('另一端新增记录')));
  await act(async () => { active('active'); });
  await screen.findByText('另一端新增记录');
  expect(screen.getByDisplayValue('尚未提交的新关键词')).toBeTruthy();
  const feedCalls = () => (apiClient.get as jest.Mock).mock.calls.filter(call => call[0] === '/api/v1/bbtalk/');
  expect(feedCalls().at(-1)[1]).toMatchObject({ search: '已提交关键词', tags__name: '工作', create_time__date: '2026-09-07' });
  const beforeFocus = feedCalls().length;
  await act(async () => { mockFocus.forEach(callback => callback()); });
  expect(feedCalls()).toHaveLength(beforeFocus);
  mockCache.isOffline = true;
  screen.rerender(screen.tree());
  now += 1100;
  mockCache.isOffline = false;
  screen.rerender(screen.tree());
  await waitFor(() => expect(feedCalls().length).toBeGreaterThan(beforeFocus));
  expect(feedCalls().at(-1)[1]).toMatchObject({ search: '已提交关键词', tags__name: '工作', create_time__date: '2026-09-07' });
  expect(screen.getByDisplayValue('尚未提交的新关键词')).toBeTruthy();
});

test('a late response for a previous search cannot replace the visible newer result', async () => {
  const screen = mount();
  await screen.findByText('初始记录');
  fireEvent.press(screen.getByLabelText('搜索'));
  let finishOld: (value: any) => void = () => {};
  (apiClient.get as jest.Mock).mockImplementation((url: string, params: any) => {
    if (url.includes('/tags/')) return Promise.resolve([]);
    if (params.search === '旧查询') return new Promise(resolve => { finishOld = resolve; });
    return Promise.resolve(result('新查询结果'));
  });
  const input = screen.getByPlaceholderText('搜索碎碎念...');
  fireEvent.changeText(input, '旧查询'); fireEvent(input, 'submitEditing');
  fireEvent.changeText(input, '新查询'); fireEvent(input, 'submitEditing');
  await screen.findByText('新查询结果');
  await act(async () => { finishOld(result('迟到的旧结果')); });
  expect(screen.getByText('新查询结果')).toBeTruthy();
  expect(screen.queryByText('迟到的旧结果')).toBeNull();
});
