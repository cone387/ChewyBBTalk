jest.mock('react-native', () => {
  const animation = () => ({ start: (done?: () => void) => done?.(), stop: jest.fn() });
  return {
    View: 'View', TextInput: 'TextInput', TouchableOpacity: 'TouchableOpacity',
    KeyboardAvoidingView: 'KeyboardAvoidingView', ActivityIndicator: 'ActivityIndicator',
    StyleSheet: { create: (value: unknown) => value, absoluteFill: {}, absoluteFillObject: {} },
    Platform: { OS: 'ios' }, Keyboard: {},
    Animated: { Value: class {}, View: 'AnimatedView', parallel: animation, timing: animation, spring: animation },
    BackHandler: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 20 }) }));
jest.mock('../../src/services/api/bbtalkApi', () => ({ bbtalkApi: { createComment: jest.fn() } }));
jest.mock('../../src/utils/crossAlert', () => ({ xAlert: jest.fn() }));
import React from 'react';
import { BackHandler } from 'react-native';
import CommentInputModal from '../../src/components/CommentInputModal';
import { bbtalkApi } from '../../src/services/api/bbtalkApi';
import { xAlert } from '../../src/utils/crossAlert';
import { clearSession, setSession } from '../../src/services/session';
import { THEMES } from '../../src/theme/themes';
const { create, act } = require('react-test-renderer');
let tree: any;
const comment = { uid: 'comment', content: 'hello' };
const api = bbtalkApi.createComment as jest.Mock;
const focus = jest.fn();
const props = () => ({ visible: true, bbtalkId: 'first', onClose: jest.fn(), onCommentAdded: jest.fn(), theme: THEMES[0] });
function mount(overrides = {}) {
  const values = { ...props(), ...overrides };
  act(() => { tree = create(<CommentInputModal {...values} />, {
    createNodeMock: (node: any) => node.type === 'TextInput' ? { focus } : null,
  }); });
  return values;
}
const input = () => tree.root.findByType('TextInput');
const send = () => tree.root.findAllByType('TouchableOpacity')[1];
function type(text: string) { act(() => input().props.onChangeText(text)); }
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks(); api.mockReset().mockResolvedValue(comment);
  clearSession(); setSession('https://server.example', 'alice');
});
afterEach(() => { act(() => tree?.unmount()); jest.clearAllTimers(); jest.useRealTimers(); });
it('renders nothing while hidden and removes the native back listener when closed', () => {
  const values = mount({ visible: false }); expect(tree.toJSON()).toBeNull();
  expect(BackHandler.addEventListener).not.toHaveBeenCalled();
  act(() => tree.update(<CommentInputModal {...values} visible />));
  const subscription = (BackHandler.addEventListener as jest.Mock).mock.results[0].value;
  act(() => tree.update(<CommentInputModal {...values} />));
  expect(subscription.remove).toHaveBeenCalledTimes(1);
});
it('does not submit blank or whitespace-only comments', async () => {
  mount(); type('   ');
  expect(send().props.disabled).toBe(true);
  await act(async () => send().props.onPress());
  expect(api).not.toHaveBeenCalled();
});
it('trims input and reports success before closing the panel', async () => {
  const values = mount(); type('  hello  ');
  await act(async () => send().props.onPress());
  expect(api).toHaveBeenCalledWith('first', 'hello');
  expect(values.onCommentAdded).toHaveBeenCalledWith(comment);
  expect(values.onClose).toHaveBeenCalledTimes(1);
  expect(input().props.value).toBe('');
});
it('prevents two invocations of the same send handler from creating duplicate comments', async () => {
  api.mockReturnValue(new Promise(() => {})); mount(); type('hello');
  const handler = send().props.onPress;
  act(() => { void handler(); void handler(); });
  expect(api).toHaveBeenCalledTimes(1);
  expect(input().props.editable).toBe(false);
  expect(send().props.disabled).toBe(true);
  expect(tree.root.findAllByType('ActivityIndicator')).toHaveLength(1);
});
it.each([new Error('offline'), {}, null])('preserves input and allows retry after a send failure: %p', async error => {
  api.mockRejectedValueOnce(error); const values = mount(); type('hello');
  await act(async () => send().props.onPress());
  expect(xAlert).toHaveBeenCalledWith('发送失败', error instanceof Error ? 'offline' : '请稍后重试');
  expect(input().props.value).toBe('hello'); expect(input().props.editable).toBe(true);
  expect(values.onClose).not.toHaveBeenCalled(); expect(values.onCommentAdded).not.toHaveBeenCalled();
  await act(async () => send().props.onPress()); expect(api).toHaveBeenCalledTimes(2);
});
it('focuses the input after opening and labels the send action for screen readers', () => {
  mount(); expect(focus).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(50)); expect(focus).toHaveBeenCalledTimes(1);
  expect(send().props).toMatchObject({ accessibilityRole: 'button', accessibilityLabel: '发送评论' });
});
it('closes through backdrop tap or hardware back without submitting', () => {
  const values = mount(); type('draft');
  act(() => tree.root.findAllByType('TouchableOpacity')[0].props.onPress());
  const handler = (BackHandler.addEventListener as jest.Mock).mock.calls[0][1];
  expect(handler()).toBe(true);
  expect(values.onClose).toHaveBeenCalledTimes(2); expect(api).not.toHaveBeenCalled();
});
it('clears old input when closed and reopened', () => {
  const values = mount(); type('draft');
  act(() => tree.update(<CommentInputModal {...values} visible={false} />));
  act(() => tree.update(<CommentInputModal {...values} />));
  expect(input().props.value).toBe('');
});
it('does not let an old record response close or clear a newer record input', async () => {
  let finish!: (value: typeof comment) => void;
  api.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const values = mount(); type('old'); act(() => { void send().props.onPress(); });
  const next = { ...values, bbtalkId: 'second', onClose: jest.fn(), onCommentAdded: jest.fn() };
  act(() => tree.update(<CommentInputModal {...next} />)); type('new input');
  await act(async () => finish(comment));
  expect(input().props.value).toBe('new input'); expect(next.onClose).not.toHaveBeenCalled();
  expect(values.onClose).not.toHaveBeenCalled(); expect(values.onCommentAdded).not.toHaveBeenCalled();
});
it('does not apply a completed comment to a newly signed-in account', async () => {
  let finish!: (value: typeof comment) => void;
  api.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const values = mount(); type('old'); act(() => { void send().props.onPress(); });
  setSession('https://server.example', 'bob');
  await act(async () => finish(comment));
  expect(values.onClose).not.toHaveBeenCalled(); expect(values.onCommentAdded).not.toHaveBeenCalled();
});
it('suppresses stale failure notifications after closing the panel', async () => {
  let fail!: (error: Error) => void;
  api.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
  const values = mount(); type('old'); act(() => { void send().props.onPress(); });
  act(() => tree.update(<CommentInputModal {...values} visible={false} />));
  await act(async () => fail(new Error('offline')));
  expect(xAlert).not.toHaveBeenCalled();
});
it('cancels its delayed focus and ignores completion after unmount', async () => {
  let finish!: (value: typeof comment) => void;
  api.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const values = mount(); type('old'); act(() => { void send().props.onPress(); });
  act(() => tree.unmount());
  expect(jest.getTimerCount()).toBe(0);
  await act(async () => finish(comment));
  expect(values.onClose).not.toHaveBeenCalled(); expect(values.onCommentAdded).not.toHaveBeenCalled();
});
