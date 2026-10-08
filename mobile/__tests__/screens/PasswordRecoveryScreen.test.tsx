jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', ScrollView: 'ScrollView',
  TextInput: 'TextInput', ActivityIndicator: 'ActivityIndicator', KeyboardAvoidingView: 'KeyboardAvoidingView',
  StyleSheet: { create: (value: unknown) => value }, Platform: { OS: 'ios' },
  Linking: { openURL: jest.fn() },
}));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ goBack: mockGoBack }) }));
jest.mock('../../src/theme/ThemeContext', () => ({ useTheme: () => ({ theme: require('../../src/theme/themes').THEMES[0] }) }));
jest.mock('../../src/config', () => ({ getApiBaseUrl: () => 'https://server.example' }));
jest.mock('../../src/services/passwordRecovery', () => ({ publicAuthRequest: jest.fn() }));
import React from 'react';
import PasswordRecoveryScreen from '../../src/screens/PasswordRecoveryScreen';
import { publicAuthRequest } from '../../src/services/passwordRecovery';
import { Linking } from 'react-native';
const { create, act } = require('react-test-renderer');
const mockGoBack = jest.fn();
const request = publicAuthRequest as jest.Mock;
let tree: any;
const input = (label: string) => tree.root.findAllByType('TextInput').find((node: any) => node.props.accessibilityLabel === label);
function type(label: string, value: string) { act(() => input(label).props.onChangeText(value)); }
const button = (label: string) => tree.root.findAllByType('TouchableOpacity').find((node: any) => node.findAllByType('Text').some((text: any) => text.props.children === label));
async function press(label: string) { await act(async () => button(label).props.onPress()); }
async function mount() { await act(async () => { tree = create(<PasswordRecoveryScreen />); }); }
const rendered = () => JSON.stringify(tree.toJSON());
function pending() {
  let resolve!: (value: any) => void; let reject!: (error: unknown) => void;
  request.mockReturnValueOnce(new Promise<any>((yes, no) => { resolve = yes; reject = no; }));
  return { resolve, reject };
}
beforeEach(() => {
  jest.clearAllMocks();
  request.mockReset().mockImplementation((path: string) =>
    path === 'policy' ? Promise.resolve({ password_recovery_enabled: true }) : Promise.resolve({ message: '操作成功' }));
  (Linking.openURL as jest.Mock).mockReturnValue(Promise.resolve());
});
afterEach(() => { act(() => tree?.unmount()); tree = undefined; });

it('waits for the policy check before showing the form', async () => {
  const policy = pending();
  await act(async () => { tree = create(<PasswordRecoveryScreen />); });
  expect(input('用户名')).toBeUndefined();
  expect(tree.root.findAllByType('ActivityIndicator').length).toBeGreaterThan(0);
  await act(async () => policy.resolve({ password_recovery_enabled: true }));
  expect(input('用户名')).toBeDefined();
  expect(request).toHaveBeenCalledWith('policy');
});
it('explains recovery is unavailable when the policy disables it', async () => {
  request.mockImplementationOnce(() => Promise.resolve({ password_recovery_enabled: false }));
  await mount();
  expect(rendered()).toContain('当前服务暂未启用邮件找回');
  expect(input('用户名')).toBeUndefined();
});
it('offers a retry after the policy check fails', async () => {
  request.mockImplementationOnce(() => Promise.reject(new Error('offline')));
  await mount();
  expect(rendered()).toContain('无法连接服务，点击重试');
  await press('无法连接服务，点击重试');
  expect(request).toHaveBeenCalledTimes(2);
  expect(input('用户名')).toBeDefined();
});
it.each([['', ''], ['alice', ''], ['', 'alice@example.com']])('rejects an incomplete request form %p %p without calling the API', async (username, email) => {
  await mount(); type('用户名', username); type('账号邮箱', email); await press('获取恢复邮件');
  expect(request).toHaveBeenCalledTimes(1);
  expect(rendered()).toContain('请填写完整信息，新密码至少 8 位。');
});
it('sends a trimmed request, shows the server message and advances to the confirm stage', async () => {
  await mount(); type('用户名', ' alice '); type('账号邮箱', ' alice@example.com '); await press('获取恢复邮件');
  expect(request).toHaveBeenCalledWith('password/request', { username: 'alice', email: 'alice@example.com' });
  expect(rendered()).toContain('操作成功');
  expect(input('恢复码')).toBeDefined(); expect(input('新密码')).toBeDefined();
  expect(input('账号邮箱')).toBeUndefined();
  expect(input('用户名').props.value).toBe(' alice ');
});
it.each([new Error('邮箱与账号不匹配'), {}])('keeps the request form editable for retry after failure %p', async error => {
  request.mockImplementation((path: string) =>
    path === 'policy' ? Promise.resolve({ password_recovery_enabled: true }) : Promise.reject(error));
  await mount(); type('用户名', 'alice'); type('账号邮箱', 'alice@example.com'); await press('获取恢复邮件');
  expect(rendered()).toContain(error instanceof Error ? error.message : '请求失败，请重试');
  expect(input('用户名').props.value).toBe('alice'); expect(input('账号邮箱').props.value).toBe('alice@example.com');
  expect(input('用户名').props.editable).toBe(true); expect(button('获取恢复邮件').props.disabled).toBe(false);
  await press('获取恢复邮件'); expect(request).toHaveBeenCalledTimes(3);
});
it('submits the recovery request only once per press burst', async () => {
  await mount(); const pendingRequest = pending(); type('用户名', 'alice'); type('账号邮箱', 'alice@example.com');
  const handler = button('获取恢复邮件').props.onPress;
  act(() => { void handler(); void handler(); });
  expect(request).toHaveBeenCalledTimes(2);
  expect(request).toHaveBeenLastCalledWith('password/request', { username: 'alice', email: 'alice@example.com' });
  expect(input('用户名').props.editable).toBe(false);
  expect(button('已有恢复码').props.disabled).toBe(true);
  await act(async () => pendingRequest.resolve({ message: '邮件已发送' }));
  expect(input('用户名').props.editable).toBe(true);
  expect(button('重新申请或修改邮箱').props.disabled).toBe(false);
});
it.each([['', '', ''], ['alice', '123456', '1234567'], ['alice', '', '12345678']])('rejects an incomplete confirm form %p %p %p without calling the API', async (username, code, password) => {
  await mount(); await press('已有恢复码');
  type('用户名', username); type('恢复码', code); type('新密码', password); await press('重置密码');
  expect(request).toHaveBeenCalledTimes(1);
  expect(rendered()).toContain('请填写完整信息，新密码至少 8 位。');
});
it('resets the password with a trimmed code and returns to login when done', async () => {
  await mount(); await press('已有恢复码');
  type('用户名', 'alice'); type('恢复码', ' 123456 '); type('新密码', 'newpassword'); await press('重置密码');
  expect(request).toHaveBeenLastCalledWith('password/confirm', { username: 'alice', code: '123456', new_password: 'newpassword' });
  expect(input('恢复码')).toBeUndefined(); expect(input('新密码')).toBeUndefined();
  await press('返回登录'); expect(mockGoBack).toHaveBeenCalledTimes(1);
});
it('keeps the confirm form available after a rejected reset', async () => {
  request.mockImplementation((path: string) =>
    path === 'policy' ? Promise.resolve({ password_recovery_enabled: true }) : Promise.reject(new Error('恢复码无效')));
  await mount(); await press('已有恢复码');
  type('用户名', 'alice'); type('恢复码', '123456'); type('新密码', 'newpassword'); await press('重置密码');
  expect(rendered()).toContain('恢复码无效');
  expect(input('恢复码').props.value).toBe('123456'); expect(input('新密码').props.value).toBe('newpassword');
  expect(button('重置密码').props.disabled).toBe(false);
});
it('clears the message when switching stages in both directions', async () => {
  request.mockImplementation((path: string) =>
    path === 'policy' ? Promise.resolve({ password_recovery_enabled: true }) : Promise.reject(new Error('恢复码无效')));
  await mount(); await press('已有恢复码');
  type('用户名', 'alice'); type('恢复码', '123456'); type('新密码', 'newpassword'); await press('重置密码');
  expect(rendered()).toContain('恢复码无效');
  await press('重新申请或修改邮箱');
  expect(rendered()).not.toContain('恢复码无效');
  expect(input('账号邮箱')).toBeDefined();
  await press('已有恢复码'); expect(input('恢复码')).toBeDefined();
});
it('opens the support page and reports when it cannot be opened', async () => {
  await mount();
  await act(async () => button('联系服务提供方').props.onPress());
  expect(Linking.openURL).toHaveBeenCalledWith('https://server.example/support/');
  (Linking.openURL as jest.Mock).mockReturnValueOnce(Promise.reject(new Error('no browser')));
  await act(async () => button('联系服务提供方').props.onPress());
  expect(rendered()).toContain('无法打开帮助页面，请稍后重试');
});
it.each([true, false])('ignores the pending result after leaving the page (success=%p)', async success => {
  await mount(); const pendingRequest = pending(); type('用户名', 'alice'); type('账号邮箱', 'alice@example.com');
  act(() => { void button('获取恢复邮件').props.onPress(); });
  act(() => tree.unmount()); tree = undefined;
  await act(async () => { success ? pendingRequest.resolve({ message: 'done' }) : pendingRequest.reject(new Error('late failure')); });
  expect(mockGoBack).not.toHaveBeenCalled();
});
