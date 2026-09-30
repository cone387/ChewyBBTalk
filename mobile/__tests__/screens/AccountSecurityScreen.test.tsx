jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', ScrollView: 'ScrollView',
  TextInput: 'TextInput', ActivityIndicator: 'ActivityIndicator', KeyboardAvoidingView: 'KeyboardAvoidingView',
  StyleSheet: { create: (value: unknown) => value }, Platform: { OS: 'ios' },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 20 }) }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));
jest.mock('../../src/theme/ThemeContext', () => ({ useTheme: () => ({ theme: require('../../src/theme/themes').THEMES[0] }) }));
jest.mock('../../src/services/auth', () => ({ getCurrentUser: jest.fn(), logout: jest.fn() }));
jest.mock('../../src/services/api/userApi', () => ({ userApi: { changePassword: jest.fn(), deleteAccount: jest.fn() } }));
jest.mock('../../src/services/pendingMedia', () => ({ removeAccountDrafts: jest.fn() }));
jest.mock('../../src/utils/crossAlert', () => ({ xAlert: jest.fn(), xConfirm: jest.fn() }));
import React from 'react';
import AccountSecurityScreen from '../../src/screens/AccountSecurityScreen';
import { getCurrentUser, logout } from '../../src/services/auth';
import { userApi } from '../../src/services/api/userApi';
import { removeAccountDrafts } from '../../src/services/pendingMedia';
import { getSession, clearSession, setSession } from '../../src/services/session';
import { xAlert, xConfirm } from '../../src/utils/crossAlert';
const { create, act } = require('react-test-renderer');
const mockNavigate = jest.fn();
let tree: any;
let onLogout: jest.Mock;
const change = userApi.changePassword as jest.Mock;
const deletion = userApi.deleteAccount as jest.Mock;
function mount() { onLogout = jest.fn(); act(() => { tree = create(<AccountSecurityScreen onLogout={onLogout} />); }); }
const input = (label: string) => tree.root.findAllByType('TextInput').find((node: any) => node.props.accessibilityLabel === label || node.props.placeholder === label);
function type(label: string, value: string) { act(() => input(label).props.onChangeText(value)); }
const button = (label: string) => tree.root.findAllByType('TouchableOpacity').find((node: any) => node.props.accessibilityLabel === label || node.findAllByType('Text').some((text: any) => text.props.children === label));
async function press(label: string) { await act(async () => button(label).props.onPress()); }
function passwords(old = 'old password', next = 'new password', repeat = next) {
  type('当前密码', old); type('新密码（至少 8 位）', next); type('再次输入新密码', repeat);
}
async function openDelete() { await press('删除账号'); act(() => (xConfirm as jest.Mock).mock.calls.at(-1)[2]()); }
function pending(api: jest.Mock) {
  let resolve!: () => void; let reject!: (error: unknown) => void;
  api.mockReturnValueOnce(new Promise<void>((yes, no) => { resolve = yes; reject = no; }));
  return { resolve, reject };
}
beforeEach(() => {
  jest.clearAllMocks(); change.mockReset().mockResolvedValue(undefined); deletion.mockReset().mockResolvedValue(undefined);
  (removeAccountDrafts as jest.Mock).mockReset().mockResolvedValue(undefined);
  (logout as jest.Mock).mockReset().mockImplementation(async () => clearSession());
  (getCurrentUser as jest.Mock).mockReturnValue({ username: 'alice', display_name: 'Alice', email: 'alice@example.com' });
  clearSession(); setSession('https://server.example', 'alice');
});
afterEach(() => { act(() => tree?.unmount()); tree = undefined; });
it('shows account details and opens profile editing', async () => {
  mount(); expect(JSON.stringify(tree.toJSON())).toContain('alice@example.com');
  await press('编辑账号信息'); expect(mockNavigate).toHaveBeenCalledWith('ProfileEdit');
});
it('shows username and recovery advice when profile fields are missing', () => {
  (getCurrentUser as jest.Mock).mockReturnValue({ username: 'alice' }); mount();
  expect(JSON.stringify(tree.toJSON())).toContain('尚未填写邮箱'); expect(JSON.stringify(tree.toJSON())).toContain('alice');
});
it.each([['', '12345678', '12345678'], ['old', 'short', 'short'], ['old', '12345678', 'different']])('rejects invalid password fields %p %p %p', async (old, next, repeat) => {
  mount(); passwords(old, next, repeat); await press('更新密码');
  expect(change).not.toHaveBeenCalled(); expect(JSON.stringify(tree.toJSON())).toContain('两次输入一致');
});
it('changes the exact password, clears sensitive fields and signs out', async () => {
  mount(); passwords(' old password ', ' new password '); await press('更新密码');
  expect(change).toHaveBeenCalledWith(' old password ', ' new password ');
  expect(logout).toHaveBeenCalledTimes(1); expect(onLogout).toHaveBeenCalledTimes(1);
  expect(xAlert).toHaveBeenCalledWith('密码已更新', expect.any(String));
  for (const field of tree.root.findAllByType('TextInput')) expect(field.props.value).toBe('');
});
it('prevents duplicate password requests and disables destructive controls while pending', async () => {
  const request = pending(change); mount(); passwords(); const handler = button('更新密码').props.onPress;
  act(() => { void handler(); void handler(); }); expect(change).toHaveBeenCalledTimes(1);
  expect(button('删除账号').props.disabled).toBe(true);
  for (const field of tree.root.findAllByType('TextInput')) expect(field.props.editable).toBe(false);
  await act(async () => request.resolve());
});
it.each([new Error('incorrect password'), {}, null])('retains password input and enables retry after failure %p', async error => {
  change.mockRejectedValueOnce(error); mount(); passwords(); await press('更新密码');
  expect(JSON.stringify(tree.toJSON())).toContain(error instanceof Error ? error.message : '密码修改失败');
  expect(input('当前密码').props.value).toBe('old password'); expect(button('更新密码').props.disabled).toBe(false);
  expect(logout).not.toHaveBeenCalled(); await press('更新密码'); expect(change).toHaveBeenCalledTimes(2);
});
it('requires a destructive warning before showing the delete password field', async () => {
  mount(); await press('删除账号'); expect(input('输入密码')).toBeUndefined();
  expect(xConfirm).toHaveBeenCalledWith('删除账号', expect.any(String), expect.any(Function), undefined, { confirmText: '继续删除', destructive: true });
  act(() => (xConfirm as jest.Mock).mock.calls[0][2]()); expect(input('输入密码').props.secureTextEntry).toBe(true);
});
it('cancels deletion and clears its password when reopened', async () => {
  mount(); await openDelete(); type('输入密码', 'secret'); await press('取消'); await openDelete();
  expect(input('输入密码').props.value).toBe(''); expect(deletion).not.toHaveBeenCalled();
});
it('rejects blank delete confirmation without a request', async () => {
  mount(); await openDelete(); type('输入密码', '   '); await press('确认删除');
  expect(deletion).not.toHaveBeenCalled(); expect(xAlert).toHaveBeenCalledWith('提示', '请输入密码以确认删除');
});
it('deletes once, logs out and cleans drafts belonging to the captured account', async () => {
  const scope = getSession().scope; const request = pending(deletion); mount(); await openDelete(); type('输入密码', ' password ');
  const handler = button('确认删除').props.onPress; act(() => { void handler(); void handler(); });
  expect(deletion).toHaveBeenCalledTimes(1); expect(deletion).toHaveBeenCalledWith(' password ');
  expect(button('更新密码').props.disabled).toBe(true); expect(button('取消').props.disabled).toBe(true);
  await act(async () => request.resolve()); expect(logout).toHaveBeenCalledTimes(1); expect(onLogout).toHaveBeenCalledTimes(1);
  expect(removeAccountDrafts).toHaveBeenCalledWith(scope); expect(input('输入密码')).toBeUndefined();
});
it.each([new Error('wrong password'), {}, null])('keeps deletion confirmation available after failure %p', async error => {
  deletion.mockRejectedValueOnce(error); mount(); await openDelete(); type('输入密码', 'secret'); await press('确认删除');
  expect(xAlert).toHaveBeenCalledWith('删除失败', error instanceof Error ? error.message : '请检查密码是否正确');
  expect(input('输入密码').props.value).toBe('secret'); expect(button('确认删除').props.disabled).toBe(false);
  expect(logout).not.toHaveBeenCalled(); expect(removeAccountDrafts).not.toHaveBeenCalled();
});
it('reports local cleanup failure without claiming server deletion failed', async () => {
  (removeAccountDrafts as jest.Mock).mockRejectedValueOnce(new Error('disk')); mount(); await openDelete(); type('输入密码', 'secret'); await press('确认删除');
  expect(onLogout).toHaveBeenCalledTimes(1); expect(xAlert).toHaveBeenCalledWith('账号已删除', expect.stringContaining('草稿清理未完成'));
  expect((xAlert as jest.Mock).mock.calls.some(([title]) => title === '删除失败')).toBe(false);
});
it('ignores an old destructive confirmation after switching accounts', async () => {
  mount(); await press('删除账号'); const confirm = (xConfirm as jest.Mock).mock.calls[0][2];
  act(() => setSession('https://server.example', 'bob')); act(() => confirm());
  expect(input('输入密码')).toBeUndefined(); expect(deletion).not.toHaveBeenCalled();
});
it('does not sign out the new account when an old password change completes', async () => {
  const request = pending(change); mount(); passwords(); act(() => { void button('更新密码').props.onPress(); });
  act(() => setSession('https://server.example', 'bob')); await act(async () => request.resolve());
  expect(logout).not.toHaveBeenCalled(); expect(onLogout).not.toHaveBeenCalled(); expect(xAlert).not.toHaveBeenCalled();
  expect(getSession().scope).toContain('bob'); expect(input('当前密码').props.value).toBe('');
});
it('cleans only old-account drafts when server deletion succeeds after an account switch', async () => {
  const scope = getSession().scope; const request = pending(deletion); mount(); await openDelete(); type('输入密码', 'secret');
  act(() => { void button('确认删除').props.onPress(); }); act(() => setSession('https://server.example', 'bob'));
  await act(async () => request.resolve()); expect(removeAccountDrafts).toHaveBeenCalledWith(scope);
  expect(logout).not.toHaveBeenCalled(); expect(onLogout).not.toHaveBeenCalled(); expect(xAlert).not.toHaveBeenCalled();
  expect(getSession().scope).toContain('bob');
});
it('ignores old errors without unlocking a new pending password request', async () => {
  const old = pending(change); mount(); passwords(); act(() => { void button('更新密码').props.onPress(); });
  act(() => setSession('https://server.example', 'bob')); const current = pending(change); passwords('bob password');
  act(() => { void button('更新密码').props.onPress(); }); await act(async () => old.reject(new Error('old failure')));
  expect(JSON.stringify(tree.toJSON())).not.toContain('old failure'); expect(button('删除账号').props.disabled).toBe(true);
  await act(async () => current.resolve()); expect(change).toHaveBeenCalledTimes(2);
});
it('clears sensitive fields and an open confirmation immediately when the session ends', async () => {
  mount(); passwords(); await openDelete(); type('输入密码', 'secret'); act(() => clearSession());
  expect(input('输入密码')).toBeUndefined();
  for (const field of tree.root.findAllByType('TextInput')) expect(field.props.value).toBe('');
  await press('删除账号'); expect(xConfirm).toHaveBeenCalledTimes(1);
  passwords(); await press('更新密码'); expect(change).not.toHaveBeenCalled();
});
it('does not show a late delete error to the new account', async () => {
  const request = pending(deletion); mount(); await openDelete(); type('输入密码', 'secret');
  act(() => { void button('确认删除').props.onPress(); }); act(() => setSession('https://server.example', 'bob'));
  await act(async () => request.reject(new Error('old deletion error')));
  expect(xAlert).not.toHaveBeenCalled(); expect(removeAccountDrafts).not.toHaveBeenCalled();
  expect(input('输入密码')).toBeUndefined(); expect(button('更新密码').props.disabled).toBe(false);
});
it('does not show stale cleanup warnings to the new account', async () => {
  const request = pending(deletion); (removeAccountDrafts as jest.Mock).mockRejectedValueOnce(new Error('disk'));
  mount(); await openDelete(); type('输入密码', 'secret'); act(() => { void button('确认删除').props.onPress(); });
  act(() => setSession('https://server.example', 'bob')); await act(async () => request.resolve());
  expect(xAlert).not.toHaveBeenCalled(); expect(logout).not.toHaveBeenCalled();
});
it.each(['password', 'delete'])('still signs out the original account after successful %s when the page unmounts', async kind => {
  const request = pending(kind === 'password' ? change : deletion); const scope = getSession().scope; mount();
  if (kind === 'password') passwords(); else { await openDelete(); type('输入密码', 'secret'); }
  act(() => { void button(kind === 'password' ? '更新密码' : '确认删除').props.onPress(); });
  act(() => tree.unmount()); tree = undefined; await act(async () => request.resolve());
  expect(logout).toHaveBeenCalledTimes(1); expect(onLogout).not.toHaveBeenCalled(); expect(xAlert).not.toHaveBeenCalled();
  if (kind === 'delete') expect(removeAccountDrafts).toHaveBeenCalledWith(scope);
});
it.each(['password', 'delete'])('ignores %s failure after unmount', async kind => {
  const request = pending(kind === 'password' ? change : deletion); mount();
  if (kind === 'password') passwords(); else { await openDelete(); type('输入密码', 'secret'); }
  act(() => { void button(kind === 'password' ? '更新密码' : '确认删除').props.onPress(); });
  act(() => tree.unmount()); tree = undefined; await act(async () => request.reject(null));
  expect(logout).not.toHaveBeenCalled(); expect(xAlert).not.toHaveBeenCalled(); expect(onLogout).not.toHaveBeenCalled();
});
it('rejects previously captured handlers after unmount', async () => {
  mount(); passwords(); await openDelete(); type('输入密码', 'secret');
  const save = button('更新密码').props.onPress; const remove = button('确认删除').props.onPress;
  const warning = (xConfirm as jest.Mock).mock.calls[0][2]; act(() => tree.unmount()); tree = undefined;
  await act(async () => { await save(); await remove(); warning(); });
  expect(change).not.toHaveBeenCalled(); expect(deletion).not.toHaveBeenCalled();
});
it('does not redirect a new login that occurs while the previous logout completes', async () => {
  let finish!: () => void;
  (logout as jest.Mock).mockImplementationOnce(() => { clearSession(); return new Promise<void>(resolve => { finish = resolve; }); });
  mount(); passwords(); act(() => { void button('更新密码').props.onPress(); });
  await act(async () => { await Promise.resolve(); }); act(() => setSession('https://server.example', 'bob'));
  await act(async () => finish()); expect(onLogout).not.toHaveBeenCalled(); expect(getSession().scope).toContain('bob');
});
it('does not allow a previously captured delete confirmation while a password change is pending', async () => {
  const request = pending(change); mount(); await press('删除账号'); const warning = (xConfirm as jest.Mock).mock.calls[0][2];
  passwords(); act(() => { void button('更新密码').props.onPress(); warning(); });
  expect(input('输入密码')).toBeUndefined(); await act(async () => request.resolve());
});
it('rejects old rendered password and delete handlers after switching accounts', async () => {
  mount(); passwords(); await openDelete(); type('输入密码', 'secret');
  const save = button('更新密码').props.onPress; const remove = button('确认删除').props.onPress;
  act(() => setSession('https://server.example', 'bob'));
  await act(async () => { await save(); await remove(); }); expect(change).not.toHaveBeenCalled(); expect(deletion).not.toHaveBeenCalled();
});
