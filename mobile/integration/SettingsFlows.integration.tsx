import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ProfileEditScreen from '../src/screens/ProfileEditScreen';
import TagManagementScreen from '../src/screens/TagManagementScreen';
import StorageSettingsScreen from '../src/screens/StorageSettingsScreen';
import PrivacySettingsScreen from '../src/screens/PrivacySettingsScreen';
import PasswordRecoveryScreen from '../src/screens/PasswordRecoveryScreen';
import AboutScreen from '../src/screens/AboutScreen';
import AccountSecurityScreen from '../src/screens/AccountSecurityScreen';
import AudioPlayScreen from '../src/screens/AudioPlayScreen';
import CacheManagementScreen from '../src/screens/CacheManagementScreen';
import * as FileSystem from 'expo-file-system/legacy';
import { userApi } from '../src/services/api/userApi';
import { tagApi } from '../src/services/api/tagApi';
import { apiClient } from '../src/services/api/apiClient';
import { publicAuthRequest } from '../src/services/passwordRecovery';
import { checkForUpdates } from '../src/utils/versionChecker';
import { xAlert, xConfirm } from '../src/utils/crossAlert';
import { clearSession, setSession } from '../src/services/session';

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, dispatch: jest.fn() }), usePreventRemove: jest.fn(),
  useRoute: () => ({ params: undefined }),
  useFocusEffect: (callback: () => void) => { require('react').useEffect(callback, [callback]); },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-audio', () => ({ useAudioPlayer: jest.fn(), useAudioPlayerStatus: jest.fn(), setAudioModeAsync: jest.fn() }));
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/', readDirectoryAsync: jest.fn(), getInfoAsync: jest.fn(), deleteAsync: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
jest.mock('@react-native-community/slider', () => 'Slider');
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../src/services/auth', () => ({
  getCurrentUser: () => ({ id: 1, username: 'review', display_name: '原名称', bio: '原简介', email: 'old@example.com' }),
  updateCachedUser: jest.fn(),
  logout: jest.fn(),
}));
jest.mock('../src/services/api/userApi', () => ({ userApi: { updateProfile: jest.fn(), deleteAccount: jest.fn(), changePassword: jest.fn() } }));
jest.mock('../src/services/pendingMedia', () => ({ removeAccountDrafts: jest.fn() }));
jest.mock('../src/services/api/tagApi', () => ({ tagApi: { getTags: jest.fn(), updateTag: jest.fn(), reorder: jest.fn() } }));
jest.mock('../src/services/api/apiClient', () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }));
jest.mock('../src/services/passwordRecovery', () => ({ publicAuthRequest: jest.fn() }));
jest.mock('../src/utils/versionChecker', () => ({ checkForUpdates: jest.fn() }));
jest.mock('../src/utils/crossAlert', () => ({ xAlert: jest.fn(), xConfirm: jest.fn(), xActionSheet: jest.fn() }));
jest.mock('../src/store/hooks', () => ({ useAppDispatch: () => jest.fn() }));

const tags = [
  { id: 'one', name: '生活', color: '#123456', bbtalkCount: 1 },
  { id: 'two', name: '工作', color: '#654321', bbtalkCount: 0 },
];
beforeEach(async () => { jest.clearAllMocks(); clearSession(); setSession('https://preview.test', 1); await AsyncStorage.clear(); });

test('profile clearing sends empty fields and a failed save retains the form', async () => {
  (userApi.updateProfile as jest.Mock).mockRejectedValueOnce(new Error('网络中断')).mockResolvedValueOnce({});
  const screen = render(<ProfileEditScreen />);
  fireEvent.changeText(screen.getByLabelText('邮箱'), '');
  fireEvent.changeText(screen.getByLabelText('个人简介'), '');
  fireEvent.press(screen.getByText('保存'));
  await screen.findByText('网络中断');
  expect(mockGoBack).not.toHaveBeenCalled();
  expect(screen.getByLabelText('邮箱').props.value).toBe('');
  fireEvent.press(screen.getByText('保存'));
  await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1));
  expect(userApi.updateProfile).toHaveBeenLastCalledWith({ display_name: '原名称', bio: '', email: '' });
});

test('tag loading failure is distinct from empty data and can be retried', async () => {
  (tagApi.getTags as jest.Mock).mockRejectedValueOnce(new Error('连接失败')).mockResolvedValueOnce(tags);
  const screen = render(<TagManagementScreen />);
  await screen.findByText('连接失败');
  expect(screen.queryByText('暂无标签')).toBeNull();
  fireEvent.press(screen.getByText('重新加载'));
  await screen.findByLabelText('下移标签 生活');
});

test('failed tag ordering rolls back rather than displaying an unsaved order', async () => {
  (tagApi.getTags as jest.Mock).mockResolvedValue(tags);
  (tagApi.reorder as jest.Mock).mockRejectedValue(new Error('未保存'));
  const screen = render(<TagManagementScreen />);
  fireEvent.press(await screen.findByLabelText('下移标签 生活'));
  await waitFor(() => expect(xAlert).toHaveBeenCalledWith('排序失败', '未保存'));
  expect(screen.getByLabelText('上移标签 生活')).toBeDisabled();
  expect(screen.getByLabelText('下移标签 工作')).toBeDisabled();
});

test('storage error never claims local storage is active; connection checks prevent duplicates', async () => {
  (apiClient.get as jest.Mock).mockRejectedValueOnce(new Error('无法读取')).mockResolvedValue([{ id: 1, name: '照片存储', is_active: false }]);
  let finish!: (value: unknown) => void;
  (apiClient.post as jest.Mock).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const screen = render(<StorageSettingsScreen />);
  await screen.findByText('无法读取');
  expect(screen.getByText('当前: 暂时无法确认')).toBeTruthy();
  fireEvent.press(screen.getByText('重新加载'));
  const check = await screen.findByLabelText('测试配置 照片存储');
  fireEvent.press(check); fireEvent.press(check);
  expect(apiClient.post).toHaveBeenCalledTimes(1);
  await act(async () => finish({ success: true, message: '连接正常' }));
  expect(xAlert).toHaveBeenCalledWith('连接成功', '连接正常');
});

test('failed privacy writes preserve saved settings and report failure', async () => {
  const screen = render(<PrivacySettingsScreen />);
  await screen.findByText('修改后自动保存');
  (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
  fireEvent(screen.getByLabelText('启用防窥模式'), 'valueChange', false);
  await screen.findByText('保存失败，修改未生效，请重试');
  expect(screen.getByLabelText('启用防窥模式').props.value).toBe(true);
  fireEvent(screen.getByLabelText('启用防窥模式'), 'valueChange', false);
  await waitFor(() => expect(screen.getByLabelText('启用防窥模式').props.value).toBe(false));
  expect(screen.getByLabelText('锁定时允许新建')).toBeDisabled();
});

test('existing recovery code flow allows entering a username and submitting it', async () => {
  (publicAuthRequest as jest.Mock).mockResolvedValue({ password_recovery_enabled: true, message: '完成' });
  const screen = render(<PasswordRecoveryScreen />);
  fireEvent.press(await screen.findByText('已有恢复码'));
  expect(screen.getByLabelText('用户名').props.editable).toBe(true);
  fireEvent.changeText(screen.getByLabelText('用户名'), 'review');
  fireEvent.changeText(screen.getByLabelText('恢复码'), '123456');
  fireEvent.changeText(screen.getByLabelText('新密码'), 'password-2026');
  fireEvent.press(screen.getByText('重置密码'));
  await screen.findByText('返回登录');
  expect(publicAuthRequest).toHaveBeenLastCalledWith('password/confirm', { username: 'review', code: '123456', new_password: 'password-2026' });
});

test('manual update failure is never reported as latest version', async () => {
  (checkForUpdates as jest.Mock).mockResolvedValue('error');
  const screen = render(<AboutScreen />);
  fireEvent.press(screen.getByText('检查更新'));
  await waitFor(() => expect(xAlert).toHaveBeenCalledWith('检查失败', expect.any(String)));
  expect(checkForUpdates).toHaveBeenCalledWith(true);
  expect(xAlert).not.toHaveBeenCalledWith('检查完成', '当前已是最新版本');
});

test('account deletion failure retains the confirmation and password for retry', async () => {
  (userApi.deleteAccount as jest.Mock).mockRejectedValue(new Error('服务不可用'));
  const onLogout = jest.fn();
  const screen = render(<AccountSecurityScreen onLogout={onLogout} />);
  fireEvent.press(screen.getByLabelText('删除账号'));
  await act(async () => (xConfirm as jest.Mock).mock.calls[0][2]());
  fireEvent.changeText(screen.getByPlaceholderText('输入密码'), 'password-2026');
  fireEvent.press(screen.getByText('确认删除'));
  await waitFor(() => expect(xAlert).toHaveBeenCalledWith('删除失败', '服务不可用'));
  expect(screen.getByPlaceholderText('输入密码').props.value).toBe('password-2026');
  expect(screen.getByText('确认删除')).toBeTruthy();
  expect(onLogout).not.toHaveBeenCalled();
});

test('an audio URL without parameters displays a usable empty state', async () => {
  const screen = render(<AudioPlayScreen />);
  await screen.findByText('请从记录中选择一段音频播放');
});

test('media cache cleanup preserves unpublished recordings and reports delete failures', async () => {
  (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue(['audio_1.m4a', 'voice_pending.m4a', 'unrelated.db']);
  (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true, isDirectory: false, size: 4096 });
  (FileSystem.deleteAsync as jest.Mock).mockRejectedValue(new Error('文件占用'));
  const screen = render(<CacheManagementScreen />);
  fireEvent.press(await screen.findByText('清理全部缓存'));
  await act(async () => (xConfirm as jest.Mock).mock.calls[0][2]());
  expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(1);
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith('file:///cache/audio_1.m4a', { idempotent: true });
  expect(xAlert).toHaveBeenCalledWith('清理失败', '文件占用');
  expect(xAlert).not.toHaveBeenCalledWith('完成', '缓存已清理');
});
