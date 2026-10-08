// Factories execute during the import phase, before module-body consts initialize:
// every reference to a mock holder below is deferred (arrow wrapper or getter).
const mockNavHolder: { value?: any } = {};
const mockRoute: { params?: any } = { params: {} };
let mockPrevent: { enabled: boolean; handler: (e: any) => void } | null = null;
const mockDispatch = jest.fn();
let mockTagList: any[] = [];
const mockThunkResults: any = { create: jest.fn(), update: jest.fn() };
const mockCreateThunk = jest.fn((arg: any) => ({ kind: 'create', arg, unwrap: () => mockThunkResults.create() }));
const mockUpdateThunk = jest.fn((arg: any) => ({ kind: 'update', arg, unwrap: () => mockThunkResults.update() }));
const mockLoadTags = jest.fn(() => ({ type: 'tag/loadTags' }));
const mockAutosave: any = { status: '', save: jest.fn(), clear: jest.fn(), resume: jest.fn() };
let mockHoldArgs: any[] = [];
const mockVoiceOverlay = jest.fn((_props: any) => null);
const mockXAlert = jest.fn();
const mockXConfirm = jest.fn();
const mockActionSheet = jest.fn();
const mockConfirmPublic = jest.fn((cb: any) => cb());
const mockReadDraft = jest.fn();
const mockWriteDraft = jest.fn();
const mockRetainMedia = jest.fn();
const mockUploadRetained = jest.fn();
const mockPruneRetained = jest.fn();
const mockSubmissions: any = {};
const mockApi: any = {};
const mockAttachmentApi: any = {};
const mockImagePicker: any = {};
const mockDocumentPicker: any = {};
const mockLocationSvc: any = { Accuracy: { Balanced: 4 } };
const mockUseAudioPlayer = jest.fn();
const mockSetAudioModeAsync = jest.fn();
const mockAudioPlayer = { play: jest.fn(), pause: jest.fn() };
const mockBuildImageSource = jest.fn((url: any) => url);
const mockAsyncStorage: any = {};

jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', ScrollView: 'ScrollView',
  ActivityIndicator: 'ActivityIndicator', StyleSheet: { create: (value: unknown) => value },
  Platform: { OS: 'ios' }, Modal: 'Modal', FlatList: 'FlatList', Linking: { openURL: jest.fn() },
  Dimensions: { get: () => ({ width: 400, height: 800 }) },
  Keyboard: { dismiss: jest.fn(), addListener: jest.fn(() => ({ remove: jest.fn() })) },
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  // Getter so the factory does not touch the module-body const before it initializes.
  get TextInput() { return mockTextInput; },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('expo-image', () => ({ Image: 'ExpoImage' }));
jest.mock('react-native-markdown-display', () => 'Markdown');
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: (...args: any[]) => mockImagePicker.launchImageLibraryAsync(...args),
  requestCameraPermissionsAsync: (...args: any[]) => mockImagePicker.requestCameraPermissionsAsync(...args),
  launchCameraAsync: (...args: any[]) => mockImagePicker.launchCameraAsync(...args),
}));
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: (...args: any[]) => mockDocumentPicker.getDocumentAsync(...args),
}));
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 4 },
  requestForegroundPermissionsAsync: (...args: any[]) => mockLocationSvc.requestForegroundPermissionsAsync(...args),
  getCurrentPositionAsync: (...args: any[]) => mockLocationSvc.getCurrentPositionAsync(...args),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 10, bottom: 12, left: 0, right: 0 }) }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: (...args: any[]) => mockAsyncStorage.getItem(...args),
  setItem: (...args: any[]) => mockAsyncStorage.setItem(...args),
  removeItem: (...args: any[]) => mockAsyncStorage.removeItem(...args),
  getAllKeys: (...args: any[]) => mockAsyncStorage.getAllKeys(...args),
  multiGet: (...args: any[]) => mockAsyncStorage.multiGet(...args),
  multiRemove: (...args: any[]) => mockAsyncStorage.multiRemove(...args),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavHolder.value,
  useRoute: () => mockRoute,
  usePreventRemove: (enabled: boolean, handler: (e: any) => void) => { mockPrevent = { enabled, handler }; },
}));
jest.mock('../../src/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: any) => selector({ tag: { tags: mockTagList } }),
}));
jest.mock('../../src/store/slices/bbtalkSlice', () => ({
  get createBBTalkAsync() { return mockCreateThunk; },
  get updateBBTalkAsync() { return mockUpdateThunk; },
}));
jest.mock('../../src/store/slices/tagSlice', () => ({
  get loadTags() { return mockLoadTags; },
}));
jest.mock('../../src/services/api/mediaApi', () => ({
  attachmentApi: {
    upload: (...args: any[]) => mockAttachmentApi.upload(...args),
    uploadFile: (...args: any[]) => mockAttachmentApi.uploadFile(...args),
  },
}));
jest.mock('../../src/theme/ThemeContext', () => ({ useTheme: () => ({ theme: require('../../src/theme/themes').THEMES[0] }) }));
jest.mock('../../src/utils/crossAlert', () => ({
  xAlert: (...args: any[]) => mockXAlert(...args),
  xConfirm: (...args: any[]) => mockXConfirm(...args),
  xActionSheet: (...args: any[]) => mockActionSheet(...args),
}));
jest.mock('../../src/services/drafts', () => ({
  readDraft: (...args: any[]) => mockReadDraft(...args),
  writeDraft: (...args: any[]) => mockWriteDraft(...args),
}));
jest.mock('../../src/services/pendingMedia', () => ({
  retainMedia: (...args: any[]) => mockRetainMedia(...args),
  uploadRetainedMedia: (...args: any[]) => mockUploadRetained(...args),
  pruneRetainedMedia: (...args: any[]) => mockPruneRetained(...args),
}));
jest.mock('../../src/services/submissions', () => ({
  beginSubmission: (payload: any, session?: any) => mockSubmissions.begin(payload, session),
  readSubmission: (session?: any) => mockSubmissions.read(session),
  confirmSubmission: (key: string, session?: any) => mockSubmissions.confirm(key, session),
  forgetConfirmedSubmission: (key: string, session?: any) => mockSubmissions.forget(key, session),
}));
jest.mock('../../src/services/api/bbtalkApi', () => ({
  bbtalkApi: {
    submissionStatus: (key: string) => mockApi.submissionStatus(key),
  },
  transformBBTalk: (data: any) => mockApi.transformBBTalk(data),
}));
jest.mock('../../src/utils/confirmPublicVisibility', () => ({
  confirmPublicVisibility: (cb: any) => mockConfirmPublic(cb),
}));
jest.mock('../../src/utils/imageSource', () => ({
  buildImageSource: (url: any) => mockBuildImageSource(url),
}));
jest.mock('../../src/components/VoiceRecordingOverlay', () => ({
  __esModule: true,
  get default() { return mockVoiceOverlay; },
}));
jest.mock('../../src/hooks/useHoldToRecord', () => ({
  useHoldToRecord: (...args: any[]) => {
    mockHoldArgs = args;
    return { pressed: false, holdMode: false, cancelHint: false, stopAction: undefined, handlers: {} };
  },
}));
jest.mock('../../src/hooks/useDraftAutosave', () => ({
  useDraftAutosave: () => mockAutosave,
}));
jest.mock('expo-audio', () => ({
  useAudioPlayer: (url: string) => mockUseAudioPlayer(url),
  setAudioModeAsync: (...args: any[]) => mockSetAudioModeAsync(...args),
}));

import React from 'react';
import ComposeScreen from '../../src/screens/ComposeScreen';
import { setSession, getSession } from '../../src/services/session';
import type { Attachment, BBTalk } from '../../src/types';

const { create, act } = require('react-test-renderer');

// The editor focuses the input through a ref after toolbar inserts; host strings
// have no focus(), so expose an imperative handle like the real TextInput.
const mockTextInput = React.forwardRef(function MockTextInput(props: any, ref: any) {
  React.useImperativeHandle(ref, () => ({ focus: jest.fn(), blur: jest.fn() }));
  return null;
});

let tree: any;
function att(uid: string, type = 'image'): Attachment {
  return { uid, url: `file:///${uid}`, type, filename: `${uid}.bin`, originalFilename: `${uid}.orig` };
}
function makeEditItem(overrides: Partial<BBTalk> = {}): BBTalk {
  return {
    id: 'rec_1', content: '原始内容', visibility: 'private',
    tags: [{ id: 'tag-1', name: '工作', color: '#123456', sortOrder: 0, bbtalkCount: 2 }],
    attachments: [], context: {}, isPinned: false, commentCount: 0,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', ...overrides,
  };
}
const pendingItem = (id: string, name = `${id}.jpg`): any => ({ id, uri: `file:///${id}`, name, mime: 'image/jpeg' });
const draftJson = (value: any) => JSON.stringify(value);
const SOURCE_CONTEXT = { client: 'ChewyBBTalk Mobile', version: '1.0', platform: 'mobile' };

const settle = async (rounds = 2) => {
  for (let i = 0; i < rounds; i += 1) await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0); }); });
};
async function mountCompose(props: any = {}) {
  await act(async () => { tree = create(<ComposeScreen {...props} />); });
  await settle();
}
const input = () => tree.root.findAllByType(mockTextInput)[0];
async function typeIn(text: string) { await act(async () => { input().props.onChangeText(text); }); }
// Prefer the innermost match so container touchables never swallow a press.
// Interpolated JSX ({lat}, {lng} / #{name}) renders children as arrays; flatten first.
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
async function press(label: string) { await act(async () => { await tappable(label).props.onPress(); }); }
const hasText = (s: string) => tree.root.findAllByType('Text').some((t: any) => childText(t.props.children) === s);
const imageCount = () => tree.root.findAllByType('ExpoImage').length;
const overlayProps = () => mockVoiceOverlay.mock.calls[mockVoiceOverlay.mock.calls.length - 1][0];

beforeAll(() => { setSession('https://api.example', '1'); });

beforeEach(() => {
  mockNavHolder.value = { goBack: jest.fn(), dispatch: jest.fn(), setParams: jest.fn() };
  mockRoute.params = {};
  mockPrevent = null;
  mockTagList = [];
  mockDispatch.mockReset().mockImplementation((action: any) => action);
  mockCreateThunk.mockClear();
  mockUpdateThunk.mockClear();
  mockLoadTags.mockClear();
  mockThunkResults.create = jest.fn(async () => undefined);
  mockThunkResults.update = jest.fn(async () => undefined);
  Object.assign(mockAutosave, { status: '', save: jest.fn(async () => {}), clear: jest.fn(async () => {}), resume: jest.fn() });
  mockHoldArgs = [];
  mockVoiceOverlay.mockClear();
  mockXAlert.mockReset();
  mockXConfirm.mockReset();
  mockActionSheet.mockReset();
  mockConfirmPublic.mockReset().mockImplementation((cb: any) => cb());
  mockReadDraft.mockReset().mockResolvedValue(null);
  mockWriteDraft.mockReset().mockResolvedValue(undefined);
  mockRetainMedia.mockReset();
  mockUploadRetained.mockReset();
  mockPruneRetained.mockReset().mockResolvedValue(undefined);
  mockSubmissions.begin = jest.fn(async (payload: any) => ({ key: 'sub_1', payload, state: 'pending' }));
  mockSubmissions.read = jest.fn(async () => undefined);
  mockSubmissions.confirm = jest.fn(async () => {});
  mockSubmissions.forget = jest.fn(async () => {});
  mockApi.submissionStatus = jest.fn(async () => ({ id: 'rec_x' }));
  mockApi.transformBBTalk = jest.fn((data: any) => data);
  mockAttachmentApi.upload = jest.fn();
  mockAttachmentApi.uploadFile = jest.fn();
  mockImagePicker.launchImageLibraryAsync = jest.fn(async () => ({ canceled: true, assets: [] }));
  mockImagePicker.requestCameraPermissionsAsync = jest.fn(async () => ({ granted: false }));
  mockImagePicker.launchCameraAsync = jest.fn(async () => ({ canceled: true, assets: [] }));
  mockDocumentPicker.getDocumentAsync = jest.fn(async () => ({ canceled: true, assets: [] }));
  mockLocationSvc.requestForegroundPermissionsAsync = jest.fn(async () => ({ status: 'granted' }));
  mockLocationSvc.getCurrentPositionAsync = jest.fn(async () => ({ coords: { latitude: 39.9042, longitude: 116.4074 } }));
  mockUseAudioPlayer.mockReset().mockImplementation(() => mockAudioPlayer);
  mockSetAudioModeAsync.mockReset().mockResolvedValue(undefined);
  mockBuildImageSource.mockReset().mockImplementation((url: any) => url);
  mockAsyncStorage.getItem = jest.fn(async () => null);
  mockAsyncStorage.setItem = jest.fn(async () => undefined);
  mockAsyncStorage.removeItem = jest.fn(async () => undefined);
  mockAsyncStorage.getAllKeys = jest.fn(async () => [] as string[]);
});

afterEach(() => { act(() => { tree?.unmount(); }); tree = undefined; });

describe('ComposeScreen rendering and modes', () => {
  it('renders the composer and gates publishing on content', async () => {
    await mountCompose();
    expect(hasText('写一条')).toBe(true);
    expect(tappable('保存').props.disabled).toBe(true);
    await typeIn('#随笔 hello ');
    expect(input().props.value).toBe('#随笔 hello ');
    expect(tappable('保存').props.disabled).toBe(false);
    expect(hasText('仅自己可见')).toBe(true);
  });

  it('toggles between preview and edit while preserving the content', async () => {
    await mountCompose();
    await press('切换到预览模式');
    expect(input()).toBeUndefined();
    expect(hasText('暂无内容可预览')).toBe(true);
    await press('切换到编辑模式');
    await typeIn('#tag hello **bold**');
    await press('切换到预览模式');
    expect(tree.root.findAllByType('Markdown')[0].props.children).toBe('#tag hello **bold**');
    await press('切换到编辑模式');
    expect(input()).toBeDefined();
    expect(input().props.value).toBe('#tag hello **bold**');
  });

  it('switches to public only after the confirmation dialog accepts', async () => {
    mockConfirmPublic.mockReset().mockImplementationOnce((cb: any) => {});
    await mountCompose();
    await press('修改可见性');
    expect(hasText('仅自己可见')).toBe(true);
    mockConfirmPublic.mockImplementationOnce((cb: any) => cb());
    await press('修改可见性');
    expect(hasText('公开可见')).toBe(true);
    expect(tappable('发布')).toBeDefined();
  });

  it('saves a manual draft retry through the status bar', async () => {
    await mountCompose();
    await press('重试保存草稿');
    expect(mockAutosave.save).toHaveBeenCalledTimes(1);
  });
});

describe('ComposeScreen drafts', () => {
  it('restores a version-1 draft with attachments, location and pending media', async () => {
    mockReadDraft.mockResolvedValue(draftJson({
      version: 1, content: '#存档 hello ', visibility: 'public', attachments: [att('d1')],
      location: { latitude: 31.2304, longitude: 121.4737 }, pendingMedia: [pendingItem('p1'), { id: 7 }],
      baseUpdatedAt: '2026-02-02T00:00:00Z',
    }));
    await mountCompose();
    expect(input().props.value).toBe('#存档 hello ');
    expect(hasText('公开可见')).toBe(true);
    expect(imageCount()).toBe(1);
    expect(mockBuildImageSource).toHaveBeenCalledWith('file:///d1');
    expect(hasText('31.2304, 121.4737')).toBe(true);
    expect(hasText('附件待上传，草稿保存在本机')).toBe(true);
    expect(hasText('p1.jpg')).toBe(true);
    expect(tappable('发布').props.disabled).toBe(true);
  });

  it('falls back to a legacy plain-text draft', async () => {
    mockReadDraft.mockResolvedValue('旧的纯文本草稿');
    await mountCompose();
    expect(input().props.value).toBe('旧的纯文本草稿');
  });

  it('recovers the oldest locked capture when the regular draft is empty', async () => {
    const prefix = `compose_draft:${getSession().scope}:locked:`;
    mockReadDraft
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(draftJson({ version: 1, content: '锁屏时的记录', visibility: 'private', attachments: [], location: null, pendingMedia: [] }));
    mockAsyncStorage.getAllKeys = jest.fn(async () => [`${prefix}222`, `${prefix}111`]);
    await mountCompose();
    expect(mockReadDraft.mock.calls[1][0]).toBe(`${prefix}111`);
    expect(input().props.value).toBe('锁屏时的记录');
  });

  it('reports a draft read failure without crashing the editor', async () => {
    mockReadDraft.mockRejectedValue(new Error('corrupt'));
    await mountCompose();
    expect(hasText('无法读取草稿，请重新打开编辑器后重试。')).toBe(true);
  });
});

describe('ComposeScreen publish', () => {
  it('publishes a new record end-to-end and leaves the editor', async () => {
    await mountCompose();
    await typeIn('#随笔 hello ');
    await press('保存');
    expect(mockSubmissions.begin).toHaveBeenCalledWith({
      content: 'hello', tags: ['随笔'], visibility: 'private', attachments: [], context: { source: SOURCE_CONTEXT },
    }, getSession());
    expect(mockCreateThunk).toHaveBeenCalledWith({
      content: 'hello', tags: ['随笔'], visibility: 'private', attachments: [],
      context: { source: SOURCE_CONTEXT }, submissionKey: 'sub_1',
    });
    expect(mockSubmissions.confirm).toHaveBeenCalledWith('sub_1', getSession());
    expect(mockSubmissions.forget).toHaveBeenCalledWith('sub_1', getSession());
    expect(mockAutosave.save).toHaveBeenCalledTimes(1);
    expect(mockAutosave.clear).toHaveBeenCalledTimes(1);
    expect(mockLoadTags).toHaveBeenCalled();
    expect(mockNavHolder.value.goBack).toHaveBeenCalledTimes(1);
    // After a successful publish the leave guard lets navigation pass directly.
    await act(async () => { mockPrevent!.handler({ data: { action: { type: 'NAV_A' } } }); });
    expect(mockNavHolder.value.dispatch).toHaveBeenCalledWith({ type: 'NAV_A' });
    expect(mockActionSheet).not.toHaveBeenCalled();
  });

  it('publishes an attachment-only record as 附件记录', async () => {
    mockReadDraft.mockResolvedValue(draftJson({
      version: 1, content: '', visibility: 'private', attachments: [att('only1')], location: null, pendingMedia: [],
    }));
    await mountCompose();
    expect(tappable('保存').props.disabled).toBe(false);
    await press('保存');
    expect(mockSubmissions.begin.mock.calls[0][0]).toEqual({
      content: '附件记录', tags: [], visibility: 'private', attachments: [att('only1')], context: { source: SOURCE_CONTEXT },
    });
  });

  it('submits only once per press burst', async () => {
    let resolveCreate!: (value: any) => void;
    mockThunkResults.create = jest.fn(() => new Promise<any>((resolve) => { resolveCreate = resolve; }));
    await mountCompose();
    await typeIn('hello');
    const submit = tappable('保存');
    const handler = submit.props.onPress;
    await act(async () => { void handler(); void handler(); });
    expect(mockCreateThunk).toHaveBeenCalledTimes(1);
    expect(submit.props.disabled).toBe(true);
    await act(async () => { resolveCreate(undefined); });
    await settle();
    expect(mockCreateThunk).toHaveBeenCalledTimes(1);
    expect(mockNavHolder.value.goBack).toHaveBeenCalledTimes(1);
  });

  it('warns when publishing succeeds but local cleanup fails', async () => {
    mockAutosave.clear = jest.fn(async () => { throw new Error('disk full'); });
    await mountCompose();
    await typeIn('hello');
    await press('保存');
    expect(hasText('发布成功，但本地清理失败。请核对原提交，避免重复发布。')).toBe(true);
    expect(mockNavHolder.value.goBack).not.toHaveBeenCalled();
    expect(hasText('查看原提交内容')).toBe(true);
  });

  it('updates an existing record with the expected revision', async () => {
    mockRoute.params = { editItem: makeEditItem() };
    await mountCompose();
    expect(hasText('编辑记录')).toBe(true);
    expect(input().props.value).toBe('#工作 原始内容');
    expect(tappable('更新')).toBeDefined();
    await typeIn('#工作 改后的内容');
    await press('更新');
    expect(mockUpdateThunk).toHaveBeenCalledWith({
      id: 'rec_1',
      expectedUpdatedAt: '2026-01-02T00:00:00Z',
      data: {
        content: '改后的内容',
        tags: [{ id: '', name: '工作', color: '', sortOrder: 0, bbtalkCount: 0 }],
        visibility: 'private', attachments: [], context: { source: SOURCE_CONTEXT },
      },
    });
    expect(mockSubmissions.begin).not.toHaveBeenCalled();
    expect(mockAutosave.clear).toHaveBeenCalledTimes(1);
    expect(mockNavHolder.value.goBack).toHaveBeenCalledTimes(1);
  });

  it('recovers from an edit conflict by adopting the server revision', async () => {
    mockRoute.params = { editItem: makeEditItem() };
    mockThunkResults.update = jest.fn(async () => { throw { code: 'edit_conflict', current: {
      id: 'rec_1', content: '服务器版本', tags: [{ name: '新' }], visibility: 'public',
      attachments: [{ uid: 'a9', filename: 'x.png' }], updatedAt: '2026-05-01T00:00:00Z',
    } }; });
    await mountCompose();
    await typeIn('#工作 本地修改');
    await press('更新');
    expect(mockXConfirm).toHaveBeenCalledWith('记录已有新版本', expect.stringContaining('服务器版本'), expect.any(Function), undefined, {
      confirmText: '保留修改继续编辑', cancelText: '暂不处理',
    });
    const onConfirm = mockXConfirm.mock.calls[0][2];
    await act(async () => { onConfirm(); });
    expect(hasText('已核对最新版本，可继续修改后再次保存。')).toBe(true);
    mockThunkResults.update = jest.fn(async () => undefined);
    await press('更新');
    expect(mockUpdateThunk).toHaveBeenLastCalledWith(expect.objectContaining({ expectedUpdatedAt: '2026-05-01T00:00:00Z' }));
    expect(mockNavHolder.value.goBack).toHaveBeenCalledTimes(1);
  });

  it('keeps local input when an update fails without a conflict', async () => {
    mockRoute.params = { editItem: makeEditItem() };
    mockThunkResults.update = jest.fn(async () => { throw { message: '服务不可用' }; });
    await mountCompose();
    await typeIn('#工作 改后的内容');
    await press('更新');
    expect(hasText('发布或更新失败，内容已保留。服务不可用')).toBe(true);
    expect(input().props.value).toBe('#工作 改后的内容');
    expect(mockNavHolder.value.goBack).not.toHaveBeenCalled();
  });
});

describe('ComposeScreen pending submission recovery', () => {
  const savedIntent = () => ({
    key: 'sub_9',
    payload: { content: '上次的内容', tags: [], visibility: 'private', attachments: [], context: {} },
    state: 'pending',
  });
  async function mountWithPending() {
    mockSubmissions.read = jest.fn(async () => savedIntent());
    await mountCompose();
    expect(hasText('有一份发布结果待核对')).toBe(true);
  }

  it('shows the pending banner and the original payload', async () => {
    await mountWithPending();
    await press('查看原提交内容');
    expect(mockXAlert).toHaveBeenCalledWith('原提交内容', '上次的内容');
  });

  it('verifies the server state and confirms the intent', async () => {
    await mountWithPending();
    await press('核对发布结果');
    expect(mockApi.submissionStatus).toHaveBeenCalledWith('sub_9');
    expect(mockSubmissions.confirm).toHaveBeenCalledWith('sub_9', getSession());
    expect(hasText('已确认原提交发布成功，当前输入仍保留。修改后可发布新记录。')).toBe(true);
    expect(tappable('核对发布结果')).toBeUndefined();
  });

  it('retries the original submission through the create thunk', async () => {
    await mountWithPending();
    await press('重试原提交');
    expect(mockCreateThunk).toHaveBeenCalledWith({ ...savedIntent().payload, submissionKey: 'sub_9' });
    expect(mockSubmissions.confirm).toHaveBeenCalledWith('sub_9', getSession());
    expect(hasText('已确认原提交发布成功，当前输入仍保留。修改后可发布新记录。')).toBe(true);
  });

  it('marks a 410 as deleted instead of recreating it', async () => {
    mockSubmissions.read = jest.fn(async () => savedIntent());
    mockApi.submissionStatus = jest.fn(async () => { throw { status: 410 }; });
    await mountCompose();
    await press('核对发布结果');
    expect(mockSubmissions.confirm).toHaveBeenCalledWith('sub_9', getSession());
    expect(mockCreateThunk).not.toHaveBeenCalled();
    expect(hasText('原提交的记录已删除，不会重新创建。')).toBe(true);
  });

  it('suggests retrying after a 404', async () => {
    mockSubmissions.read = jest.fn(async () => savedIntent());
    mockApi.submissionStatus = jest.fn(async () => { throw { status: 404 }; });
    await mountCompose();
    await press('核对发布结果');
    expect(hasText('暂未查到结果，可重试原提交；当前输入仍保留。')).toBe(true);
  });

  it('keeps the original submission on an unknown verification failure', async () => {
    mockSubmissions.read = jest.fn(async () => savedIntent());
    mockApi.submissionStatus = jest.fn(async () => { throw { status: 500 }; });
    await mountCompose();
    await press('核对发布结果');
    expect(mockSubmissions.confirm).not.toHaveBeenCalled();
    expect(hasText('保存当前草稿或核对失败，原提交仍保留。请保留编辑器中的输入后重试。')).toBe(true);
  });

  it('reports an unreadable submission without blocking the editor', async () => {
    mockSubmissions.read = jest.fn(async () => { throw new Error('broken'); });
    await mountCompose();
    expect(hasText('无法读取原提交，请保留输入并重新打开编辑器。')).toBe(true);
  });
});

describe('ComposeScreen leave guard', () => {
  it('saves the draft and leaves when asked', async () => {
    await mountCompose();
    expect(mockPrevent!.enabled).toBe(false);
    await typeIn('草稿内容');
    expect(mockPrevent!.enabled).toBe(true);
    await act(async () => { mockPrevent!.handler({ data: { action: { type: 'NAV_A' } } }); });
    expect(mockActionSheet).toHaveBeenCalledWith('离开编辑器',
      [{ text: '保存草稿并退出' }, { text: '丢弃修改', destructive: true }], expect.any(Function), '继续编辑');
    await act(async () => { await mockActionSheet.mock.calls[0][2](0); });
    expect(mockAutosave.save).toHaveBeenCalledTimes(1);
    expect(mockNavHolder.value.dispatch).toHaveBeenCalledWith({ type: 'NAV_A' });
  });

  it('discards on request and ignores the cancel choice', async () => {
    await mountCompose();
    await typeIn('草稿内容');
    await act(async () => { mockPrevent!.handler({ data: { action: { type: 'NAV_B' } } }); });
    await act(async () => { await mockActionSheet.mock.calls[0][2](2); });
    expect(mockAutosave.clear).not.toHaveBeenCalled();
    expect(mockNavHolder.value.dispatch).not.toHaveBeenCalled();
    await act(async () => { mockPrevent!.handler({ data: { action: { type: 'NAV_B' } } }); });
    await act(async () => { await mockActionSheet.mock.calls[1][2](1); });
    expect(mockAutosave.clear).toHaveBeenCalledTimes(1);
    expect(mockAutosave.save).not.toHaveBeenCalled();
    expect(mockNavHolder.value.dispatch).toHaveBeenCalledWith({ type: 'NAV_B' });
  });

  it('stays in the editor when the draft cannot be saved', async () => {
    mockAutosave.save = jest.fn(async () => { throw new Error('io'); });
    await mountCompose();
    await typeIn('草稿内容');
    await act(async () => { mockPrevent!.handler({ data: { action: { type: 'NAV_C' } } }); });
    await act(async () => { await mockActionSheet.mock.calls[0][2](0); });
    expect(mockXAlert).toHaveBeenCalledWith('草稿保存失败', '当前内容仍保留，请重试后再退出。');
    expect(mockNavHolder.value.dispatch).not.toHaveBeenCalled();
  });
});

describe('ComposeScreen locked capture', () => {
  it('resets the quick editor after saving and stays on screen', async () => {
    const onRequestUnlock = jest.fn();
    await mountCompose({ lockedCapture: true, onRequestUnlock });
    expect(hasText('快速记录')).toBe(true);
    expect(tappable('解锁查看历史')).toBeDefined();
    await typeIn('快速记一条');
    await press('保存');
    expect(mockSubmissions.begin).toHaveBeenCalledTimes(1);
    expect(input().props.value).toBe('');
    expect(hasText('已保存')).toBe(true);
    expect(mockAutosave.clear).toHaveBeenCalledTimes(1);
    expect(mockAutosave.resume).toHaveBeenCalledTimes(1);
    expect(mockNavHolder.value.goBack).not.toHaveBeenCalled();
    expect(mockPrevent!.enabled).toBe(false);
  });

  it('persists unsaved input when unlocking and clears an empty capture', async () => {
    const onRequestUnlock = jest.fn();
    await mountCompose({ lockedCapture: true, onRequestUnlock });
    await press('解锁查看历史');
    expect(mockWriteDraft).toHaveBeenCalledWith(expect.stringContaining(':locked:'), null, getSession());
    expect(onRequestUnlock).toHaveBeenCalledTimes(1);
    mockWriteDraft.mockClear();
    await typeIn('锁屏输入');
    await press('解锁查看历史');
    expect(mockWriteDraft).toHaveBeenCalledWith(expect.stringContaining(':locked:'), expect.objectContaining({
      version: 1, content: '锁屏输入',
    }), getSession());
    expect(onRequestUnlock).toHaveBeenCalledTimes(2);
  });

  it('keeps the input when the unlock draft save fails', async () => {
    const onRequestUnlock = jest.fn();
    mockWriteDraft.mockRejectedValueOnce(new Error('io'));
    await mountCompose({ lockedCapture: true, onRequestUnlock });
    await typeIn('锁屏输入');
    await press('解锁查看历史');
    expect(hasText('草稿保存失败，请重试；当前输入仍保留。')).toBe(true);
    expect(onRequestUnlock).not.toHaveBeenCalled();
  });
});

describe('ComposeScreen media', () => {
  function mountWithPendingDraft() {
    mockReadDraft.mockResolvedValue(draftJson({
      version: 1, content: '带附件', visibility: 'private', attachments: [], location: null,
      pendingMedia: [pendingItem('p1')], baseUpdatedAt: undefined,
    }));
    return mountCompose();
  }

  it('retries uploading a retained attachment from a restored draft', async () => {
    const uploaded = att('up1');
    mockUploadRetained.mockResolvedValue(uploaded);
    await mountWithPendingDraft();
    await press('重试上传');
    expect(mockUploadRetained).toHaveBeenCalledWith(pendingItem('p1'), getSession());
    expect(mockWriteDraft).toHaveBeenCalledWith(expect.stringContaining('compose_draft:'), expect.objectContaining({
      attachments: [uploaded], pendingMedia: [],
    }), getSession());
    expect(imageCount()).toBe(1);
    expect(tappable('重试上传')).toBeUndefined();
    expect(hasText('附件待上传，草稿保存在本机')).toBe(false);
  });

  it('keeps failed uploads local with a retry option', async () => {
    mockUploadRetained.mockRejectedValue(new Error('offline'));
    await mountWithPendingDraft();
    await press('重试上传');
    expect(hasText('上传未完成，附件已保留在本机。联网后可重试。')).toBe(true);
    expect(tappable('重试上传')).toBeDefined();
    expect(hasText('p1.jpg')).toBe(true);
  });

  it('removes a pending attachment without uploading it', async () => {
    await mountWithPendingDraft();
    await press('移除待上传附件 p1.jpg');
    expect(hasText('p1.jpg')).toBe(false);
    expect(hasText('附件待上传，草稿保存在本机')).toBe(false);
    expect(mockUploadRetained).not.toHaveBeenCalled();
  });

  it('runs picked images through retain and upload, snapshotting drafts', async () => {
    const retained = pendingItem('m1', 'new.png');
    const uploaded = att('up1');
    mockRetainMedia.mockResolvedValue(retained);
    mockUploadRetained.mockResolvedValue(uploaded);
    mockImagePicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false, assets: [{ uri: 'file:///new.png', fileName: 'new.png', mimeType: 'image/png' }],
    });
    await mountCompose();
    await typeIn('配图说明');
    await press('添加图片');
    expect(mockRetainMedia).toHaveBeenCalledWith('file:///new.png', 'new.png', 'image/png', getSession());
    expect(mockUploadRetained).toHaveBeenCalledWith(retained, getSession());
    expect(mockWriteDraft).toHaveBeenCalledWith(expect.stringContaining('compose_draft:'), expect.objectContaining({
      content: '配图说明', pendingMedia: [retained],
    }), getSession());
    expect(imageCount()).toBe(1);
    expect(hasText('附件待上传，草稿保存在本机')).toBe(false);
  });

  it('shows the retain error and skips upload when local retention fails', async () => {
    mockRetainMedia.mockRejectedValue(new Error('磁盘已满'));
    mockImagePicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false, assets: [{ uri: 'file:///new.png', fileName: 'new.png', mimeType: 'image/png' }],
    });
    await mountCompose();
    await press('添加图片');
    expect(hasText('磁盘已满')).toBe(true);
    expect(mockUploadRetained).not.toHaveBeenCalled();
  });

  it('requires camera permission before capturing a photo', async () => {
    await mountCompose();
    await press('更多工具');
    await press('拍照');
    expect(mockXAlert).toHaveBeenCalledWith('需要相机权限', '可在系统设置中允许相机访问，也可以从相册添加照片。');
    expect(mockImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  });

  it('reports picker failures and ignores cancelled selections', async () => {
    mockImagePicker.launchImageLibraryAsync.mockRejectedValue(new Error('denied'));
    await mountCompose();
    await press('添加图片');
    expect(mockXAlert).toHaveBeenCalledWith('无法打开相册', '请检查照片权限后重试');
    mockDocumentPicker.getDocumentAsync.mockResolvedValue({
      canceled: true, assets: [{ uri: 'file:///doc.pdf', name: 'doc.pdf', mimeType: 'application/pdf' }],
    });
    await press('更多工具');
    await press('添加文件');
    expect(mockRetainMedia).not.toHaveBeenCalled();
  });

  it('removes an existing attachment from the editor', async () => {
    mockRoute.params = { editItem: makeEditItem({ attachments: [att('img1'), att('img2')] }) };
    await mountCompose();
    expect(imageCount()).toBe(2);
    await press('删除附件');
    expect(imageCount()).toBe(1);
  });
});

describe('ComposeScreen toolbar', () => {
  it('expands and collapses the extra tools row', async () => {
    await mountCompose();
    expect(tappable('拍照')).toBeUndefined();
    await press('更多工具');
    expect(tappable('拍照')).toBeDefined();
    expect(tappable('添加位置')).toBeDefined();
    await press('更多工具');
    expect(tappable('拍照')).toBeUndefined();
  });

  it('inserts a hash, offers quick tags, and inserts a chosen tag', async () => {
    mockTagList = [
      { id: 't1', name: '工作', color: '', sortOrder: 0, bbtalkCount: 0 },
      { id: 't2', name: '生活', color: '', sortOrder: 0, bbtalkCount: 0 },
    ];
    await mountCompose();
    await press('插入标签');
    expect(input().props.value).toBe('#');
    await press('#工作');
    expect(input().props.value).toBe('# #工作 ');
    expect(tappable('#工作')).toBeUndefined();
    expect(tappable('移除标签 工作')).toBeDefined();
    // insertTag closed the quick tags, so the next toolbar press inserts a new hash.
    await press('插入标签');
    expect(input().props.value).toBe('# #工作 #');
    expect(tappable('#生活')).toBeDefined();
    await press('插入标签');
    expect(tappable('#生活')).toBeUndefined();
  });

  it('removes a parsed tag from the content', async () => {
    await mountCompose();
    await typeIn('#tag1 hello #tag2 ');
    await press('移除标签 tag1');
    expect(input().props.value).toContain('hello #tag2 ');
    expect(tappable('移除标签 tag1')).toBeUndefined();
    expect(tappable('移除标签 tag2')).toBeDefined();
  });

  it('inserts markdown snippets at the cursor', async () => {
    await mountCompose();
    await press('更多工具');
    await press('加粗');
    expect(input().props.value).toBe('**粗体**');
    await press('引用');
    expect(input().props.value).toBe('**粗体**\n> ');
  });

  it('captures and clears the location, toggling off without re-requesting', async () => {
    await mountCompose();
    await press('更多工具');
    await press('添加位置');
    expect(mockLocationSvc.getCurrentPositionAsync).toHaveBeenCalledWith({ accuracy: 4 });
    expect(hasText('39.9042, 116.4074')).toBe(true);
    await press('移除位置');
    expect(hasText('39.9042, 116.4074')).toBe(false);
    await press('添加位置');
    await press('添加位置');
    expect(mockLocationSvc.getCurrentPositionAsync).toHaveBeenCalledTimes(2);
    expect(hasText('39.9042, 116.4074')).toBe(false);
  });

  it('explains denied location permission and transient failures', async () => {
    mockLocationSvc.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });
    await mountCompose();
    await press('更多工具');
    await press('添加位置');
    expect(mockXAlert).toHaveBeenCalledWith('提示', '需要定位权限');
    mockLocationSvc.requestForegroundPermissionsAsync.mockRejectedValue(new Error('boom'));
    await press('添加位置');
    expect(mockXAlert).toHaveBeenCalledWith('定位失败', '请稍后重试');
  });

  it('plays and pauses audio attachments through expo-audio', async () => {
    mockRoute.params = { editItem: makeEditItem({ attachments: [att('a1', 'audio')] }) };
    await mountCompose();
    await press('录音');
    expect(mockSetAudioModeAsync).toHaveBeenCalledWith({ playsInSilentMode: true });
    expect(mockAudioPlayer.play).toHaveBeenCalledTimes(1);
    expect(tree.root.findAllByType('Icon').some((n: any) => n.props.name === 'pause')).toBe(true);
    await press('录音');
    expect(mockAudioPlayer.pause).toHaveBeenCalledTimes(1);
  });

  it('opens video attachments externally and labels other file types', async () => {
    const { Linking } = require('react-native');
    mockRoute.params = { editItem: makeEditItem({ attachments: [att('v1', 'video'), att('f1', 'file')] }) };
    await mountCompose();
    await press('视频');
    expect(Linking.openURL).toHaveBeenCalledWith('file:///v1');
    expect(hasText('f1.orig')).toBe(true);
  });
});

describe('ComposeScreen voice input', () => {
  it('appends an incoming route voice result and clears the param', async () => {
    mockRoute.params = { voiceResult: { text: '语音内容', audioUri: null, audioDuration: 1 } };
    await mountCompose();
    expect(input().props.value).toBe('语音内容');
    expect(mockNavHolder.value.setParams).toHaveBeenCalledWith({ voiceResult: undefined });
  });

  it('opens the recording overlay from the mic and cancels it', async () => {
    await mountCompose();
    expect(overlayProps().visible).toBe(false);
    await act(async () => { mockHoldArgs[0]!(); });
    expect(overlayProps().visible).toBe(true);
    await act(async () => { overlayProps().onCancel(); });
    expect(overlayProps().visible).toBe(false);
    await act(async () => { mockHoldArgs[2]!(); });
    expect(overlayProps().visible).toBe(true);
  });

  it('appends transcribed text and uploads the voice memo on finish', async () => {
    mockRetainMedia.mockResolvedValue(pendingItem('voice_1', 'voice_1.m4a'));
    mockUploadRetained.mockResolvedValue(att('voice_up', 'audio'));
    await mountCompose();
    await typeIn('已有内容');
    await act(async () => { mockHoldArgs[0]!(); });
    await act(async () => { await overlayProps().onFinish({ text: '你好', audioUri: 'file:///voice.m4a', audioDuration: 3 }); });
    await settle();
    expect(input().props.value).toBe('已有内容\n你好');
    expect(mockRetainMedia).toHaveBeenCalledWith('file:///voice.m4a', expect.stringMatching(/^voice_\d+\.m4a$/), 'audio/mp4', getSession());
    expect(hasText('录音')).toBe(true);
    expect(overlayProps().visible).toBe(false);
  });
});
