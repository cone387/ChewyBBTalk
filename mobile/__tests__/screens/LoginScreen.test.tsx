jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', ScrollView: 'ScrollView',
  TextInput: 'TextInput', ActivityIndicator: 'ActivityIndicator', KeyboardAvoidingView: 'KeyboardAvoidingView',
  StyleSheet: { create: (value: unknown) => value }, Platform: { OS: 'ios' },
  Modal: 'Modal', FlatList: 'FlatList', Linking: { openURL: jest.fn() },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));
jest.mock('../../src/theme/ThemeContext', () => ({ useTheme: () => ({ theme: require('../../src/theme/themes').THEMES[0] }) }));
jest.mock('../../src/services/passwordRecovery', () => ({ publicAuthRequest: jest.fn() }));
jest.mock('../../src/services/auth', () => ({ login: jest.fn(), register: jest.fn() }));
jest.mock('../../src/utils/crossAlert', () => ({ xAlert: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
const DEFAULT = 'https://default.example';
const mockConfig = { base: DEFAULT, setBase: jest.fn(async (url: string) => { mockConfig.base = url; }) };
jest.mock('../../src/config', () => ({
  getApiBaseUrl: () => mockConfig.base,
  setApiBaseUrl: (url: string) => mockConfig.setBase(url),
  DEFAULT_URL: DEFAULT,
}));
import React from 'react';
import LoginScreen from '../../src/screens/LoginScreen';
import { publicAuthRequest } from '../../src/services/passwordRecovery';
import { login, register } from '../../src/services/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';
import { xAlert } from '../../src/utils/crossAlert';
const { create, act } = require('react-test-renderer');
const mockNavigate = jest.fn();
const policy = publicAuthRequest as jest.Mock;
const loginMock = login as jest.Mock;
const registerMock = register as jest.Mock;
let tree: any;
let onLoginSuccess: jest.Mock;
const input = (label: string) => tree.root.findAllByType('TextInput').find((node: any) => node.props.accessibilityLabel === label || node.props.placeholder === label);
function type(label: string, value: string) { act(() => input(label).props.onChangeText(value)); }
// Prefer the innermost match: the modal overlay wraps every sheet control and
// would otherwise swallow presses meant for a specific row or button.
function tappable(label: string) {
  const matches = tree.root.findAllByType('TouchableOpacity').filter((node: any) =>
    node.props.accessibilityLabel === label || node.findAllByType('Text').some((text: any) => text.props.children === label));
  return matches.find(node => !matches.some(other => other !== node && node.findAllByType('TouchableOpacity').includes(other)));
}
const button = tappable;
async function press(label: string) { await act(async () => tappable(label).props.onPress()); }
async function mount() { await act(async () => { tree = create(<LoginScreen onLoginSuccess={onLoginSuccess} />); }); }
const picker = () => tree.root.findAllByType('Modal')[0];
const serverRowsWithUrl = (url: string) => {
  const matches = tree.root.findAllByType('TouchableOpacity')
    .filter((node: any) => node.findAllByType('Text').some((text: any) => text.props.children === url));
  return matches.filter(node => !matches.some(other => other !== node && node.findAllByType('TouchableOpacity').includes(other)));
};
function savedServers(list: unknown[]) { (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(list)); }
beforeEach(() => {
  jest.clearAllMocks();
  onLoginSuccess = jest.fn();
  policy.mockReset().mockResolvedValue({ registration_enabled: true });
  loginMock.mockReset().mockResolvedValue({ success: true });
  registerMock.mockReset().mockResolvedValue({ success: true });
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  mockConfig.base = DEFAULT;
  mockConfig.setBase.mockReset().mockImplementation(async (url: string) => { mockConfig.base = url; });
});
afterEach(() => { act(() => tree?.unmount()); tree = undefined; });

it('renders the login form and offers account creation when the policy allows it', async () => {
  await mount();
  expect(input('用户名')).toBeDefined(); expect(input('请输入密码')).toBeDefined();
  expect(input('请输入邮箱')).toBeUndefined();
  expect(button('创建新账户').props.disabled).toBe(false);
  await press('创建新账户');
  expect(input('请输入邮箱')).toBeDefined(); expect(input('请输入显示名称')).toBeDefined();
  expect(button('登录已有账户')).toBeDefined();
});
it('locks registration switching when the server policy disables it', async () => {
  policy.mockResolvedValue({ registration_enabled: false });
  await mount();
  expect(button('当前服务暂未开放注册').props.disabled).toBe(true);
  expect(input('请输入邮箱')).toBeUndefined();
});
it('rejects a blank submission without contacting the server', async () => {
  await mount(); await press('登录  →');
  expect(xAlert).toHaveBeenCalledWith('提示', '请输入用户名和密码');
  expect(loginMock).not.toHaveBeenCalled();
});
it('signs in and reports success to the host app', async () => {
  await mount(); type('用户名', 'alice'); type('请输入密码', 'secret'); await press('登录  →');
  expect(loginMock).toHaveBeenCalledWith('alice', 'secret');
  expect(onLoginSuccess).toHaveBeenCalledTimes(1); expect(xAlert).not.toHaveBeenCalled();
});
it('shows the server error when credentials are rejected', async () => {
  loginMock.mockResolvedValue({ success: false, error: '密码错误' });
  await mount(); type('用户名', 'alice'); type('请输入密码', 'wrong'); await press('登录  →');
  expect(xAlert).toHaveBeenCalledWith('登录失败', '密码错误');
  expect(onLoginSuccess).not.toHaveBeenCalled();
});
it('reports a network failure and allows retrying', async () => {
  loginMock.mockRejectedValueOnce(new Error('offline'));
  await mount(); type('用户名', 'alice'); type('请输入密码', 'secret'); await press('登录  →');
  expect(xAlert).toHaveBeenCalledWith('错误', '网络错误，请稍后重试');
  expect(button('登录  →').props.disabled).toBe(false);
  await press('登录  →'); expect(loginMock).toHaveBeenCalledTimes(2);
});
it('submits the login request only once per press burst', async () => {
  let resolve!: (value: any) => void;
  loginMock.mockReturnValueOnce(new Promise<any>(yes => { resolve = yes; }));
  await mount(); type('用户名', 'alice'); type('请输入密码', 'secret');
  const submit = button('登录  →');
  const handler = submit.props.onPress;
  act(() => { void handler(); void handler(); });
  expect(loginMock).toHaveBeenCalledTimes(1);
  expect(submit.props.disabled).toBe(true);
  await act(async () => resolve({ success: true }));
  expect(onLoginSuccess).toHaveBeenCalledTimes(1);
});
it('registers with optional fields omitted when left blank', async () => {
  await mount(); await press('创建新账户');
  type('用户名', 'alice'); type('请输入密码', 'secret'); await press('注册  →');
  expect(registerMock).toHaveBeenCalledWith({ username: 'alice', password: 'secret', email: undefined, display_name: undefined });
  expect(onLoginSuccess).toHaveBeenCalledTimes(1);
});
it('registers with the entered profile fields and reports failure', async () => {
  registerMock.mockResolvedValue({ success: false, error: '用户名已存在' });
  await mount(); await press('创建新账户');
  type('用户名', 'alice'); type('请输入密码', 'secret'); type('请输入邮箱', 'a@b.c'); type('请输入显示名称', 'Alice');
  await press('注册  →');
  expect(registerMock).toHaveBeenCalledWith({ username: 'alice', password: 'secret', email: 'a@b.c', display_name: 'Alice' });
  expect(xAlert).toHaveBeenCalledWith('注册失败', '用户名已存在'); expect(onLoginSuccess).not.toHaveBeenCalled();
});
it('blocks registration after switching to a server that disallows it', async () => {
  savedServers([{ label: '自建服务', url: 'https://custom.example' }]);
  await mount(); await press('创建新账户');
  await press('使用自建服务'); await press('默认服务');
  policy.mockResolvedValueOnce({ registration_enabled: false });
  await press('自建服务');
  await act(async () => { await Promise.resolve(); });
  type('用户名', 'alice'); type('请输入密码', 'secret'); await press('注册  →');
  expect(registerMock).not.toHaveBeenCalled();
  expect(xAlert).toHaveBeenCalledWith('暂未开放注册', expect.any(String));
});
it('navigates to password recovery from the login form', async () => {
  await mount(); await press('忘记密码？');
  expect(mockNavigate).toHaveBeenCalledWith('PasswordRecovery');
});
it('reveals and hides the password', async () => {
  await mount(); type('请输入密码', 'secret');
  expect(input('请输入密码').props.secureTextEntry).toBe(true);
  await press('显示密码');
  expect(input('请输入密码').props.secureTextEntry).toBe(false);
  expect(button('隐藏密码')).toBeDefined();
  await press('隐藏密码');
  expect(input('请输入密码').props.secureTextEntry).toBe(true);
});
it('opens the privacy policy when registering', async () => {
  await mount(); await press('创建新账户');
  await act(async () => tree.root.findAllByType('Text').find((t: any) => t.props.children === '隐私政策').props.onPress());
  expect(Linking.openURL).toHaveBeenCalledWith(`${DEFAULT}/privacy-policy/`);
});
it('toggles the advanced panel and reflects the active server after switching', async () => {
  savedServers([{ label: '自建服务', url: 'https://custom.example' }]);
  await mount();
  expect(button('使用自建服务')).toBeDefined();
  await press('使用自建服务');
  expect(button('收起服务设置')).toBeDefined();
  await press('默认服务');
  expect(picker().props.visible).toBe(true);
  await press('自建服务');
  expect(picker().props.visible).toBe(false);
  await press('收起服务设置');
  expect(button('使用自建服务')).toBeUndefined();
  expect(button('当前使用：自建服务 · 切换服务')).toBeDefined();
});
it('loads saved servers without duplicating an explicit default entry', async () => {
  savedServers([{ label: '自建服务', url: DEFAULT }, { label: '备用', url: 'https://backup.example' }]);
  await mount(); await press('使用自建服务'); await press('自建服务');
  expect(serverRowsWithUrl(DEFAULT)).toHaveLength(1);
  expect(serverRowsWithUrl('https://backup.example')).toHaveLength(1);
});
it('adds a server with a trimmed url, a custom label and selects it', async () => {
  await mount(); await press('使用自建服务'); await press('默认服务'); await press('添加服务地址');
  type('https://your-server.com', 'https://custom.example///'); type('名称（可选）', '我的服务');
  await press('添加');
  expect(AsyncStorage.setItem).toHaveBeenCalledWith('bbtalk_servers', JSON.stringify([
    { label: '默认服务', url: DEFAULT }, { label: '我的服务', url: 'https://custom.example' }]));
  expect(mockConfig.setBase).toHaveBeenCalledWith('https://custom.example');
  expect(picker().props.visible).toBe(false);
  expect(button('我的服务')).toBeDefined();
});
it('defaults the label to the url and rejects empty or duplicate server entries', async () => {
  savedServers([{ label: '自建服务', url: 'https://custom.example' }]);
  await mount(); await press('使用自建服务'); await press('默认服务'); await press('添加服务地址');
  await press('添加');
  expect(xAlert).toHaveBeenCalledWith('提示', '请输入服务地址');
  type('https://your-server.com', 'https://custom.example'); await press('添加');
  expect(xAlert).toHaveBeenCalledWith('提示', '该地址已存在');
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  type('https://your-server.com', 'https://other.example/'); await press('添加');
  expect(JSON.parse((AsyncStorage.setItem as jest.Mock).mock.calls[0][1])).toEqual([
    { label: '默认服务', url: DEFAULT }, { label: '自建服务', url: 'https://custom.example' }, { label: 'https://other.example', url: 'https://other.example' }]);
});
it('selecting another server closes the picker and re-checks the policy', async () => {
  savedServers([{ label: '自建服务', url: 'https://custom.example' }]);
  await mount(); await press('使用自建服务'); await press('默认服务');
  await press('自建服务');
  expect(mockConfig.setBase).toHaveBeenCalledWith('https://custom.example');
  expect(picker().props.visible).toBe(false);
  expect(policy).toHaveBeenCalledTimes(2);
});
it('removes a custom server and falls back to the default when it was selected', async () => {
  savedServers([{ label: '自建服务', url: 'https://custom.example' }]);
  await mount(); await press('使用自建服务'); await press('默认服务'); await press('自建服务');
  const row = serverRowsWithUrl('https://custom.example')[0];
  const remove = row.findAllByType('TouchableOpacity').find((node: any) => node !== row);
  await act(async () => remove.props.onPress());
  expect(AsyncStorage.setItem).toHaveBeenCalledWith('bbtalk_servers', JSON.stringify([{ label: '默认服务', url: DEFAULT }]));
  expect(mockConfig.setBase).toHaveBeenCalledWith(DEFAULT);
});
it('never offers removal for the default server entry', async () => {
  savedServers([{ label: '自建服务', url: 'https://custom.example' }]);
  await mount(); await press('使用自建服务'); await press('默认服务'); await press('自建服务');
  const defaultRow = serverRowsWithUrl(DEFAULT)[0];
  expect(defaultRow.findAllByType('TouchableOpacity').find((node: any) => node !== defaultRow)).toBeUndefined();
});
it('cancelling the add-server form restores the list and the backdrop closes the picker', async () => {
  await mount(); await press('使用自建服务'); await press('默认服务'); await press('添加服务地址');
  await press('取消');
  expect(input('https://your-server.com')).toBeUndefined();
  expect(button('添加服务地址')).toBeDefined();
  await act(async () => picker().props.children.props.onPress());
  expect(picker().props.visible).toBe(false);
});
