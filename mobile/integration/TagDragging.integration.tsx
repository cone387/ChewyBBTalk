import React from 'react';
import { Animated, FlatList, PanResponder, View } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import TagManagementScreen from '../src/screens/TagManagementScreen';
import { tagApi } from '../src/services/api/tagApi';
import { setSession } from '../src/services/session';
import { xAlert } from '../src/utils/crossAlert';

const mockDispatch = jest.fn();
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 24 }) }));
jest.mock('../src/store/hooks', () => ({ useAppDispatch: () => mockDispatch }));
jest.mock('../src/services/api/tagApi', () => ({ tagApi: { getTags: jest.fn(), reorder: jest.fn() } }));
jest.mock('../src/utils/crossAlert', () => ({ xAlert: jest.fn(), xActionSheet: jest.fn(), xConfirm: jest.fn() }));

const tags = ['生活', '工作', '阅读'].map((name, index) => ({ id: `${index}`, name, color: '#345678', sortOrder: index, bbtalkCount: index }));
let responder: Parameters<typeof PanResponder.create>[0];
beforeEach(() => {
  jest.clearAllMocks();
  setSession('https://tags.test', 'owner');
  (tagApi.getTags as jest.Mock).mockResolvedValue(tags);
  (tagApi.reorder as jest.Mock).mockResolvedValue(undefined);
  const create = PanResponder.create;
  jest.spyOn(PanResponder, 'create').mockImplementation(config => { responder = config; return create(config); });
  jest.spyOn(View.prototype, 'measure').mockImplementation(callback => callback(0, 0, 375, 600, 0, 0));
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

async function mount() {
  const screen = render(<TagManagementScreen />);
  await screen.findByLabelText('拖动排序 生活');
  const list = screen.UNSAFE_getByType(FlatList);
  const Cell = list.props.CellRendererComponent;
  screen.UNSAFE_getAllByType(Cell).forEach((cell, index) => {
    fireEvent(cell.findByType(Animated.View), 'layout', { nativeEvent: { layout: { x: 0, y: 120 + index * 80, width: 343, height: 80 } } });
  });
  const viewport = screen.UNSAFE_getAllByType(View).find(node => node.props.onMoveShouldSetResponder);
  fireEvent(viewport!, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 375, height: 600 } } });
  return screen;
}

test('real drag list moves a tag across multiple rows, saves once and releases scrolling', async () => {
  const screen = await mount();
  fireEvent(screen.getByLabelText('拖动排序 生活'), 'longPress');
  await act(async () => { responder.onPanResponderGrant!({} as any, { y0: 160 } as any); });
  await act(async () => { responder.onPanResponderMove!({} as any, { y0: 160, dy: 180 } as any); });
  expect(tagApi.reorder).not.toHaveBeenCalled();
  await act(async () => { await responder.onPanResponderRelease!({} as any, {} as any); });
  await waitFor(() => expect(tagApi.reorder).toHaveBeenCalledWith([
    { uid: '1', sort_order: 0 }, { uid: '2', sort_order: 1 }, { uid: '0', sort_order: 2 },
  ]));
  expect(tagApi.reorder).toHaveBeenCalledTimes(1);
  expect(screen.UNSAFE_getByType(FlatList).props.scrollEnabled).toBe(true);
  expect(screen.getByLabelText('拖动排序 生活').props.accessibilityValue.now).toBe(3);
  expect(mockDispatch).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'tag/setTags', payload: expect.arrayContaining([expect.objectContaining({ id: '0', sortOrder: 2 })]) }));
});

test('long press without moving does not save or leave the list locked', async () => {
  const screen = await mount();
  fireEvent(screen.getByLabelText('拖动排序 生活'), 'longPress');
  fireEvent(screen.getByLabelText('拖动排序 生活'), 'pressOut');
  expect(tagApi.reorder).not.toHaveBeenCalled();
  expect(screen.UNSAFE_getByType(FlatList).props.scrollEnabled).toBe(true);
});

test('a long list scrolls at the drag edge and stops scrolling after release', async () => {
  const many = [...tags, ...Array.from({ length: 17 }, (_, index) => ({ ...tags[0], id: `extra-${index}`, name: `标签${index}` }))];
  (tagApi.getTags as jest.Mock).mockResolvedValue(many);
  const scroll = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {});
  const screen = await mount();
  fireEvent(screen.UNSAFE_getByType(FlatList), 'contentSizeChange', 375, 1720);
  jest.useFakeTimers();
  fireEvent(screen.getByLabelText('拖动排序 生活'), 'longPress');
  await act(async () => { responder.onPanResponderGrant!({} as any, { y0: 160 } as any); });
  await act(async () => {
    responder.onPanResponderMove!({} as any, { y0: 160, dy: 440 } as any);
    jest.advanceTimersByTime(250);
  });
  expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ animated: false, offset: expect.any(Number) }));
  expect(scroll.mock.calls.at(-1)![0].offset).toBeGreaterThan(0);
  await act(async () => { await responder.onPanResponderRelease!({} as any, {} as any); });
  scroll.mockClear();
  await act(async () => jest.advanceTimersByTime(250));
  expect(scroll).not.toHaveBeenCalled();
  expect(screen.UNSAFE_getByType(FlatList).props.scrollEnabled).toBe(true);
});

test('an interrupted drag releases the gesture and saves its current position once', async () => {
  const screen = await mount();
  fireEvent(screen.getByLabelText('拖动排序 生活'), 'longPress');
  await act(async () => { responder.onPanResponderGrant!({} as any, { y0: 160 } as any); });
  await act(async () => { responder.onPanResponderMove!({} as any, { y0: 160, dy: 180 } as any); });
  await act(async () => { await responder.onPanResponderTerminate!({} as any, {} as any); });
  expect(tagApi.reorder).toHaveBeenCalledTimes(1);
  expect(screen.UNSAFE_getByType(FlatList).props.scrollEnabled).toBe(true);
});

test('a pending failed sort cannot overwrite another account after switching sessions', async () => {
  let reject!: (reason: Error) => void;
  (tagApi.reorder as jest.Mock).mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
  const screen = await mount();
  fireEvent(screen.getByLabelText('拖动排序 生活'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
  expect(tagApi.reorder).toHaveBeenCalledTimes(1);
  mockDispatch.mockClear();
  setSession('https://tags.test', 'other');
  await act(async () => reject(new Error('网络中断')));
  expect(mockDispatch).not.toHaveBeenCalled();
  expect(xAlert).not.toHaveBeenCalled();
});
