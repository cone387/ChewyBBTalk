jest.mock('react-native', () => ({ View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', ActivityIndicator: 'ActivityIndicator', StyleSheet: { create: (styles: unknown) => styles } }));
jest.mock('../../src/services/api/bbtalkApi', () => ({ bbtalkApi: { getComments: jest.fn(), deleteComment: jest.fn() } }));
jest.mock('../../src/utils/crossAlert', () => ({ xAlert: jest.fn(), xConfirm: jest.fn() }));
jest.mock('../../src/store/hooks', () => ({ useAppDispatch: jest.fn() }));
jest.mock('../../src/store/slices/bbtalkSlice', () => ({ decrementCommentCount: (id: string) => ({ type: 'bbtalk/decrementCommentCount', payload: id }) }));
import React from 'react';
import InlineComments from '../../src/components/InlineComments';
import { bbtalkApi } from '../../src/services/api/bbtalkApi';
import { xAlert, xConfirm } from '../../src/utils/crossAlert';
import { useAppDispatch } from '../../src/store/hooks';
import { setSession, clearSession } from '../../src/services/session';
import { THEMES } from '../../src/theme/themes';
import type { Comment } from '../../src/types';
const { create, act } = require('react-test-renderer');
let tree: any;
const dispatch = jest.fn();
const api = bbtalkApi.getComments as jest.Mock;
const remove = bbtalkApi.deleteComment as jest.Mock;
const comment = (uid: string): Comment => ({ uid, user: 1, content: `body-${uid}`, userUsername: 'alice', userDisplayName: '', userAvatar: '', createdAt: '2026-01-01T00:00:00Z', updatedAt: '' });
function props(overrides = {}) { return { bbtalkId: 'first', commentCount: 1, theme: THEMES[0], ...overrides }; }
async function mount(overrides = {}) {
  const values = props(overrides);
  await act(async () => { tree = create(<InlineComments {...values} />); });
  return values;
}
const rows = () => tree.root.findAllByType('TouchableOpacity').filter((row: any) => row.props.onLongPress);
const text = () => JSON.stringify(tree.toJSON());
const confirm = () => (xConfirm as jest.Mock).mock.calls.at(-1)[2] as () => Promise<void>;
beforeEach(() => {
  jest.clearAllMocks(); api.mockReset().mockResolvedValue([comment('one')]); remove.mockReset().mockResolvedValue(undefined);
  (useAppDispatch as jest.Mock).mockReturnValue(dispatch);
  clearSession(); setSession('https://server.example', 'alice');
});
afterEach(() => act(() => tree?.unmount()));
it('does not request or display an empty comment section', async () => {
  await mount({ commentCount: 0 }); expect(tree.toJSON()).toBeNull(); expect(api).not.toHaveBeenCalled();
});
it('loads the current record and shows the author and body', async () => {
  await mount(); expect(api).toHaveBeenCalledWith('first');
  expect(text()).toContain('alice'); expect(text()).toContain('body-one'); expect(rows()).toHaveLength(1);
});
it('shows pending load state without requesting the same record twice', async () => {
  api.mockReturnValue(new Promise(() => {})); const values = await mount();
  expect(tree.root.findAllByType('ActivityIndicator')).toHaveLength(1);
  await act(async () => tree.update(<InlineComments {...values} commentCount={2} />));
  expect(api).toHaveBeenCalledTimes(1);
});
it('expands all comments and collapses back to the first three', async () => {
  api.mockResolvedValue(['one', 'two', 'three', 'four'].map(comment)); await mount();
  expect(rows()).toHaveLength(3); expect(text()).toContain('查看全部 4 条评论');
  act(() => tree.root.findAllByType('TouchableOpacity').at(-1).props.onPress());
  expect(rows()).toHaveLength(4); expect(text()).toContain('收起');
  act(() => tree.root.findAllByType('TouchableOpacity').at(-1).props.onPress()); expect(rows()).toHaveLength(3);
});
it('appends a newly created comment without fetching an empty record', async () => {
  const values = await mount({ commentCount: 0 });
  await act(async () => tree.update(<InlineComments {...values} newComment={comment('new')} />));
  expect(rows()).toHaveLength(1); expect(text()).toContain('body-new'); expect(api).not.toHaveBeenCalled();
});
it('does not duplicate an existing comment when a new object with the same uid is received', async () => {
  const values = await mount();
  await act(async () => tree.update(<InlineComments {...values} newComment={{ ...comment('one'), content: 'updated' }} />));
  expect(rows()).toHaveLength(1); expect(text()).toContain('updated');
});
it('preserves locally added comments when an earlier list request completes', async () => {
  let finish!: (data: Comment[]) => void;
  api.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const values = await mount();
  await act(async () => tree.update(<InlineComments {...values} newComment={comment('new')} />));
  await act(async () => finish([comment('one')]));
  expect(rows()).toHaveLength(2); expect(text()).toContain('body-new');
});
it('asks for confirmation and changes the list and count only after deletion succeeds', async () => {
  await mount(); act(() => rows()[0].props.onLongPress());
  expect(remove).not.toHaveBeenCalled(); expect(dispatch).not.toHaveBeenCalled();
  await act(async () => confirm()());
  expect(remove).toHaveBeenCalledWith('first', 'one'); expect(tree.toJSON()).toBeNull();
  expect(dispatch).toHaveBeenCalledWith({ type: 'bbtalk/decrementCommentCount', payload: 'first' });
});
it('keeps the comment and count unchanged after deletion fails', async () => {
  remove.mockRejectedValue(new Error('offline')); await mount(); act(() => rows()[0].props.onLongPress());
  await act(async () => confirm()());
  expect(rows()).toHaveLength(1); expect(dispatch).not.toHaveBeenCalled(); expect(xAlert).toHaveBeenCalledWith('删除失败', 'offline');
});
it('ignores a late list result belonging to the previous record', async () => {
  let finish!: (data: Comment[]) => void;
  api.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue([comment('second')]);
  const values = await mount();
  await act(async () => tree.update(<InlineComments {...values} bbtalkId="second" />));
  await act(async () => finish([comment('old')]));
  expect(text()).toContain('body-second'); expect(text()).not.toContain('body-old');
});
it('resets record-specific loaded state when showing another record', async () => {
  const values = await mount(); api.mockResolvedValue([comment('second')]);
  await act(async () => tree.update(<InlineComments {...values} bbtalkId="second" />));
  expect(api).toHaveBeenLastCalledWith('second'); expect(text()).not.toContain('body-one');
});
it('rejects an old confirmation after the account changes', async () => {
  await mount(); act(() => rows()[0].props.onLongPress()); const pending = confirm();
  await act(async () => setSession('https://server.example', 'bob'));
  await act(async () => pending());
  expect(remove).not.toHaveBeenCalled(); expect(dispatch).not.toHaveBeenCalled();
});
it('prevents duplicate confirmed deletions while the first request is pending', async () => {
  remove.mockReturnValue(new Promise(() => {})); await mount(); act(() => rows()[0].props.onLongPress());
  const pending = confirm(); act(() => { void pending(); void pending(); });
  expect(remove).toHaveBeenCalledTimes(1);
});
it('shows a load failure and allows explicit retry', async () => {
  api.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([comment('one')]); await mount();
  expect(text()).toContain('评论加载失败');
  const retry = tree.root.findAllByType('TouchableOpacity').find((button: any) => button.props.accessibilityLabel === '重试加载评论');
  await act(async () => retry.props.onPress()); expect(rows()).toHaveLength(1); expect(api).toHaveBeenCalledTimes(2);
});
it('does not restore a successfully deleted comment from an earlier list response', async () => {
  let finish!: (data: Comment[]) => void;
  api.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const values = await mount();
  await act(async () => tree.update(<InlineComments {...values} newComment={comment('new')} />));
  act(() => rows()[0].props.onLongPress()); await act(async () => confirm()());
  await act(async () => finish([comment('one'), comment('new')]));
  expect(rows()).toHaveLength(1); expect(text()).not.toContain('body-new');
});
it('does not apply an old deletion result to another record or its comment count', async () => {
  let finish!: () => void;
  remove.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  const values = await mount(); act(() => rows()[0].props.onLongPress());
  act(() => { void confirm()(); }); api.mockResolvedValue([comment('second')]);
  await act(async () => tree.update(<InlineComments {...values} bbtalkId="second" />));
  await act(async () => finish());
  expect(text()).toContain('body-second'); expect(dispatch).not.toHaveBeenCalled();
});
