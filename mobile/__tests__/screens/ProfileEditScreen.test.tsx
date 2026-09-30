jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', ScrollView: 'ScrollView',
  TextInput: 'TextInput', ActivityIndicator: 'ActivityIndicator', KeyboardAvoidingView: 'KeyboardAvoidingView',
  StyleSheet: { create: (value: unknown) => value }, Platform: { OS: 'ios' },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 20 }) }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ goBack: mockGoBack, dispatch: mockDispatch }), usePreventRemove: jest.fn() }));
jest.mock('../../src/theme/ThemeContext', () => ({ useTheme: () => ({ theme: require('../../src/theme/themes').THEMES[0] }) }));
jest.mock('../../src/services/auth', () => ({ getCurrentUser: jest.fn(), updateCachedUser: jest.fn() }));
jest.mock('../../src/services/api/userApi', () => ({ userApi: { updateProfile: jest.fn() } }));
jest.mock('../../src/services/api/mediaApi', () => ({ attachmentApi: { upload: jest.fn(), uploadFile: jest.fn() } }));
jest.mock('../../src/utils/imageSource', () => ({ buildImageSource: (url: string) => ({ uri: url }) }));
jest.mock('../../src/utils/crossAlert', () => ({ xAlert: jest.fn(), xConfirm: jest.fn() }));
import React from 'react';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { usePreventRemove } from '@react-navigation/native';
import ProfileEditScreen from '../../src/screens/ProfileEditScreen';
import { getCurrentUser, updateCachedUser } from '../../src/services/auth';
import { userApi } from '../../src/services/api/userApi';
import { attachmentApi } from '../../src/services/api/mediaApi';
import { clearSession, setSession } from '../../src/services/session';
import { xAlert, xConfirm } from '../../src/utils/crossAlert';
const { create, act } = require('react-test-renderer');
const mockGoBack = jest.fn(); const mockDispatch = jest.fn();
let tree: any;
const user = { id: 1, username: 'alice', display_name: 'Alice', bio: 'hello', email: 'alice@example.com', avatar: 'https://a/avatar.jpg' };
const saveApi = userApi.updateProfile as jest.Mock;
const picker = ImagePicker.launchImageLibraryAsync as jest.Mock;
const upload = attachmentApi.upload as jest.Mock;
const uploadFile = attachmentApi.uploadFile as jest.Mock;
const cache = updateCachedUser as jest.Mock;
function mount() { act(() => { tree = create(<ProfileEditScreen />); }); }
const field = (label: string) => tree.root.findByProps({ accessibilityLabel: label });
function type(label: string, value: string) { act(() => field(label).props.onChangeText(value)); }
const avatar = () => field('更换头像');
const save = () => tree.root.findAllByType('TouchableOpacity')[1];
async function pressSave() { await act(async () => save().props.onPress()); }
async function pick() { await act(async () => avatar().props.onPress()); }
function pending(api: jest.Mock) {
  let resolve!: (value?: any) => void; let reject!: (error: unknown) => void;
  api.mockReturnValueOnce(new Promise((yes, no) => { resolve = yes; reject = no; })); return { resolve, reject };
}
function switchAccount() {
  (getCurrentUser as jest.Mock).mockReturnValue({ ...user, id: 2, username: 'bob', display_name: 'Bob', avatar: 'https://b/avatar.jpg' });
  act(() => setSession('https://server.example', 2));
}
beforeEach(() => {
  jest.clearAllMocks(); clearSession(); setSession('https://server.example', 1); (Platform as any).OS = 'ios';
  (getCurrentUser as jest.Mock).mockReturnValue(user); saveApi.mockReset().mockResolvedValue({ ...user, display_name: 'Changed' });
  picker.mockReset().mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///avatar.png', fileName: 'avatar.png', mimeType: 'image/png' }] });
  upload.mockReset().mockResolvedValue({ url: 'https://a/new-avatar.png' }); uploadFile.mockReset().mockResolvedValue({ url: 'https://a/new-avatar.png' });
  cache.mockReset().mockResolvedValue(undefined);
});
afterEach(() => { act(() => tree?.unmount()); tree = undefined; jest.restoreAllMocks(); });
it('loads the current profile and disables saving unchanged fields', () => {
  mount(); expect(field('显示名称').props.value).toBe('Alice'); expect(field('邮箱').props.value).toBe(user.email);
  expect(field('个人简介').props.value).toBe('hello'); expect(save().props.disabled).toBe(true);
  expect(tree.root.findByType('Image').props.source).toEqual({ uri: user.avatar });
});
it('renders nothing when signed out', () => { (getCurrentUser as jest.Mock).mockReturnValue(null); mount(); expect(tree.toJSON()).toBeNull(); });
it('uses empty optional fields and a username initial when the profile has no avatar', () => {
  (getCurrentUser as jest.Mock).mockReturnValue({ id: 1, username: 'alice' }); mount();
  expect(field('显示名称').props.value).toBe(''); expect(field('个人简介').props.value).toBe(''); expect(field('邮箱').props.value).toBe('');
  expect(tree.root.findAllByType('Text').some((node: any) => node.props.children === 'A')).toBe(true);
});
it('rejects a whitespace display name without calling the server', async () => {
  mount(); type('显示名称', '   '); await pressSave(); expect(saveApi).not.toHaveBeenCalled(); expect(xAlert).toHaveBeenCalledWith('提示', '显示名称不能为空');
});
it('trims fields and explicitly sends empty email and bio when cleared', async () => {
  mount(); type('显示名称', ' Changed '); type('邮箱', '  '); type('个人简介', ''); await pressSave();
  expect(saveApi).toHaveBeenCalledWith({ display_name: 'Changed', email: '', bio: '', avatar: user.avatar });
  expect(cache).toHaveBeenCalledWith({ ...user, display_name: 'Changed' }); expect(mockGoBack).toHaveBeenCalledTimes(1);
});
it('omits the avatar field if no avatar has been chosen', async () => {
  (getCurrentUser as jest.Mock).mockReturnValue({ ...user, avatar: null }); mount(); type('显示名称', 'Changed'); await pressSave();
  expect(saveApi.mock.calls[0][0]).not.toHaveProperty('avatar');
});
it('blocks duplicate saves and avatar picking while a save is pending', async () => {
  const request = pending(saveApi); mount(); type('显示名称', 'Changed'); const handler = save().props.onPress; const pickHandler = avatar().props.onPress;
  act(() => { void handler(); void handler(); void pickHandler(); }); expect(saveApi).toHaveBeenCalledTimes(1); expect(picker).not.toHaveBeenCalled();
  expect(avatar().props.disabled).toBe(true); expect(field('显示名称').props.editable).toBe(false); await act(async () => request.resolve(user));
});
it.each([new Error('offline'), {}, null])('retains unsaved edits and enables retry after save error %p', async error => {
  saveApi.mockRejectedValueOnce(error); mount(); type('显示名称', 'Changed'); await pressSave();
  expect(JSON.stringify(tree.toJSON())).toContain(error instanceof Error ? 'offline' : '保存失败');
  expect(field('显示名称').props.value).toBe('Changed'); expect(save().props.disabled).toBe(false); expect(mockGoBack).not.toHaveBeenCalled();
  await pressSave(); expect(saveApi).toHaveBeenCalledTimes(2);
});
it('protects unsaved edits until the user confirms leaving', () => {
  mount(); type('个人简介', 'changed'); const [enabled, callback] = (usePreventRemove as jest.Mock).mock.calls.at(-1);
  expect(enabled).toBe(true); const action = { type: 'GO_BACK' }; act(() => callback({ data: { action } }));
  expect(mockDispatch).not.toHaveBeenCalled(); act(() => (xConfirm as jest.Mock).mock.calls[0][2]()); expect(mockDispatch).toHaveBeenCalledWith(action);
});
it('allows navigation immediately after a successful save', async () => {
  mount(); type('个人简介', 'changed'); await pressSave(); const callback = (usePreventRemove as jest.Mock).mock.calls.at(-1)[1];
  const action = { type: 'GO_BACK' }; act(() => callback({ data: { action } })); expect(mockDispatch).toHaveBeenCalledWith(action); expect(xConfirm).not.toHaveBeenCalled();
});
it.each([{ canceled: true, assets: null }, { canceled: false, assets: [] }])('does not upload when selection has no image %p', async result => {
  picker.mockResolvedValueOnce(result); mount(); await pick(); expect(upload).not.toHaveBeenCalled(); expect(avatar().props.disabled).toBe(false);
});
it('uploads the selected native image and saves its resulting URL', async () => {
  mount(); await pick(); expect(upload).toHaveBeenCalledWith('file:///avatar.png', 'avatar.png', 'image/png');
  expect(tree.root.findByType('Image').props.source).toEqual({ uri: 'https://a/new-avatar.png' }); await pressSave();
  expect(saveApi.mock.calls[0][0].avatar).toBe('https://a/new-avatar.png');
});
it('supplies a filename and MIME type when the picker omits them', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(123); picker.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///image' }] });
  mount(); await pick(); expect(upload).toHaveBeenCalledWith('file:///image', 'avatar_123.jpg', 'image/jpeg');
});
it.each([new Error('permission denied'), null])('handles picker rejection without losing the old avatar %p', async error => {
  picker.mockRejectedValueOnce(error); mount(); await pick(); expect(xAlert).toHaveBeenCalledWith('上传失败', error instanceof Error ? error.message : '请稍后重试');
  expect(tree.root.findByType('Image').props.source).toEqual({ uri: user.avatar }); expect(avatar().props.disabled).toBe(false);
});
it.each([new Error('upload failed'), null])('retains the old avatar after upload failure %p', async error => {
  upload.mockRejectedValueOnce(error); mount(); await pick(); expect(xAlert).toHaveBeenCalledWith('上传失败', error instanceof Error ? error.message : '请稍后重试');
  expect(tree.root.findByType('Image').props.source).toEqual({ uri: user.avatar }); expect(avatar().props.disabled).toBe(false);
});
it('prevents duplicate picker calls and blocks saving while the picker is still open', async () => {
  const request = pending(picker); mount(); type('显示名称', 'Changed'); const handler = avatar().props.onPress; const saveHandler = save().props.onPress;
  act(() => { void handler(); void handler(); void saveHandler(); }); expect(picker).toHaveBeenCalledTimes(1); expect(saveApi).not.toHaveBeenCalled();
  expect(save().props.disabled).toBe(true); await act(async () => request.resolve({ canceled: true, assets: [] }));
});
it('does not upload an old selection under a newly signed-in account', async () => {
  const request = pending(picker); mount(); act(() => { void avatar().props.onPress(); }); switchAccount();
  await act(async () => request.resolve({ canceled: false, assets: [{ uri: 'file:///old' }] })); expect(upload).not.toHaveBeenCalled();
  expect(field('显示名称').props.value).toBe('Bob'); expect(tree.root.findByType('Image').props.source).toEqual({ uri: 'https://b/avatar.jpg' });
});
it('does not apply a stale upload result to the new account', async () => {
  const request = pending(upload); mount(); act(() => { void avatar().props.onPress(); }); await act(async () => { await Promise.resolve(); }); switchAccount();
  await act(async () => request.resolve({ url: 'https://a/stale' })); expect(tree.root.findByType('Image').props.source).toEqual({ uri: 'https://b/avatar.jpg' });
});
it('does not overwrite the new account cache or navigate when an old save completes', async () => {
  const request = pending(saveApi); mount(); type('显示名称', 'Changed'); act(() => { void save().props.onPress(); }); switchAccount();
  await act(async () => request.resolve(user)); expect(cache).not.toHaveBeenCalled(); expect(mockGoBack).not.toHaveBeenCalled();
});
it('does not dispatch an old discard confirmation after switching accounts', () => {
  mount(); type('个人简介', 'changed'); const callback = (usePreventRemove as jest.Mock).mock.calls.at(-1)[1];
  act(() => callback({ data: { action: { type: 'GO_BACK' } } })); const confirm = (xConfirm as jest.Mock).mock.calls[0][2];
  switchAccount(); act(() => confirm()); expect(mockDispatch).not.toHaveBeenCalled();
});
it('uploads a browser File converted from the selected blob URL', async () => {
  (Platform as any).OS = 'web'; global.fetch = jest.fn().mockResolvedValue({ blob: async () => new Blob(['image'], { type: 'image/png' }) });
  mount(); await pick(); expect(upload).not.toHaveBeenCalled(); expect(uploadFile).toHaveBeenCalledTimes(1);
  const file = uploadFile.mock.calls[0][0]; expect(file.name).toBe('avatar.png'); expect(file.type).toBe('image/png'); expect(await file.text()).toBe('image');
});
it('does not upload a converted browser blob after the account changes', async () => {
  (Platform as any).OS = 'web'; let finish!: (blob: Blob) => void;
  global.fetch = jest.fn().mockResolvedValue({ blob: () => new Promise(resolve => { finish = resolve; }) });
  mount(); act(() => { void avatar().props.onPress(); }); await act(async () => { await Promise.resolve(); await Promise.resolve(); }); switchAccount();
  await act(async () => finish(new Blob(['old image']))); expect(uploadFile).not.toHaveBeenCalled();
});
it('does not navigate if the account changes while the cache is being updated', async () => {
  const request = pending(cache); mount(); type('显示名称', 'Changed'); act(() => { void save().props.onPress(); });
  await act(async () => { await Promise.resolve(); }); expect(cache).toHaveBeenCalledTimes(1); switchAccount();
  await act(async () => request.resolve()); expect(mockGoBack).not.toHaveBeenCalled();
});
it('ignores old save failures without clearing the busy state of a newer save', async () => {
  const old = pending(saveApi); mount(); type('显示名称', 'Changed'); act(() => { void save().props.onPress(); }); switchAccount();
  const current = pending(saveApi); type('显示名称', 'New Bob'); act(() => { void save().props.onPress(); });
  await act(async () => old.reject(new Error('old error'))); expect(JSON.stringify(tree.toJSON())).not.toContain('old error');
  expect(save().props.disabled).toBe(true); await act(async () => current.resolve({ ...user, id: 2 }));
});
it('ignores old upload errors without unlocking a newer picker', async () => {
  const old = pending(upload); mount(); act(() => { void avatar().props.onPress(); }); await act(async () => { await Promise.resolve(); }); switchAccount();
  const current = pending(picker); act(() => { void avatar().props.onPress(); }); await act(async () => old.reject(new Error('old upload')));
  expect(xAlert).not.toHaveBeenCalled(); expect(avatar().props.disabled).toBe(true); await act(async () => current.resolve({ canceled: true, assets: [] }));
});
it('does not upload a picker result after unmount', async () => {
  const request = pending(picker); mount(); act(() => { void avatar().props.onPress(); }); act(() => tree.unmount()); tree = undefined;
  await act(async () => request.resolve({ canceled: false, assets: [{ uri: 'file:///old' }] })); expect(upload).not.toHaveBeenCalled();
});
it('does not show an upload failure after unmount', async () => {
  const request = pending(upload); mount(); act(() => { void avatar().props.onPress(); }); await act(async () => { await Promise.resolve(); });
  act(() => tree.unmount()); tree = undefined; await act(async () => request.reject(null)); expect(xAlert).not.toHaveBeenCalled();
});
it('still updates the same account cache after a successful save if the page unmounts', async () => {
  const request = pending(saveApi); mount(); type('显示名称', 'Changed'); act(() => { void save().props.onPress(); }); act(() => tree.unmount()); tree = undefined;
  await act(async () => request.resolve(user)); expect(cache).toHaveBeenCalledWith(user); expect(mockGoBack).not.toHaveBeenCalled();
});
it('ignores save failure after unmount', async () => {
  const request = pending(saveApi); mount(); type('显示名称', 'Changed'); act(() => { void save().props.onPress(); }); act(() => tree.unmount()); tree = undefined;
  await act(async () => request.reject(null)); expect(mockGoBack).not.toHaveBeenCalled(); expect(xAlert).not.toHaveBeenCalled();
});
it('rejects previously rendered save and picker callbacks after switching accounts', async () => {
  mount(); type('显示名称', 'Changed'); const saveHandler = save().props.onPress; const pickerHandler = avatar().props.onPress; switchAccount();
  await act(async () => { await saveHandler(); await pickerHandler(); }); expect(saveApi).not.toHaveBeenCalled(); expect(picker).not.toHaveBeenCalled();
});
it('ignores a browser fetch that finishes after the account changes', async () => {
  (Platform as any).OS = 'web'; let finish!: (response: unknown) => void; const blob = jest.fn();
  global.fetch = jest.fn().mockImplementation(() => new Promise(resolve => { finish = resolve; })); mount();
  act(() => { void avatar().props.onPress(); }); await act(async () => { await Promise.resolve(); }); switchAccount();
  await act(async () => finish({ blob })); expect(blob).not.toHaveBeenCalled(); expect(uploadFile).not.toHaveBeenCalled();
});
