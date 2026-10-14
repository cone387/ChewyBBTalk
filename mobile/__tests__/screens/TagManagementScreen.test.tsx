const mockDispatch = jest.fn((action: any) => action);
const mockTagApi: any = {};
const mockLoadTagsThunk = jest.fn(() => ({ type: 'tag/loadTags' }));
const mockXAlert = jest.fn();
const mockXConfirm = jest.fn();
const mockXActionSheet = jest.fn();
const mockEmptyState = jest.fn((_props: any) => null as any);
const mockLoadingPlaceholder = jest.fn((_props: any) => null as any);
const mockDragStart = jest.fn();
const mockDragEnd = jest.fn();
jest.mock('react-native-draglist', () => ({
  __esModule: true,
  default: (props: any) => {
    const React = require('react');
    return React.createElement('DragList', props, props.ListHeaderComponent,
      props.data.length ? props.data.map((item: any, index: number) => React.createElement(React.Fragment, { key: item.id }, props.renderItem({ item, index, isActive: false, onDragStart: mockDragStart, onDragEnd: mockDragEnd }))) : props.ListEmptyComponent);
  },
}), { virtual: true });

jest.mock('../../src/services/api/tagApi', () => ({
  tagApi: {
    getTags: (...args: any[]) => mockTagApi.getTags(...args),
    updateTag: (...args: any[]) => mockTagApi.updateTag(...args),
    deleteTag: (...args: any[]) => mockTagApi.deleteTag(...args),
    reorder: (...args: any[]) => mockTagApi.reorder(...args),
  },
}));
jest.mock('../../src/store/hooks', () => ({ useAppDispatch: () => mockDispatch }));
jest.mock('../../src/store/slices/tagSlice', () => ({ get loadTags() { return mockLoadTagsThunk; }, setTags: (payload: any) => ({ type: 'tag/setTags', payload }) }));
jest.mock('../../src/utils/crossAlert', () => ({
  xAlert: (...args: any[]) => mockXAlert(...args),
  xConfirm: (...args: any[]) => mockXConfirm(...args),
  xActionSheet: (...args: any[]) => mockXActionSheet(...args),
}));
jest.mock('../../src/components/EmptyState', () => ({ __esModule: true, get default() { return mockEmptyState; } }));
jest.mock('../../src/components/LoadingPlaceholder', () => ({ __esModule: true, get default() { return mockLoadingPlaceholder; } }));

jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', TextInput: 'TextInput',
  ScrollView: 'ScrollView', Modal: 'Modal', KeyboardAvoidingView: 'KeyboardAvoidingView', Keyboard: { dismiss: jest.fn() }, LayoutAnimation: { configureNext: jest.fn() },
  UIManager: {}, Platform: { OS: 'ios', select: (options: any) => options.ios },
  StyleSheet: { create: (value: unknown) => value },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 10, bottom: 12, left: 0, right: 0 }) }));
jest.mock('../../src/theme/ThemeContext', () => ({ useTheme: () => ({ theme: require('../../src/theme/themes').THEMES[0] }) }));

import React from 'react';
import TagManagementScreen from '../../src/screens/TagManagementScreen';
import type { Tag } from '../../src/types';
import { setHistoryLocked } from '../../src/services/historyPrivacy';

const { create, act } = require('react-test-renderer');

let tree: any;
const settle = async (rounds = 3) => {
  for (let i = 0; i < rounds; i += 1) await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0); }); });
};
const makeTag = (id: string, name: string, count = 0): Tag =>
  ({ id, name, color: `#${id}`, sortOrder: 0, bbtalkCount: count });

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
async function press(label: string) { await act(async () => { void tappable(label)!.props.onPress(); }); }
async function openDelete(name: string) {
  await press(`编辑标签 ${name}`);
  await press('删除标签');
}
const hasText = (s: string) => tree.root.findAllByType('Text').some((t: any) => childText(t.props.children) === s);
const tagNames = () => tree.root.findAllByType('Text').map((t: any) => childText(t.props.children)).filter((s: string) => /^[a-c]$/.test(s));

beforeEach(() => {
  setHistoryLocked(false);
  jest.clearAllMocks();
  mockEmptyState.mockImplementation((_props: any) => null);
  mockLoadingPlaceholder.mockImplementation((_props: any) => null);
  mockTagApi.getTags = jest.fn(async () => [makeTag('a', 'a'), makeTag('b', 'b', 2), makeTag('c', 'c')]);
  mockTagApi.updateTag = jest.fn(async () => undefined);
  mockTagApi.deleteTag = jest.fn(async () => undefined);
  mockTagApi.reorder = jest.fn(async () => undefined);
});

afterEach(() => { act(() => { tree?.unmount(); }); tree = undefined; });

async function mountScreen() {
  await act(async () => { tree = create(<TagManagementScreen />); });
  await settle();
}

describe('TagManagementScreen loading', () => {
  it('shows a placeholder until the tag list resolves', async () => {
    let resolveTags!: (value: Tag[]) => void;
    mockTagApi.getTags = jest.fn(() => new Promise(resolve => { resolveTags = resolve; }));
    await act(async () => { tree = create(<TagManagementScreen />); });
    await settle();
    expect(mockLoadingPlaceholder).toHaveBeenCalled();
    expect(tappable('编辑标签 a')).toBeUndefined();
    await act(async () => { resolveTags([makeTag('a', 'a')]); });
    await settle();
    expect(tappable('编辑标签 a')).toBeDefined();
  });

  it('explains a failed load and retries successfully', async () => {
    mockTagApi.getTags = jest.fn()
      .mockImplementationOnce(() => Promise.reject(new Error('服务不可用')))
      .mockImplementationOnce(() => Promise.resolve([makeTag('a', 'a')]));
    await mountScreen();
    expect(hasText('服务不可用')).toBe(true);
    await press('重新加载');
    await settle();
    expect(hasText('服务不可用')).toBe(false);
    expect(tappable('编辑标签 a')).toBeDefined();
  });

  it('falls back to a generic load error message', async () => {
    mockTagApi.getTags = jest.fn().mockImplementationOnce(() => Promise.reject({}));
    await mountScreen();
    expect(hasText('标签加载失败，请重试')).toBe(true);
  });

  it('shows the empty state when there are no tags', async () => {
    mockTagApi.getTags = jest.fn(async () => []);
    await mountScreen();
    expect(mockEmptyState.mock.calls[0]![0]).toMatchObject({ title: '暂无标签', hint: '在碎碎念中输入 #标签名 自动创建' });
  });
});

describe('TagManagementScreen editing', () => {
  it('opens an edit modal directly without any more button and closes it on privacy lock', async () => {
    await mountScreen();
    expect(tappable('标签 a 的更多操作')).toBeUndefined();
    await press('编辑标签 a');
    expect(tree.root.findAllByType('Modal')).toHaveLength(1);
    expect(tree.root.findByType('Modal').findAllByType('TextInput')).toHaveLength(1);
    await act(async () => { setHistoryLocked(true); });
    expect(tree.root.findAllByType('Modal')).toHaveLength(0);
    expect(tappable('编辑标签 a')).toBeUndefined();
  });
  it('saves a renamed tag with a picked preset color and refreshes the store', async () => {
    await mountScreen();
    await press('编辑标签 a');
    const input = tree.root.findAllByType('TextInput')[0];
    await act(async () => { input.props.onChangeText('新名字'); });
    await press('标签颜色 #8B5CF6');
    expect(tappable('标签颜色 #8B5CF6')!.props.accessibilityState.selected).toBe(true);
    await press('保存');
    await settle();
    expect(mockTagApi.updateTag).toHaveBeenCalledWith('a', { name: '新名字', color: '#8B5CF6' });
    expect(mockLoadTagsThunk).not.toHaveBeenCalled();
    expect(mockTagApi.getTags).toHaveBeenCalledTimes(2);
    expect(mockDispatch).toHaveBeenLastCalledWith({ type: 'tag/setTags', payload: await mockTagApi.getTags.mock.results[1].value });
    expect(tappable('保存')).toBeUndefined();
    expect(tappable('编辑标签 a')).toBeDefined();
  });

  it('keeps a blank name from being saved and cancels without changes', async () => {
    await mountScreen();
    await press('编辑标签 a');
    const input = tree.root.findAllByType('TextInput')[0];
    await act(async () => { input.props.onChangeText('   '); });
    expect(tappable('保存')!.props.disabled).toBe(true);
    await press('取消');
    expect(mockTagApi.updateTag).not.toHaveBeenCalled();
    expect(tappable('编辑标签 a')).toBeDefined();
  });

  it('closes the edit modal with the system back action without saving', async () => {
    await mountScreen();
    await press('编辑标签 a');
    await act(async () => tree.root.findByType('Modal').props.onRequestClose());
    expect(tree.root.findAllByType('Modal')).toHaveLength(0);
    expect(mockTagApi.updateTag).not.toHaveBeenCalled();
  });

  it('reports a failed save and keeps the editor open', async () => {
    mockTagApi.updateTag = jest.fn().mockImplementationOnce(() => Promise.reject(new Error('名称重复')));
    await mountScreen();
    await press('编辑标签 a');
    await press('保存');
    await settle();
    expect(hasText('名称重复')).toBe(true);
    expect(tappable('保存')).toBeDefined();
  });

  it('blocks sibling actions while a save is in flight', async () => {
    let resolveSave!: (value: undefined) => void;
    mockTagApi.updateTag = jest.fn(() => new Promise(resolve => { resolveSave = resolve; }));
    await mountScreen();
    await press('编辑标签 a');
    await press('保存');
    await settle();
    expect(hasText('保存中…')).toBe(true);
    expect(tappable('编辑标签 b')!.props.disabled).toBe(true);
    await act(async () => { resolveSave(undefined); });
    await settle();
    expect(tappable('编辑标签 b')!.props.disabled).toBe(false);
  });
});

describe('TagManagementScreen deletion', () => {
  it('keeps empty tags editable, hides cascade deletion and allows cancelling', async () => {
    await mountScreen();
    await openDelete('a');
    expect(tappable('同时删除碎碎念')).toBeUndefined();
    await press('取消');
    expect(tree.root.findAllByType('TextInput')).toHaveLength(1);
    expect(mockTagApi.deleteTag).not.toHaveBeenCalled();
  });

  it('discards the deletion confirmation on lock and never restores it after unlocking', async () => {
    await mountScreen();
    await openDelete('b');
    await press('同时删除碎碎念');
    const confirm = tappable('确认删除').props.onPress;
    await act(async () => { setHistoryLocked(true); });
    await act(async () => { confirm(); });
    expect(mockTagApi.deleteTag).not.toHaveBeenCalled();
    await act(async () => { setHistoryLocked(false); });
    expect(tree.root.findAllByType('Modal')).toHaveLength(0);
  });

  it('offers keep-records and cascade options for a used tag', async () => {
    await mountScreen();
    await openDelete('b');
    expect(hasText('删除「b」？（关联 2 条碎碎念）')).toBe(true);
    expect(tappable('同时删除碎碎念')).toBeDefined();
    await press('仅删除标签，保留记录');
    await settle();
    expect(mockTagApi.deleteTag).toHaveBeenCalledWith('b', false);
    expect(mockLoadTagsThunk).not.toHaveBeenCalled();
    expect(mockTagApi.getTags).toHaveBeenCalledTimes(2);
    expect(mockDispatch).toHaveBeenLastCalledWith({ type: 'tag/setTags', payload: await mockTagApi.getTags.mock.results[1].value });
  });

  it('confirms before cascading to the linked records', async () => {
    await mountScreen();
    await openDelete('b');
    await press('同时删除碎碎念');
    expect(hasText('将永久删除「b」及其关联的 2 条记录，不可恢复！')).toBe(true);
    expect(mockTagApi.deleteTag).not.toHaveBeenCalled();
    await press('确认删除');
    await settle();
    expect(mockTagApi.deleteTag).toHaveBeenCalledWith('b', true);
  });

  it('reports delete failures from either option', async () => {
    mockTagApi.deleteTag = jest.fn().mockImplementationOnce(() => Promise.reject(new Error('被引用')));
    await mountScreen();
    await openDelete('b');
    await press('仅删除标签，保留记录');
    await settle();
    expect(hasText('被引用')).toBe(true);
  });
});

describe('TagManagementScreen reordering', () => {
  const drop = async (from: number, to: number) => {
    await act(async () => { tree.root.findByType('DragList').props.onReordered(from, to); });
    await settle();
  };

  it('starts from the drag handle and removes the arrow buttons', async () => {
    await mountScreen();
    expect(tappable('上移标签 a')).toBeUndefined();
    expect(tappable('下移标签 a')).toBeUndefined();
    const handle = tappable('拖动排序 a');
    await act(async () => { handle.props.onLongPress(); handle.props.onPressOut(); });
    expect(mockDragStart).toHaveBeenCalledTimes(1);
    expect(mockDragEnd).toHaveBeenCalledTimes(1);
  });

  it('moves a tag down and immediately updates the home navigation order', async () => {
    await mountScreen();
    await drop(0, 1);
    expect(mockTagApi.reorder).toHaveBeenCalledWith([
      { uid: 'b', sort_order: 0 }, { uid: 'a', sort_order: 1 }, { uid: 'c', sort_order: 2 },
    ]);
    expect(tagNames()).toEqual(['b', 'a', 'c']);
    expect(mockDispatch).toHaveBeenLastCalledWith({ type: 'tag/setTags', payload: expect.arrayContaining([expect.objectContaining({ id: 'b', sortOrder: 0 })]) });
  });

  it('moves a tag to the end and allows an accessible move without dragging', async () => {
    await mountScreen();
    await drop(0, 3);
    expect(tagNames()).toEqual(['b', 'c', 'a']);
    await act(async () => { tappable('拖动排序 a').props.onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } }); });
    await settle();
    expect(tagNames()).toEqual(['b', 'a', 'c']);
  });

  it('reverts the visual order when saving fails', async () => {
    mockTagApi.reorder = jest.fn().mockImplementationOnce(() => Promise.reject(new Error('冲突')));
    await mountScreen();
    await drop(0, 2);
    expect(tagNames()).toEqual(['a', 'b', 'c']);
    expect(hasText('冲突')).toBe(true);
  });

  it('does not save no-op drops and serializes pending saves', async () => {
    let finish!: () => void;
    mockTagApi.reorder = jest.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    await mountScreen();
    await drop(0, 0);
    expect(mockTagApi.reorder).not.toHaveBeenCalled();
    await drop(0, 2);
    expect(tappable('拖动排序 b').props.disabled).toBe(true);
    await drop(0, 1);
    expect(mockTagApi.reorder).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
    await settle();
    expect(tappable('拖动排序 b').props.disabled).toBe(false);
  });

  it('disables drag while editing to preserve the active input', async () => {
    await mountScreen();
    await press('编辑标签 a');
    expect(tappable('拖动排序 b').props.disabled).toBe(true);
  });
});
