jest.mock('react-native', () => {
  const animation = () => ({ start: (done?: () => void) => done?.(), stop: jest.fn() });
  return { View: 'View', TextInput: 'TextInput', TouchableOpacity: 'TouchableOpacity', KeyboardAvoidingView: 'KeyboardAvoidingView',
    ActivityIndicator: 'ActivityIndicator', Platform: { OS: 'web' }, Keyboard: {},
    StyleSheet: { create: (value: unknown) => value, absoluteFill: {}, absoluteFillObject: {} },
    Animated: { Value: class {}, View: 'AnimatedView', timing: animation, spring: animation, parallel: animation },
    BackHandler: { addEventListener: jest.fn() } };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 20 }) }));
jest.mock('../../src/services/api/bbtalkApi', () => ({ bbtalkApi: { createComment: jest.fn() } }));
jest.mock('../../src/utils/crossAlert', () => ({ xAlert: jest.fn() }));
import React from 'react';
import { BackHandler } from 'react-native';
import CommentInputModal from '../../src/components/CommentInputModal';
import { bbtalkApi } from '../../src/services/api/bbtalkApi';
import { THEMES } from '../../src/theme/themes';
const { create, act } = require('react-test-renderer');
let tree: any;
const input = () => tree.root.findByType('TextInput');
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks(); (bbtalkApi.createComment as jest.Mock).mockResolvedValue({ uid: 'comment' });
  act(() => { tree = create(<CommentInputModal visible bbtalkId="record" theme={THEMES[0]} onClose={jest.fn()} onCommentAdded={jest.fn()} />); });
  act(() => input().props.onChangeText('hello'));
});
afterEach(() => { act(() => tree.unmount()); jest.clearAllTimers(); jest.useRealTimers(); });
it('uses a web overlay and single-line input without native back handling', () => {
  expect(tree.root.findAllByType('KeyboardAvoidingView')).toHaveLength(0);
  expect(BackHandler.addEventListener).not.toHaveBeenCalled();
  expect(input().props).toMatchObject({ multiline: false, blurOnSubmit: true, maxLength: 500 });
});
it('submits Enter and prevents its browser default behavior', async () => {
  const event = { nativeEvent: { key: 'Enter' }, preventDefault: jest.fn() };
  await act(async () => input().props.onKeyPress(event));
  expect(event.preventDefault).toHaveBeenCalledTimes(1);
  expect(bbtalkApi.createComment).toHaveBeenCalledWith('record', 'hello');
});
it.each([{ key: 'Enter', shiftKey: true }, { key: 'a' }])('does not submit for %p', async nativeEvent => {
  const event = { nativeEvent, preventDefault: jest.fn() };
  await act(async () => input().props.onKeyPress(event));
  expect(event.preventDefault).not.toHaveBeenCalled(); expect(bbtalkApi.createComment).not.toHaveBeenCalled();
});
it('deduplicates browsers that trigger both keypress and submit-editing for Enter', async () => {
  (bbtalkApi.createComment as jest.Mock).mockReturnValue(new Promise(() => {}));
  const handlers = input().props;
  act(() => {
    handlers.onKeyPress({ nativeEvent: { key: 'Enter' }, preventDefault: jest.fn() });
    void handlers.onSubmitEditing();
  });
  expect(bbtalkApi.createComment).toHaveBeenCalledTimes(1);
});
