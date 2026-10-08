// Factories execute during the import phase: all references to module-body
// holders are deferred (arrow wrappers or getters).
const mockNav: any = {};
let mockNavListeners: Record<string, () => void> = {};
const mockDispatch = jest.fn();
let mockStoreState: any = {};
const mockSlice: any = {};
const mockLoadTagsThunk = jest.fn(() => ({ type: 'tag/loadTags' }));
const mockPrivacy: any = {};
const mockOffline: any = {};
const mockActions: any = {};
const mockBatch: any = {};
const mockTagSwipe: any = { resetSlideAnim: jest.fn(), tagScrollRef: { current: null }, listSlideAnim: 0, panResponder: { panHandlers: {} } };
let mockHoldArgs: any[] = [];
let mockPrivacyArgs: any[] = [];
let mockActionsArgs: any[] = [];
let mockHoldPressed = false;
const mockVoiceOverlay = jest.fn((_props: any) => null as any);
const mockUndoToast = jest.fn((_props: any) => null as any);
const mockSkeleton = jest.fn((_props: any) => null as any);
const mockImageViewer = jest.fn((_props: any) => null as any);
const mockCard = jest.fn((_props: any) => null as any);
const mockEmptyState = jest.fn((_props: any) => null as any);
const mockPrivacyLock = jest.fn((_props: any) => null as any);
const mockSearchBar = jest.fn((_props: any) => null as any);
const mockSearchInput = jest.fn((_props: any) => null as any);
const mockTagTabs = jest.fn((_props: any) => null as any);
const mockBatchToolbar = jest.fn((_props: any) => null as any);
const mockTagPicker = jest.fn((_props: any) => null as any);
const mockVisibilityPicker = jest.fn((_props: any) => null as any);
const mockOfflineBanner = jest.fn((_props: any) => null as any);
const mockCommentModal = jest.fn((_props: any) => null as any);
const mockSetHistoryLocked = jest.fn();
const mockSetHistoryReady = jest.fn();
const mockOnHistoryActivity = jest.fn((..._args: any[]) => jest.fn());
const mockLogError = jest.fn();
const mockXAlert = jest.fn();
const mockXConfirm = jest.fn();
const mockLinkingOpenURL = jest.fn();
const mockBackHandler = { addEventListener: jest.fn((_event: string, _cb: () => boolean) => ({ remove: jest.fn() })) };
const mockAsyncStorage: any = {};
let mockSearchHistoryJson: string | null = null;
let mockShowTagTabs: string | null = null;
let mockFlatListComponent: any = null;

jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', ScrollView: 'ScrollView',
  ActivityIndicator: 'ActivityIndicator', StyleSheet: { create: (value: unknown) => value },
  Platform: { OS: 'ios', select: (options: any) => options.ios }, Modal: 'Modal',
  RefreshControl: 'RefreshControl', Animated: { View: 'AnimatedView' },
  LayoutAnimation: { configureNext: jest.fn(), create: jest.fn(() => ({})) },
  UIManager: {}, Linking: { openURL: (...args: any[]) => mockLinkingOpenURL(...args) },
  AppState: { currentState: 'active', addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  get BackHandler() { return mockBackHandler; },
  get FlatList() { return mockFlatListComponent; },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 10, bottom: 12, left: 0, right: 0 }) }));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNav.value,
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: (key: string) => mockAsyncStorage.getItem(key),
  setItem: (...args: any[]) => mockAsyncStorage.setItem(...args),
  removeItem: (...args: any[]) => mockAsyncStorage.removeItem(...args),
}));
jest.mock('../../src/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: any) => selector(mockStoreState.value),
}));
jest.mock('../../src/store/slices/bbtalkSlice', () => ({
  get loadBBTalks() { return mockSlice.loadBBTalks; },
  get loadMoreBBTalks() { return mockSlice.loadMoreBBTalks; },
  get togglePinAsync() { return mockSlice.togglePinAsync; },
  get setBBTalksFromCache() { return mockSlice.setBBTalksFromCache; },
  get incrementCommentCount() { return mockSlice.incrementCommentCount; },
}));
jest.mock('../../src/store/slices/tagSlice', () => ({
  get loadTags() { return mockLoadTagsThunk; },
}));
jest.mock('../../src/theme/ThemeContext', () => ({ useTheme: () => ({ theme: require('../../src/theme/themes').THEMES[0] }) }));
jest.mock('../../src/utils/crossAlert', () => ({
  xAlert: (...args: any[]) => mockXAlert(...args),
  xConfirm: (...args: any[]) => mockXConfirm(...args),
}));
jest.mock('../../src/utils/errorHandler', () => ({ logError: (...args: any[]) => mockLogError(...args) }));
jest.mock('../../src/services/historyPrivacy', () => ({
  setHistoryLocked: (...args: any[]) => mockSetHistoryLocked(...args),
  setHistoryPrivacyReady: (...args: any[]) => mockSetHistoryReady(...args),
  onHistoryActivity: (...args: any[]) => mockOnHistoryActivity(...args),
}));
jest.mock('../../src/hooks/usePrivacyMode', () => ({
  usePrivacyMode: (...args: any[]) => { mockPrivacyArgs = args; return mockPrivacy.value; },
}));
jest.mock('../../src/hooks/useOfflineCache', () => ({
  useOfflineCache: () => mockOffline.value,
}));
jest.mock('../../src/hooks/useBBTalkActions', () => ({
  useBBTalkActions: (...args: any[]) => { mockActionsArgs = args; return mockActions.value; },
}));
jest.mock('../../src/hooks/useBatchMode', () => ({
  useBatchMode: () => mockBatch.value,
}));
jest.mock('../../src/hooks/useTagSwipe', () => ({
  useTagSwipe: () => mockTagSwipe,
}));
jest.mock('../../src/hooks/useHoldToRecord', () => ({
  useHoldToRecord: (...args: any[]) => {
    mockHoldArgs = args;
    return { pressed: mockHoldPressed, holdMode: false, cancelHint: false, stopAction: undefined, handlers: {} };
  },
}));
jest.mock('../../src/components/VoiceRecordingOverlay', () => ({ __esModule: true, get default() { return mockVoiceOverlay; } }));
jest.mock('../../src/components/UndoToast', () => ({ __esModule: true, get default() { return mockUndoToast; } }));
jest.mock('../../src/components/SkeletonCard', () => ({ __esModule: true, get default() { return mockSkeleton; } }));
jest.mock('../../src/components/ImageViewer', () => ({ __esModule: true, get default() { return mockImageViewer; } }));
jest.mock('../../src/components/SwipeableBBTalkCard', () => ({ __esModule: true, get default() { return mockCard; } }));
jest.mock('../../src/components/EmptyState', () => ({ __esModule: true, get default() { return mockEmptyState; } }));
jest.mock('../../src/components/PrivacyLockOverlay', () => ({ __esModule: true, get default() { return mockPrivacyLock; } }));
jest.mock('../../src/components/SearchBar', () => ({
  __esModule: true,
  get default() { return mockSearchBar; },
  get SearchInput() { return mockSearchInput; },
}));
jest.mock('../../src/components/TagTabs', () => ({ __esModule: true, get default() { return mockTagTabs; } }));
jest.mock('../../src/components/BatchToolbar', () => ({ __esModule: true, get default() { return mockBatchToolbar; } }));
jest.mock('../../src/components/TagPickerModal', () => ({ __esModule: true, get default() { return mockTagPicker; } }));
jest.mock('../../src/components/VisibilityPickerModal', () => ({ __esModule: true, get default() { return mockVisibilityPicker; } }));
jest.mock('../../src/components/OfflineBanner', () => ({ __esModule: true, get default() { return mockOfflineBanner; } }));
jest.mock('../../src/components/CommentInputModal', () => ({ __esModule: true, get default() { return mockCommentModal; } }));

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import HomeScreen from '../../src/screens/HomeScreen';
import type { BBTalk, Comment } from '../../src/types';

const { create, act } = require('react-test-renderer');

const SearchTextInput = (props: any) => null;

// Minimal FlatList stand-in: flattens data through renderItem plus the
// header/empty/footer slots and exposes refresh/end-reached handlers.
const FlatListStub = (props: any) => (
  <View>
    {props.ListHeaderComponent ? <props.ListHeaderComponent /> : null}
    {props.data.length === 0 ? props.ListEmptyComponent ?? null : null}
    {(props.data || []).map((item: any, index: number) => (
      <View key={item.id}>{props.renderItem({ item, index })}</View>
    ))}
    {props.ListFooterComponent ?? null}
    {props.refreshControl}
    <TouchableOpacity accessibilityLabel="触底加载" onPress={() => props.onEndReached?.()} />
  </View>
);

const CardStub = (props: any) => (
  <View>
    <TouchableOpacity accessibilityLabel={`卡片 ${props.item.id}`} onPress={() => props.onEdit(props.item)} />
    <TouchableOpacity accessibilityLabel={`置顶 ${props.item.id}`} onPress={() => props.onTogglePin(props.item)} />
    <TouchableOpacity accessibilityLabel={`删除 ${props.item.id}`} onPress={() => props.onDelete(props.item)} />
    <TouchableOpacity accessibilityLabel={`菜单 ${props.item.id}`} onPress={() => props.onMenu(props.item)} />
    <TouchableOpacity accessibilityLabel={`图片 ${props.item.id}`} onPress={() => props.onImagePreview(['u0', 'u1', 'u2'], 1)} />
    <TouchableOpacity accessibilityLabel={`定位 ${props.item.id}`} onPress={() => props.onLocationPress({ latitude: 31.2304, longitude: 121.4737 })} />
    <TouchableOpacity accessibilityLabel={`评论 ${props.item.id}`} onPress={() => props.onComment(props.item)} />
    <TouchableOpacity accessibilityLabel={`长按 ${props.item.id}`} onPress={() => props.onLongPress(props.item)} />
    <TouchableOpacity accessibilityLabel={`选择 ${props.item.id}`} onPress={() => props.onSelect(props.item.id)} />
    {props.selected ? <Text>已选中 {props.item.id}</Text> : null}
    {props.newComment ? <Text>新评论 {props.newComment.content}</Text> : null}
  </View>
);

const SearchInputStub = (props: any) => (
  <View>
    <SearchTextInput value={props.searchText} onChangeText={props.onSearchTextChange} />
    <TouchableOpacity accessibilityLabel="提交搜索" onPress={() => props.onSubmit(props.searchText)} />
  </View>
);

const SearchBarStub = (props: any) => (
  <View>
    {(props.searchHistory || []).map((term: string) => (
      <TouchableOpacity key={term} accessibilityLabel={`历史词条 ${term}`} onPress={() => props.onHistoryItemPress(term)} />
    ))}
    <TouchableOpacity accessibilityLabel="清空搜索历史" onPress={props.onClearHistory} />
    <TouchableOpacity accessibilityLabel="关闭搜索面板" onPress={props.onClose} />
  </View>
);

const TagTabsStub = (props: any) => (
  <View>
    {(props.tags || []).map((tag: any) => (
      <TouchableOpacity key={tag.id} accessibilityLabel={`选择标签 ${tag.id}`} onPress={() => props.onSelectTag(tag.id)} />
    ))}
  </View>
);

const BatchToolbarStub = (props: any) => (
  <View>
    <Text>已选 {props.selectedCount} / {props.totalCount}</Text>
    <TouchableOpacity accessibilityLabel="全选" onPress={props.onSelectAll} />
    <TouchableOpacity accessibilityLabel="批量删除" onPress={props.onDelete} />
    <TouchableOpacity accessibilityLabel="批量改标签" onPress={props.onChangeTags} />
    <TouchableOpacity accessibilityLabel="批量改可见性" onPress={props.onChangeVisibility} />
    <TouchableOpacity accessibilityLabel="退出批量" onPress={props.onClose} />
  </View>
);

const TagPickerStub = (props: any) => {
  if (props.visible === false) return null;
  return (
    <View>
      <TouchableOpacity accessibilityLabel="确认标签选择" onPress={() => props.onConfirm(['工作'])} />
      <TouchableOpacity accessibilityLabel="确认空标签" onPress={() => props.onConfirm([])} />
      <TouchableOpacity accessibilityLabel="关闭标签选择" onPress={props.onClose} />
    </View>
  );
};

const VisibilityPickerStub = (props: any) => {
  if (props.visible === false) return null;
  return (
    <View>
      <TouchableOpacity accessibilityLabel="确认可见性选择" onPress={() => props.onConfirm('friends')} />
      <TouchableOpacity accessibilityLabel="关闭可见性选择" onPress={props.onClose} />
    </View>
  );
};

const CommentModalStub = (props: any) => {
  if (props.visible === false) return null;
  return (
    <View>
      <Text>评论框 {props.bbtalkId}</Text>
      <TouchableOpacity accessibilityLabel="完成评论" onPress={() => props.onCommentAdded({ id: 'c1', content: '好评', createdAt: '2026-10-08T00:00:00Z' } as unknown as Comment)} />
      <TouchableOpacity accessibilityLabel="关闭评论框" onPress={props.onClose} />
    </View>
  );
};

const PrivacyLockStub = (props: any) => (
  <View>
    <TouchableOpacity accessibilityLabel="锁屏去记录" onPress={props.onCompose} />
    <TouchableOpacity accessibilityLabel="锁屏录音" onPress={props.onVoiceRecord} />
    <TouchableOpacity accessibilityLabel="立即解锁" onPress={props.onUnlock} />
  </View>
);

const UndoToastStub = (props: any) => {
  if (!props.visible) return null;
  return (
    <View>
      <TouchableOpacity accessibilityLabel="撤销删除" onPress={props.onUndo} />
      <TouchableOpacity accessibilityLabel="忽略删除" onPress={props.onDismiss} />
    </View>
  );
};

const ImageViewerStub = (props: any) => (
  <View>
    <Text>查看器 {props.imageUrl}</Text>
    <TouchableOpacity accessibilityLabel="关闭查看器" onPress={props.onClose} />
  </View>
);

const EmptyStateStub = (props: any) => (
  <View>
    <Text>空态 {props.title}</Text>
    {props.actionLabel ? <TouchableOpacity accessibilityLabel={props.actionLabel} onPress={props.onAction} /> : null}
    {props.secondaryActionLabel ? <TouchableOpacity accessibilityLabel={props.secondaryActionLabel} onPress={props.onSecondaryAction} /> : null}
  </View>
);

function installStubs() {
  mockFlatListComponent = FlatListStub;
  mockCard.mockImplementation((props: any) => CardStub(props));
  mockSearchInput.mockImplementation((props: any) => SearchInputStub(props));
  mockSearchBar.mockImplementation((props: any) => SearchBarStub(props));
  mockTagTabs.mockImplementation((props: any) => TagTabsStub(props));
  mockBatchToolbar.mockImplementation((props: any) => BatchToolbarStub(props));
  mockTagPicker.mockImplementation((props: any) => TagPickerStub(props));
  mockVisibilityPicker.mockImplementation((props: any) => VisibilityPickerStub(props));
  mockCommentModal.mockImplementation((props: any) => CommentModalStub(props));
  mockPrivacyLock.mockImplementation((props: any) => PrivacyLockStub(props));
  mockUndoToast.mockImplementation((props: any) => UndoToastStub(props));
  mockImageViewer.mockImplementation((props: any) => ImageViewerStub(props));
  mockEmptyState.mockImplementation((props: any) => EmptyStateStub(props));
  mockVoiceOverlay.mockImplementation((_props: any) => null);
  mockOfflineBanner.mockImplementation((_props: any) => null);
}

let tree: any;
const makeTalk = (id: string): BBTalk => ({
  id, content: `内容 ${id}`, visibility: 'private', tags: [], attachments: [], context: {},
  isPinned: false, commentCount: 0, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
});

const settle = async (rounds = 2) => {
  for (let i = 0; i < rounds; i += 1) await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0); }); });
};
async function mountHome(props: any = {}) {
  await act(async () => { tree = create(<HomeScreen {...props} />); });
  await settle();
}
const childText = (children: any): string =>
  typeof children === 'string' ? children
    : typeof children === 'number' ? String(children)
      : Array.isArray(children) ? children.map(childText).join('')
        : '';
function tappable(label: string) {
  const matches = tree.root.findAllByType('TouchableOpacity').filter((node: any) =>
    node.props.accessibilityLabel === label || node.findAllByType('Text').some((text: any) => childText(text.props.children) === label));
  return matches.find((node: any) => !matches.some((other: any) => other !== node && node.findAllByType('TouchableOpacity').includes(other)));
}
async function press(label: string) { await act(async () => { await tappable(label)!.props.onPress(); }); }
const hasText = (s: string) => tree.root.findAllByType('Text').some((t: any) => childText(t.props.children) === s);
const overlayProps = () => mockVoiceOverlay.mock.calls[mockVoiceOverlay.mock.calls.length - 1][0];
const modalVisible = (label: string) => tree.root.findAllByType('Text').some((t: any) => childText(t.props.children).startsWith(label));

beforeEach(() => {
  installStubs();
  mockPrivacyArgs = [];
  mockActionsArgs = [];
  mockHoldPressed = false;
  mockNav.value = {
    navigate: jest.fn(),
    isFocused: jest.fn(() => true),
    addListener: jest.fn((event: string, cb: () => void) => { mockNavListeners[event] = cb; return () => { delete mockNavListeners[event]; }; }),
  };
  mockNavListeners = {};
  mockDispatch.mockReset().mockImplementation((action: any) => action);
  mockStoreState.value = {
    bbtalk: { hasLoadedFromNetwork: true, isFiltered: false, bbtalks: [makeTalk('a'), makeTalk('b')], isLoading: false, hasMore: true },
    tag: { tags: [{ id: 't1', name: '工作', color: '', sortOrder: 0, bbtalkCount: 1 }, { id: 't2', name: '生活', color: '', sortOrder: 0, bbtalkCount: 1 }] },
  };
  mockSlice.loadBBTalks = jest.fn((arg: any) => ({ type: 'bbtalk/load', arg }));
  mockSlice.loadMoreBBTalks = jest.fn((arg: any) => Promise.resolve({ type: 'bbtalk/loadMore', arg }));
  mockSlice.togglePinAsync = jest.fn((id: string) => ({ type: 'bbtalk/pin', id }));
  mockSlice.setBBTalksFromCache = jest.fn((items: any) => ({ type: 'bbtalk/fromCache', items }));
  mockSlice.incrementCommentCount = jest.fn((id: string) => ({ type: 'bbtalk/incComment', id }));
  mockLoadTagsThunk.mockClear();
  mockPrivacy.value = {
    settingsReady: true, locked: false, biometricAvailable: false, allowComposeWhenLocked: false,
    unlockPassword: '', unlocking: false, lockKeyboardH: 0, setUnlockPassword: jest.fn(),
    handleUnlock: jest.fn(), handleBiometricUnlock: jest.fn(), resetPrivacyTimer: jest.fn(),
    loadPrivacySettings: jest.fn(), showCountdown: false, privacyEnabled: false, privacySeconds: null, setLocked: jest.fn(),
  };
  mockOffline.value = {
    isOffline: false, lastSyncTime: 123, initCache: jest.fn(async () => {}),
    loadCachedData: jest.fn(async () => [] as BBTalk[]), syncToCache: jest.fn(async () => {}),
  };
  mockActions.value = {
    handleDelete: jest.fn(), showMenu: jest.fn(), toggleVisibility: jest.fn(),
    pendingDelete: null, handleUndo: jest.fn(), handleDismiss: jest.fn(),
  };
  mockBatch.value = {
    batchMode: false, selectedIds: new Set<string>(), isExecuting: false, progress: 0,
    enterBatchMode: jest.fn(), batchDelete: jest.fn(), batchUpdateTags: jest.fn(),
    batchUpdateVisibility: jest.fn(), exitBatchMode: jest.fn(), toggleSelect: jest.fn(), selectAll: jest.fn(),
  };
  mockHoldArgs = [];
  mockSetHistoryLocked.mockReset();
  mockSetHistoryReady.mockReset();
  mockOnHistoryActivity.mockClear();
  mockLogError.mockReset();
  mockXAlert.mockReset();
  mockXConfirm.mockReset();
  mockLinkingOpenURL.mockReset().mockImplementation(() => Promise.resolve());
  mockBackHandler.addEventListener.mockClear();
  mockSearchHistoryJson = null;
  mockShowTagTabs = null;
  mockAsyncStorage.getItem = jest.fn(async (key: string) =>
    key === 'search_history' ? mockSearchHistoryJson : key === 'show_tag_tabs' ? mockShowTagTabs : null);
  mockAsyncStorage.setItem = jest.fn(async () => undefined);
  mockAsyncStorage.removeItem = jest.fn(async () => undefined);
});

afterEach(() => { act(() => { tree?.unmount(); }); tree = undefined; });

describe('HomeScreen privacy gating', () => {
  it('renders nothing but the container until privacy settings are ready', async () => {
    mockPrivacy.value.settingsReady = false;
    await mountHome();
    expect(hasText('记录')).toBe(false);
    expect(tappable('搜索')).toBeUndefined();
  });

  it('shows the lock overlay with its shortcuts when locked', async () => {
    mockPrivacy.value.locked = true;
    await mountHome();
    expect(mockSetHistoryLocked).toHaveBeenCalledWith(true);
    const lockProps = mockPrivacyLock.mock.calls[mockPrivacyLock.mock.calls.length - 1]![0];
    expect(lockProps).toMatchObject({ locked: true, biometricAvailable: false, allowComposeWhenLocked: false });
    await press('锁屏去记录');
    expect(mockNav.value.navigate).toHaveBeenCalledWith('Compose');
    await press('立即解锁');
    expect(mockPrivacy.value.handleUnlock).toHaveBeenCalled();
    await press('锁屏录音');
    expect(mockVoiceOverlay.mock.calls.length).toBe(0);
  });

  it('publishes privacy readiness to the history service', async () => {
    await mountHome();
    expect(mockSetHistoryLocked).toHaveBeenCalledWith(false);
    expect(mockSetHistoryReady).toHaveBeenCalledWith(true);
    expect(mockOnHistoryActivity).toHaveBeenCalled();
  });
});

describe('HomeScreen list and navigation', () => {
  it('renders records, loads with filters, and opens details', async () => {
    const onSelectTag = jest.fn();
    await mountHome({ selectedTag: 't1', selectedDate: '2026-10-08', onSelectTag });
    expect(mockSlice.loadBBTalks).toHaveBeenCalledWith({ search: undefined, tags: ['工作'], date: '2026-10-08' });
    expect(tappable('卡片 a')).toBeDefined();
    await press('卡片 a');
    expect(mockNav.value.navigate).toHaveBeenCalledWith('RecordDetail', { item: expect.objectContaining({ id: 'a' }) });
    await press(`清除日期筛选：2026-10-08`);
    expect(onSelectTag).toHaveBeenCalledWith(null);
  });

  it('navigates to compose from the floating button tap', async () => {
    await mountHome();
    await act(async () => { mockHoldArgs[2]!(); });
    expect(mockNav.value.navigate).toHaveBeenCalledWith('Compose');
  });

  it('toggles pin for a record', async () => {
    await mountHome();
    await press('置顶 a');
    expect(mockSlice.togglePinAsync).toHaveBeenCalledWith('a');
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'bbtalk/pin', id: 'a' });
  });

  it('wires the delete flow and undo toast', async () => {
    mockActions.value.pendingDelete = { id: 'a' };
    await mountHome();
    await press('删除 a');
    expect(mockActions.value.handleDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
    await press('撤销删除');
    expect(mockActions.value.handleUndo).toHaveBeenCalled();
    await press('忽略删除');
    expect(mockActions.value.handleDismiss).toHaveBeenCalled();
  });
});

describe('HomeScreen offline guards', () => {
  it('blocks record writes with an explanation while offline', async () => {
    mockOffline.value.isOffline = true;
    await mountHome();
    await press('删除 a');
    await press('置顶 a');
    await press('评论 a');
    expect(mockXAlert).toHaveBeenCalledWith('离线模式', '当前处于离线模式，该操作需要网络连接');
    expect(mockXAlert).toHaveBeenCalledTimes(3);
    expect(mockActions.value.handleDelete).not.toHaveBeenCalled();
    expect(mockSlice.togglePinAsync).not.toHaveBeenCalled();
    expect(modalVisible('评论框')).toBe(false);
  });

  it('disables refresh and pagination while offline', async () => {
    mockOffline.value.isOffline = true;
    await mountHome();
    const initial = mockSlice.loadBBTalks.mock.calls.length;
    await act(async () => { await tree.root.findAllByType('RefreshControl')[0].props.onRefresh(); });
    await press('触底加载');
    expect(mockSlice.loadBBTalks.mock.calls.length).toBe(initial);
    expect(mockSlice.loadMoreBBTalks).not.toHaveBeenCalled();
  });
});

describe('HomeScreen comments and media', () => {
  it('opens the comment composer and reflects the added comment on the card', async () => {
    await mountHome();
    await press('评论 a');
    expect(modalVisible('评论框 a')).toBe(true);
    await press('完成评论');
    expect(mockSlice.incrementCommentCount).toHaveBeenCalledWith('a');
    expect(hasText('新评论 好评')).toBe(true);
    await press('关闭评论框');
    expect(modalVisible('评论框')).toBe(false);
  });

  it('pages through the image preview modal', async () => {
    await mountHome();
    await press('图片 a');
    expect(modalVisible('查看器 u1')).toBe(true);
    expect(hasText('2 / 3')).toBe(true);
    await press('上一张图片');
    expect(modalVisible('查看器 u0')).toBe(true);
    expect(tappable('上一张图片')).toBeUndefined();
    await press('下一张图片');
    await press('下一张图片');
    expect(modalVisible('查看器 u2')).toBe(true);
    expect(tappable('下一张图片')).toBeUndefined();
    await press('关闭图片预览');
    expect(tree.root.findAllByType('Modal')[0].props.visible).toBe(false);
  });

  it('opens the map after confirming location info', async () => {
    await mountHome();
    await press('定位 a');
    expect(mockXConfirm).toHaveBeenCalledWith('定位信息', expect.stringContaining('31.230400'), expect.any(Function), undefined, {
      confirmText: '在地图中打开', cancelText: '关闭',
    });
    await act(async () => { mockXConfirm.mock.calls[0][2](); });
    expect(mockLinkingOpenURL).toHaveBeenCalledWith('maps:?q=31.2304,121.4737');
  });
});

describe('HomeScreen batch mode', () => {
  it('enters batch mode from a card long press', async () => {
    await mountHome();
    await press('长按 a');
    expect(mockBatch.value.enterBatchMode).toHaveBeenCalledWith('a');
  });

  it('exposes batch actions and forwards them to the batch hook', async () => {
    mockBatch.value.batchMode = true;
    mockBatch.value.selectedIds = new Set(['a', 'b']);
    await mountHome();
    expect(hasText('已选 2 / 2')).toBe(true);
    expect(tappable('新建碎碎念')).toBeUndefined();
    await press('全选');
    expect(mockBatch.value.selectAll).toHaveBeenCalledWith(['a', 'b']);
    await press('批量删除');
    expect(mockBatch.value.batchDelete).toHaveBeenCalledWith(['a', 'b']);
    await press('退出批量');
    expect(mockBatch.value.exitBatchMode).toHaveBeenCalled();
  });

  it('applies tag and visibility pickers to the selected records', async () => {
    mockBatch.value.batchMode = true;
    mockBatch.value.selectedIds = new Set(['a']);
    await mountHome();
    await press('批量改标签');
    expect(mockTagPicker.mock.calls[mockTagPicker.mock.calls.length - 1][0].visible).toBe(true);
    await press('确认标签选择');
    expect(mockBatch.value.batchUpdateTags).toHaveBeenCalledWith(['a'], ['工作']);
    await press('批量改可见性');
    await press('确认可见性选择');
    expect(mockBatch.value.batchUpdateVisibility).toHaveBeenCalledWith(['a'], 'friends');
    await press('批量改标签');
    await press('确认空标签');
    expect(mockBatch.value.batchUpdateTags).toHaveBeenCalledTimes(1);
  });

  it('blocks batch operations while offline', async () => {
    mockOffline.value.isOffline = true;
    mockBatch.value.batchMode = true;
    mockBatch.value.selectedIds = new Set(['a']);
    await mountHome();
    await press('批量删除');
    expect(mockXAlert).toHaveBeenCalledWith('离线模式', '当前处于离线模式，该操作需要网络连接');
    expect(mockBatch.value.batchDelete).not.toHaveBeenCalled();
  });

  it('exits batch mode on the android back button', async () => {
    mockBatch.value.batchMode = true;
    await mountHome();
    expect(mockBackHandler.addEventListener).toHaveBeenCalledWith('hardwareBackPress', expect.any(Function));
    const onBack = mockBackHandler.addEventListener.mock.calls[0]![1]!;
    expect(onBack()).toBe(true);
    expect(mockBatch.value.exitBatchMode).toHaveBeenCalled();
  });
});

describe('HomeScreen search', () => {
  it('submits a search, reloads with it, and clears on close', async () => {
    await mountHome();
    await press('搜索');
    await act(async () => {
      tree.root.findAllByType(SearchTextInput)[0].props.onChangeText('关键词');
    });
    await press('提交搜索');
    expect(mockAsyncStorage.setItem).toHaveBeenCalledWith('search_history', JSON.stringify(['关键词']));
    expect(mockSlice.loadBBTalks).toHaveBeenLastCalledWith({ search: '关键词', tags: [], date: undefined });
    await press('关闭搜索');
    expect(mockSlice.loadBBTalks).toHaveBeenLastCalledWith({ search: undefined, tags: [], date: undefined });
    expect(tappable('提交搜索')).toBeUndefined();
  });

  it('loads history from storage, reuses entries, and clears them', async () => {
    mockSearchHistoryJson = JSON.stringify(['旧词', '别的']);
    await mountHome();
    await press('搜索');
    const barProps = mockSearchBar.mock.calls[mockSearchBar.mock.calls.length - 1][0];
    expect(barProps.searchHistory).toEqual(['旧词', '别的']);
    await press('历史词条 旧词');
    expect(tree.root.findAllByType(SearchTextInput)[0].props.value).toBe('旧词');
    await press('清空搜索历史');
    expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('search_history');
  });
});

describe('HomeScreen data lifecycle', () => {
  it('hydrates cached records on mount without clobbering an empty cache', async () => {
    const cached = [makeTalk('c1')];
    mockOffline.value.loadCachedData = jest.fn(async () => cached);
    await mountHome();
    expect(mockOffline.value.initCache).toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'bbtalk/fromCache', items: cached });
  });

  it('syncs authoritative network results to the cache once per change', async () => {
    await mountHome();
    expect(mockOffline.value.syncToCache).toHaveBeenCalledTimes(1);
    expect(mockOffline.value.syncToCache).toHaveBeenCalledWith([expect.objectContaining({ id: 'a' }), expect.objectContaining({ id: 'b' })]);
  });

  it('reloads on focus through the throttled foreground refresh', async () => {
    await mountHome();
    const initial = mockSlice.loadBBTalks.mock.calls.length;
    await act(async () => { mockNavListeners.focus!(); });
    expect(mockSlice.loadBBTalks.mock.calls.length).toBe(initial + 1);
    expect(mockLoadTagsThunk).toHaveBeenCalled();
  });

  it('loads the next page when the list end is reached', async () => {
    await mountHome();
    await press('触底加载');
    expect(mockSlice.loadMoreBBTalks).toHaveBeenCalledWith({ search: undefined, tags: [], date: undefined });
  });

  it('shows the done footer when there is no more data', async () => {
    mockStoreState.value.bbtalk.hasMore = false;
    await mountHome();
    expect(hasText('没有更多了')).toBe(true);
  });
});

describe('HomeScreen empty and loading states', () => {
  it('shows skeletons during the first load', async () => {
    mockStoreState.value.bbtalk.isLoading = true;
    mockStoreState.value.bbtalk.bbtalks = [];
    await mountHome();
    expect(mockSkeleton).toHaveBeenCalledTimes(4);
  });

  it('offers the first-record actions when idle and unfiltered', async () => {
    mockStoreState.value.bbtalk.bbtalks = [];
    await mountHome();
    expect(mockEmptyState.mock.calls[mockEmptyState.mock.calls.length - 1]![0]).toMatchObject({ title: '写下你的第一条碎碎念' });
    await press('写下第一条');
    expect(mockNav.value.navigate).toHaveBeenCalledWith('Compose');
    await press('录一段语音');
    expect(overlayProps().visible).toBe(true);
  });

  it('explains an empty filtered result', async () => {
    mockStoreState.value.bbtalk.bbtalks = [];
    await mountHome({ selectedTag: 't1' });
    expect(mockEmptyState.mock.calls[mockEmptyState.mock.calls.length - 1]![0]).toMatchObject({ title: '没有找到匹配的碎碎念' });
  });
});

describe('HomeScreen tag tabs and voice', () => {
  it('toggles the tag tab row and selects a tag', async () => {
    const onSelectTag = jest.fn();
    await mountHome({ onSelectTag });
    expect(tappable('选择标签 t2')).toBeDefined();
    await press('标签筛选');
    expect(tappable('选择标签 t2')).toBeUndefined();
    await press('标签筛选');
    await press('选择标签 t2');
    expect(onSelectTag).toHaveBeenCalledWith('t2');
  });

  it('hides tag tabs via the persisted setting', async () => {
    mockShowTagTabs = 'false';
    await mountHome();
    expect(tappable('选择标签 t1')).toBeUndefined();
  });

  it('finishes a voice recording by navigating to compose with the result', async () => {
    await mountHome();
    await act(async () => { mockHoldArgs[0]!(); });
    expect(overlayProps().visible).toBe(true);
    const result = { text: '语音', audioUri: null, audioDuration: 2 };
    await act(async () => { await overlayProps().onFinish(result); });
    expect(mockNav.value.navigate).toHaveBeenCalledWith('Compose', { voiceResult: result });
    expect(overlayProps().visible).toBe(false);
    await act(async () => { mockHoldArgs[0]!(); });
    await act(async () => { overlayProps().onCancel(); });
    expect(overlayProps().visible).toBe(false);
  });

  it('closes the overlay without navigating when nothing was captured', async () => {
    await mountHome();
    await act(async () => { mockHoldArgs[0]!(); });
    await act(async () => { await overlayProps().onFinish({ text: '', audioUri: null, audioDuration: 0 }); });
    expect(mockNav.value.navigate).not.toHaveBeenCalled();
    expect(overlayProps().visible).toBe(false);
  });
});

describe('HomeScreen hook wiring', () => {
  it('forwards privacy errors through the shared showError callback', async () => {
    await mountHome();
    mockPrivacyArgs[0].showError('隐私错误', '详细原因');
    expect(mockXAlert).toHaveBeenCalledWith('隐私错误', '详细原因');
  });

  it('navigates to compose with and without an edit item', async () => {
    await mountHome();
    mockActionsArgs[0].onNavigateCompose(makeTalk('a'));
    mockActionsArgs[0].onNavigateCompose();
    expect(mockNav.value.navigate).toHaveBeenNthCalledWith(1, 'Compose', { editItem: expect.objectContaining({ id: 'a' }) });
    expect(mockNav.value.navigate).toHaveBeenNthCalledWith(2, 'Compose', undefined);
  });

  it('ignores comments reported without an open comment target', async () => {
    await mountHome();
    const props = mockCommentModal.mock.calls[mockCommentModal.mock.calls.length - 1]![0];
    await act(async () => { props.onCommentAdded({ id: 'c0', content: 'x', createdAt: '2026-10-08T00:00:00Z' } as unknown as Comment); });
    expect(mockSlice.incrementCommentCount).not.toHaveBeenCalled();
  });
});

describe('HomeScreen refresh plumbing', () => {
  it('animates the transition from skeletons to loaded records', async () => {
    mockStoreState.value.bbtalk.isLoading = true;
    await act(async () => { tree = create(<HomeScreen selectedTag={null} selectedDate={null} />); });
    await settle();
    mockStoreState.value.bbtalk.isLoading = false;
    // A fresh element is required: re-using the initial one lets React bail out of the re-render.
    await act(async () => { tree.update(<HomeScreen selectedTag={null} selectedDate={null} />); });
    await settle();
    const { LayoutAnimation } = require('react-native');
    expect(LayoutAnimation.create).toHaveBeenCalledWith(300, 'easeInEaseOut', 'opacity');
  });

  it('refreshes privacy settings and the tag tab preference on focus', async () => {
    await mountHome();
    // The privacy focus listener is registered before the foreground refresh one.
    const privacyFocus = mockNav.value.addListener.mock.calls.filter((call: any[]) => call[0] === 'focus')[0]![1]!;
    await act(async () => { privacyFocus(); });
    expect(mockPrivacy.value.loadPrivacySettings).toHaveBeenCalled();
    expect(mockAsyncStorage.getItem).toHaveBeenCalledWith('show_tag_tabs');
  });

  it('skips the foreground refresh when unfocused, backgrounded, or throttled', async () => {
    await mountHome();
    const initial = mockSlice.loadBBTalks.mock.calls.length;
    const RN = require('react-native');
    mockNav.value.isFocused = jest.fn(() => false);
    await act(async () => { mockNavListeners.focus!(); });
    mockNav.value.isFocused = jest.fn(() => true);
    RN.AppState.currentState = 'background';
    await act(async () => { mockNavListeners.focus!(); });
    RN.AppState.currentState = 'active';
    await act(async () => { mockNavListeners.focus!(); });
    await act(async () => { mockNavListeners.focus!(); }); // throttled within a second
    expect(mockSlice.loadBBTalks.mock.calls.length).toBe(initial + 1);
  });

  it('refreshes from the app-state change listener', async () => {
    const RN = require('react-native');
    RN.AppState.addEventListener.mockClear();
    await mountHome();
    const initial = mockSlice.loadBBTalks.mock.calls.length;
    const onChange = RN.AppState.addEventListener.mock.calls[0]![1]!;
    await act(async () => { onChange('active'); });
    expect(mockSlice.loadBBTalks.mock.calls.length).toBe(initial + 1);
  });

  it('refreshes the list when connectivity returns', async () => {
    mockOffline.value.isOffline = true;
    await act(async () => { tree = create(<HomeScreen selectedTag={null} selectedDate={null} />); });
    await settle();
    const initial = mockSlice.loadBBTalks.mock.calls.length;
    mockOffline.value.isOffline = false;
    await act(async () => { tree.update(<HomeScreen selectedTag={null} selectedDate={null} />); });
    await settle();
    expect(mockSlice.loadBBTalks.mock.calls.length).toBe(initial + 1);
  });

  it('logs cache initialization failures', async () => {
    mockOffline.value.initCache = jest.fn(async () => { throw new Error('db'); });
    await mountHome();
    expect(mockLogError).toHaveBeenCalledWith(expect.any(Error), 'HomeScreen offline cache init');
  });

  it('shows the pagination spinner while the next page loads', async () => {
    let resolveMore!: (v: any) => void;
    mockSlice.loadMoreBBTalks = jest.fn(() => new Promise((resolve) => { resolveMore = resolve; }));
    await mountHome();
    await press('触底加载');
    expect(mockSlice.loadMoreBBTalks).toHaveBeenCalledTimes(1);
    expect(tree.root.findAllByType('ActivityIndicator').length).toBe(1);
    await act(async () => { resolveMore({ type: 'done' }); });
    await settle();
    expect(tree.root.findAllByType('ActivityIndicator').length).toBe(0);
  });
});

describe('HomeScreen search and pickers', () => {
  it('closes the search through the panel close button', async () => {
    await mountHome();
    await press('搜索');
    expect(tappable('提交搜索')).toBeDefined();
    await press('关闭搜索面板');
    expect(tappable('提交搜索')).toBeUndefined();
  });

  it('saves the typed term when closing the search', async () => {
    await mountHome();
    await press('搜索');
    await act(async () => { tree.root.findAllByType(SearchTextInput)[0].props.onChangeText('临时'); });
    await press('关闭搜索');
    expect(mockAsyncStorage.setItem).toHaveBeenCalledWith('search_history', JSON.stringify(['临时']));
    expect(tappable('提交搜索')).toBeUndefined();
  });

  it('ignores blank search submissions', async () => {
    await mountHome();
    await press('搜索');
    await act(async () => { tree.root.findAllByType(SearchTextInput)[0].props.onChangeText('   '); });
    await press('提交搜索');
    expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('closes the tag and visibility pickers through their cancel buttons', async () => {
    mockBatch.value.batchMode = true;
    mockBatch.value.selectedIds = new Set(['a']);
    await mountHome();
    await press('批量改标签');
    await press('关闭标签选择');
    expect(mockTagPicker.mock.calls[mockTagPicker.mock.calls.length - 1]![0].visible).toBe(false);
    await press('批量改可见性');
    await press('关闭可见性选择');
    expect(mockVisibilityPicker.mock.calls[mockVisibilityPicker.mock.calls.length - 1]![0].visible).toBe(false);
  });

  it('skips guarded batch and long-press actions with nothing selected', async () => {
    mockBatch.value.batchMode = true;
    mockBatch.value.selectedIds = new Set<string>();
    await mountHome();
    await press('长按 a'); // already inside batch mode
    expect(mockBatch.value.enterBatchMode).not.toHaveBeenCalled();
    await press('批量删除');
    expect(mockBatch.value.batchDelete).not.toHaveBeenCalled();
    await press('批量改标签');
    await press('批量改可见性');
    expect(mockTagPicker.mock.calls[mockTagPicker.mock.calls.length - 1]![0].visible).toBe(false);
    expect(mockVisibilityPicker.mock.calls[mockVisibilityPicker.mock.calls.length - 1]![0].visible).toBe(false);
    const tagProps = mockTagPicker.mock.calls[mockTagPicker.mock.calls.length - 1]![0];
    const visProps = mockVisibilityPicker.mock.calls[mockVisibilityPicker.mock.calls.length - 1]![0];
    await act(async () => { tagProps.onConfirm(['工作']); });
    await act(async () => { visProps.onConfirm('public'); });
    expect(mockBatch.value.batchUpdateTags).not.toHaveBeenCalled();
    expect(mockBatch.value.batchUpdateVisibility).not.toHaveBeenCalled();
  });
});

describe('HomeScreen ui details', () => {
  it('extracts stable keys from the flat list data', async () => {
    await mountHome();
    const list = tree.root.findAllByType(mockFlatListComponent)[0];
    expect(list.props.keyExtractor(makeTalk('a'))).toBe('a');
  });

  it('shows and uses the privacy countdown badge', async () => {
    mockPrivacy.value.showCountdown = true;
    mockPrivacy.value.privacyEnabled = true;
    mockPrivacy.value.privacySeconds = 90;
    await mountHome();
    expect(hasText('1:30')).toBe(true);
    await press('锁定内容');
    expect(mockPrivacy.value.setLocked).toHaveBeenCalledWith(true);
    await act(async () => { tappable('锁定内容')!.props.onLongPress!(); });
    expect(mockNav.value.navigate).toHaveBeenCalledWith('PrivacySettings');
  });

  it('formats short countdowns in seconds', async () => {
    mockPrivacy.value.showCountdown = true;
    mockPrivacy.value.privacyEnabled = true;
    mockPrivacy.value.privacySeconds = 45;
    await mountHome();
    expect(hasText('45s')).toBe(true);
  });

  it('closes the image viewer through its own close button and the back request', async () => {
    await mountHome();
    await press('图片 a');
    expect(tree.root.findAllByType('Modal')[0].props.visible).toBe(true);
    await press('关闭查看器');
    expect(tree.root.findAllByType('Modal')[0].props.visible).toBe(false);
    await press('图片 a');
    await act(async () => { tree.root.findAllByType('Modal')[0].props.onRequestClose(); });
    expect(tree.root.findAllByType('Modal')[0].props.visible).toBe(false);
  });

  it('dims the compose button while a recording press is active', async () => {
    mockHoldPressed = true;
    await mountHome();
    const fab = tree.root.findAllByType('View').find((node: any) => node.props.accessibilityLabel === '新建碎碎念');
    expect(fab.props.style[fab.props.style.length - 1].opacity).toBe(0.85);
  });
});
