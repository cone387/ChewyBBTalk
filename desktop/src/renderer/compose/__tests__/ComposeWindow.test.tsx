import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { installMiniDom, type MiniDom } from '../../__tests__/miniDom';
import { ComposeWindow } from '../ComposeWindow';
import type { AuthState, SubmissionIntent, SubmissionSnapshot, UploadItem } from '../../../shared/ipc-types';

const defaultPayload = { content: 'old', post_tags: '', attachments: [], visibility: 'private' as const, context: {} };

const state = vi.hoisted(() => ({
  snapshot: { session: { scope: 'user:1', generation: 1 } } as SubmissionSnapshot | null,
  draft: '',
  uploads: [] as UploadItem[],
  visibility: 'private' as 'public' | 'private',
  pinned: false,
  publishResult: null as SubmissionIntent | null,
  recoverResult: null as SubmissionIntent | null,
  previewBytes: { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png' },
  snapshotError: null as Error | null,
  focusListeners: new Array<() => void>(),
  authListeners: new Array<(state: AuthState) => void>(),
  uploadsListeners: new Array<(scope: string) => void>(),
  beforeCloseListeners: new Array<() => Promise<void>>(),
}));

const desktop = vi.hoisted(() => ({
  compose: {
    onFocusRequested: (cb: () => void) => { state.focusListeners.push(cb); return () => { state.focusListeners = state.focusListeners.filter(fn => fn !== cb); }; },
    onBeforeClose: (cb: () => Promise<void>) => { state.beforeCloseListeners.push(cb); return () => { state.beforeCloseListeners = state.beforeCloseListeners.filter(fn => fn !== cb); }; },
    onUploadsChanged: (cb: (scope: string) => void) => { state.uploadsListeners.push(cb); return () => { state.uploadsListeners = state.uploadsListeners.filter(fn => fn !== cb); }; },
    submissionSnapshot: vi.fn(() => state.snapshotError ? Promise.reject(state.snapshotError) : Promise.resolve(state.snapshot)),
    getDraft: vi.fn(() => Promise.resolve(state.draft)),
    saveDraft: vi.fn(() => Promise.resolve()),
    clearDraft: vi.fn(() => Promise.resolve()),
    listUploads: vi.fn(() => Promise.resolve(state.uploads)),
    stageUpload: vi.fn(() => Promise.resolve()),
    retryUpload: vi.fn(() => Promise.resolve()),
    removeUpload: vi.fn(() => Promise.resolve()),
    clearUploads: vi.fn(() => Promise.resolve()),
    previewUpload: vi.fn(() => Promise.resolve(state.previewBytes)),
    publishSubmission: vi.fn(() => Promise.resolve(state.publishResult ?? { key: 'k1', payload: defaultPayload, state: 'confirmed' as const })),
    recoverSubmission: vi.fn(() => Promise.resolve(state.recoverResult ?? { key: 'k1', payload: defaultPayload, state: 'confirmed' as const })),
    forgetSubmission: vi.fn(() => Promise.resolve()),
    getVisibility: vi.fn(() => Promise.resolve(state.visibility)),
    setVisibility: vi.fn(() => Promise.resolve()),
    getPinned: vi.fn(() => Promise.resolve(state.pinned)),
    setPinned: vi.fn(() => Promise.resolve()),
    getApiUrl: vi.fn(() => Promise.resolve('https://server.test')),
    resize: vi.fn(() => Promise.resolve()),
    hide: vi.fn(() => Promise.resolve()),
    show: vi.fn(() => Promise.resolve()),
  },
  auth: {
    getState: vi.fn(() => Promise.resolve({ status: 'authenticated', username: 'alice' } as AuthState)),
    restore: vi.fn(() => Promise.resolve(true)),
    onStateChanged: (cb: (state: AuthState) => void) => { state.authListeners.push(cb); return () => { state.authListeners = state.authListeners.filter(fn => fn !== cb); }; },
  },
  login: { show: vi.fn(() => Promise.resolve()) },
  settings: { show: vi.fn(() => Promise.resolve()) },
}));

let dom: MiniDom;
let react: typeof import('react');
let client: typeof import('react-dom/client');
let root: import('react-dom/client').Root;

beforeEach(async () => {
  dom = installMiniDom();
  react = await import('react');
  client = await import('react-dom/client');
  vi.clearAllMocks();
  state.snapshot = { session: { scope: 'user:1', generation: 1 } };
  state.draft = '';
  state.uploads = [];
  state.visibility = 'private';
  state.pinned = false;
  state.publishResult = null;
  state.recoverResult = null;
  state.snapshotError = null;
  state.focusListeners = [];
  state.authListeners = [];
  state.uploadsListeners = [];
  state.beforeCloseListeners = [];
  desktop.auth.getState.mockImplementation(() => Promise.resolve({ status: 'authenticated', username: 'alice' } as AuthState));
  desktop.compose.previewUpload.mockImplementation(() => Promise.resolve(state.previewBytes));
  (window as any).desktop = desktop;
});

afterEach(async () => {
  if (root) await act(() => root.unmount());
  root = undefined as unknown as import('react-dom/client').Root;
  dom.restore();
});

async function act(fn: () => void) {
  const { act: run } = await import('react');
  let error: unknown;
  await run(async () => { try { fn(); } catch (e) { error = e; } });
  if (error) throw error;
}

async function mount() {
  const container = dom.document.createElement('div');
  dom.document.body.appendChild(container);
  root = client.createRoot(container as any);
  await act(() => root.render(react.createElement(ComposeWindow)));
  await act(async () => {});
  return container;
}

async function remount() {
  if (root) await act(() => root.unmount());
  root = undefined as unknown as import('react-dom/client').Root;
  return mount();
}

const q = (selector: string) => dom.document.querySelectorAll(selector);
const text = (selector: string) => q(selector).map(el => el.textContent).join('|');
const click = async (el: any) => { await act(() => dom.dispatch(el, { type: 'click' })); await act(async () => {}); };

/** Flush effects inside act, let real 0ms timers fire outside act, then settle again. */
async function settle() {
  await act(async () => {});
  await new Promise(resolve => setTimeout(resolve, 25));
  await act(async () => {});
}

async function type(textarea: any, value: string) {
  textarea.value = value;
  await act(() => dom.dispatch(textarea, { type: 'input', target: textarea }));
  await settle();
}

const textarea = () => q('textarea.compose-textarea')[0];

it('shows the loading state until the session snapshot resolves', async () => {
  desktop.compose.submissionSnapshot.mockImplementationOnce(() => new Promise<SubmissionSnapshot | null>(() => {}));
  await mount();
  expect(text('.compose-root')).toContain('加载中…');
  expect(q('textarea')).toHaveLength(0);
});

it('loads the draft, focuses the textarea, and resizes the window', async () => {
  state.draft = 'hello draft';
  await mount();
  expect(textarea().value).toBe('hello draft');
  expect(dom.document.activeElement === textarea()).toBe(true);
  dom.window.runAnimationFrames();
  await act(async () => {});
  expect(desktop.compose.resize).toHaveBeenCalledWith(440, 160);
  expect(desktop.compose.getDraft).toHaveBeenCalledWith(state.snapshot!.session);
  expect(text('.publish-btn')).toContain('发布');
});

it('refocuses the textarea when the main process requests focus', async () => {
  await mount();
  dom.document.activeElement = null;
  await act(() => state.focusListeners.forEach(fn => fn()));
  expect(dom.document.activeElement === textarea()).toBe(true);
});

it('offers the login affordance when there is no session', async () => {
  state.snapshot = null;
  await mount();
  expect(text('.publish-btn.login-btn')).toBe('登录');
  await click(q('.publish-btn')[0]);
  expect(desktop.login.show).toHaveBeenCalledTimes(1);
});

it('surfaces a snapshot failure and lets the user sign in', async () => {
  state.snapshotError = new Error('会话读取失败');
  await mount();
  expect(text('.toast.error')).toBe('会话读取失败');
  expect(text('.publish-btn.login-btn')).toBe('登录');
});

it('toggles the pinned state through the main process', async () => {
  await mount();
  expect(text('.pin-btn')).toBe('置顶');
  await click(q('.pin-btn')[0]);
  expect(desktop.compose.setPinned).toHaveBeenCalledWith(true);
  expect(text('.pin-btn')).toBe('已置顶');
  state.pinned = true;
  await remount();
  expect(text('.pin-btn')).toBe('已置顶');
});

it('opens settings and closes the composer from the titlebar', async () => {
  await mount();
  await click(q('[aria-label=设置]')[0]);
  expect(desktop.settings.show).toHaveBeenCalledTimes(1);
  await click(q('[aria-label=关闭]')[0]);
  expect(desktop.compose.hide).toHaveBeenCalledTimes(1);
});

it('hides on Escape but only closes the preview when one is open', async () => {
  state.uploads = [{ id: 'u1', name: 'pic.png', mimeType: 'image/png', fileSize: 3, type: 'image', status: 'uploaded' }];
  await mount();
  await act(() => dom.fireWindow('keydown', { key: 'Escape' }));
  expect(desktop.compose.hide).toHaveBeenCalledTimes(1);
  const img = q('.file-preview-img')[0];
  await click(img);
  expect(q('.image-preview-overlay')).toHaveLength(1);
  await act(() => dom.fireWindow('keydown', { key: 'Escape' }));
  expect(desktop.compose.hide).toHaveBeenCalledTimes(1);
  expect(q('.image-preview-overlay')).toHaveLength(0);
});

it('tracks typing with a character count and tag pills', async () => {
  await mount();
  const area = textarea();
  await type(area, 'hello #world foo');
  expect(text('.char-count')).toBe('16 字');
  expect(text('.tag-pill')).toBe('#world');
});

it('closes the image preview overlay on click', async () => {
  state.uploads = [{ id: 'u1', name: 'pic.png', mimeType: 'image/png', fileSize: 3, type: 'image', status: 'uploaded' }];
  await mount();
  await click(q('.file-preview-img')[0]);
  expect(q('.image-preview-overlay')).toHaveLength(1);
  await click(q('.image-preview-overlay')[0]);
  expect(q('.image-preview-overlay')).toHaveLength(0);
});

it('retries a failed image preview', async () => {
  state.uploads = [{ id: 'u1', name: 'pic.png', mimeType: 'image/png', fileSize: 3, type: 'image', status: 'uploaded' }];
  desktop.compose.previewUpload.mockImplementationOnce(() => Promise.reject(new Error('gone')));
  await mount();
  expect(text('.preview-retry')).toBe('重试预览');
  await click(q('.preview-retry')[0]);
  expect(desktop.compose.previewUpload).toHaveBeenCalledTimes(2);
  expect(q('.file-preview-img')).toHaveLength(1);
});

it('cycles visibility and persists the choice', async () => {
  await mount();
  const btn = q('.visibility-btn')[0];
  expect(btn.classList.contains('active')).toBe(false);
  await click(btn);
  expect(desktop.compose.setVisibility).toHaveBeenCalledWith('public');
  expect(btn.classList.contains('active')).toBe(true);
});

it('inserts a tag marker at the cursor', async () => {
  await mount();
  const area = textarea();
  await type(area, 'hello');
  area.selectionStart = 5;
  area.selectionEnd = 5;
  await click(q('[title=添加标签]')[0]);
  await settle();
  expect(textarea().value).toBe('hello #');
});

it('publishes parsed tags with cleaned content and clears local state', async () => {
  await mount();
  await type(textarea(), 'hello #world foo ');
  await click(q('.publish-btn')[0]);
  expect(desktop.compose.publishSubmission).toHaveBeenCalledWith(
    { scope: 'user:1', generation: 1 },
    {
      content: 'hello foo', post_tags: 'world', attachments: [], visibility: 'private',
      context: { source: { client: 'Desktop', platform: 'Win32' } },
    },
  );
  expect(desktop.compose.clearDraft).toHaveBeenCalledWith({ scope: 'user:1', generation: 1 });
  expect(desktop.compose.clearUploads).toHaveBeenCalledWith({ scope: 'user:1', generation: 1 });
  expect(desktop.compose.forgetSubmission).toHaveBeenCalledWith({ scope: 'user:1', generation: 1 }, 'k1');
  expect(text('.toast.success')).toBe('已发布');
  expect(textarea().value).toBe('');
  expect(q('.char-count')).toHaveLength(0);
});

it('publishes over Enter and allows explicit newlines with Shift+Enter', async () => {
  await mount();
  await type(textarea(), 'plain text');
  await act(() => dom.dispatch(textarea(), { type: 'keydown', key: 'Enter', shiftKey: false, keyCode: 13, nativeEvent: { isComposing: false } }));
  await act(async () => {});
  expect(desktop.compose.publishSubmission).toHaveBeenCalledTimes(1);
  await type(textarea(), 'more');
  await act(() => dom.dispatch(textarea(), { type: 'keydown', key: 'Enter', shiftKey: true, keyCode: 13, nativeEvent: { isComposing: false } }));
  await act(async () => {});
  expect(desktop.compose.publishSubmission).toHaveBeenCalledTimes(1);
});

it('keeps content when publishing fails and refreshes the snapshot', async () => {
  desktop.compose.publishSubmission.mockImplementationOnce(() => Promise.reject(new Error('服务器错误')));
  await mount();
  await type(textarea(), 'hello #world foo ');
  await click(q('.publish-btn')[0]);
  expect(text('.toast.error')).toBe('服务器错误');
  expect(textarea().value).toBe('hello #world foo ');
  expect(desktop.compose.submissionSnapshot.mock.calls.length).toBeGreaterThanOrEqual(2);
});

it('warns when local cleanup after publishing fails', async () => {
  desktop.compose.forgetSubmission.mockImplementationOnce(() => Promise.reject(new Error('busy')));
  await mount();
  await type(textarea(), 'hello ');
  await click(q('.publish-btn')[0]);
  expect(text('.toast.error')).toBe('发布成功，但本地清理失败，请核对原提交。');
  expect(textarea().value).toBe('hello ');
});

it('skips publishing for blank content or while uploading', async () => {
  state.uploads = [{ id: 'u1', name: 'a.png', mimeType: 'image/png', fileSize: 1, type: 'image', status: 'uploading' }];
  await mount();
  expect(q('.publish-btn')[0].disabled).toBe(true);
  await type(textarea(), 'text');
  expect(q('.publish-btn')[0].disabled).toBe(true);
  expect(text('.uploading-indicator')).toContain('已上传 0/1');
});

it('renders upload states with retry and remove controls', async () => {
  state.uploads = [
    { id: 'u1', name: 'ok.png', mimeType: 'image/png', fileSize: 1, type: 'image', status: 'uploaded' },
    { id: 'u2', name: 'bad.png', mimeType: 'image/png', fileSize: 1, type: 'image', status: 'failed', error: 'too large' },
    { id: 'u3', name: 'note.txt', mimeType: 'text/plain', fileSize: 1, type: 'file', status: 'queued' },
  ];
  await mount();
  expect(q('.file-preview-item')).toHaveLength(3);
  expect(text('.upload-status')).toBe('已上传|上传失败|等待上传');
  expect(text('.upload-retry')).toBe('重试');
  expect(q('.upload-error')[0].textContent).toBe('too large');
  await click(q('.upload-retry')[0]);
  expect(desktop.compose.retryUpload).toHaveBeenCalledWith({ scope: 'user:1', generation: 1 }, 'u2');
  await click(q('[aria-label=移除 ok.png]')[0]);
  expect(desktop.compose.removeUpload).toHaveBeenCalledWith({ scope: 'user:1', generation: 1 }, 'u1');
});

it('shows non-image attachments without a thumbnail request', async () => {
  state.uploads = [{ id: 'u3', name: 'note.txt', mimeType: 'text/plain', fileSize: 1, type: 'file', status: 'uploaded' }];
  await mount();
  expect(desktop.compose.previewUpload).not.toHaveBeenCalled();
  expect(text('.file-preview-name')).toContain('note.txt');
});

it('uploads files picked through the hidden input', async () => {
  await mount();
  const file = { name: 'shot.png', type: 'image/png', arrayBuffer: async () => new Uint8Array([9, 9]).buffer };
  const input = q('input[type=file]')[0];
  input.files = [file];
  await act(() => dom.dispatch(input, { type: 'change', target: input }));
  await act(async () => {});
  expect(desktop.compose.stageUpload).toHaveBeenCalledWith({ scope: 'user:1', generation: 1 }, { name: 'shot.png', mimeType: 'image/png', bytes: new Uint8Array([9, 9]) });
});

it('uploads dropped files and renders the drag overlay', async () => {
  await mount();
  const file = { name: 'drop.png', type: 'image/png', arrayBuffer: async () => new ArrayBuffer(0) };
  await act(() => dom.dispatch(q('.compose-root')[0], {
    type: 'dragenter', dataTransfer: { types: ['Files'], files: [file], dropEffect: '' },
  }));
  expect(q('.drag-overlay')).toHaveLength(1);
  await act(() => dom.dispatch(q('.compose-root')[0], {
    type: 'drop', dataTransfer: { types: ['Files'], files: [file], dropEffect: '' },
  }));
  await act(async () => {});
  expect(q('.drag-overlay')).toHaveLength(0);
  expect(desktop.compose.stageUpload).toHaveBeenCalledTimes(1);
});

it('ignores drags that do not carry files and clears the overlay on leave', async () => {
  await mount();
  await act(() => dom.dispatch(q('.compose-root')[0], { type: 'dragenter', dataTransfer: { types: ['text/plain'], files: [] } }));
  expect(q('.drag-overlay')).toHaveLength(0);
  await act(() => dom.dispatch(q('.compose-root')[0], { type: 'dragenter', dataTransfer: { types: ['Files'], files: [] } }));
  expect(q('.drag-overlay')).toHaveLength(1);
  await act(() => dom.dispatch(q('.compose-root')[0], { type: 'dragleave', clientX: 100, clientY: 100, dataTransfer: { types: ['Files'], files: [] } }));
  expect(q('.drag-overlay')).toHaveLength(0);
});

it('uploads pasted clipboard images only', async () => {
  await mount();
  const file = { name: 'paste.png', type: 'image/png', arrayBuffer: async () => new ArrayBuffer(0) };
  await act(() => dom.dispatch(textarea(), { type: 'paste', clipboardData: { items: [{ type: 'image/png', getAsFile: () => file }] } }));
  await act(async () => {});
  expect(text('.toast.info')).toBe('正在上传剪贴板图片…');
  expect(desktop.compose.stageUpload).toHaveBeenCalledTimes(1);
  await act(() => dom.dispatch(textarea(), { type: 'paste', clipboardData: { items: [{ type: 'text/plain', getAsFile: () => null }] } }));
  expect(desktop.compose.stageUpload).toHaveBeenCalledTimes(1);
});

it('reports stage failures as toasts', async () => {
  desktop.compose.stageUpload.mockImplementationOnce(() => Promise.reject(new Error('磁盘已满')));
  await mount();
  const file = { name: 'shot.png', type: 'image/png', arrayBuffer: async () => new ArrayBuffer(0) };
  await act(() => dom.dispatch(textarea(), { type: 'paste', clipboardData: { items: [{ type: 'image/png', getAsFile: () => file }] } }));
  await act(async () => {});
  expect(text('.toast.error')).toBe('磁盘已满');
});

it('auto-recovers a pending submission on mount and confirms it', async () => {
  state.snapshot = { session: { scope: 'user:1', generation: 1 }, intent: { key: 'k1', payload: defaultPayload, state: 'pending' } };
  await mount();
  expect(desktop.compose.recoverSubmission).toHaveBeenCalledWith({ scope: 'user:1', generation: 1 }, false);
  expect(text('.submission-recovery p')).toContain('原提交已确认');
  expect(q('.submission-recovery button')).toHaveLength(0);
});

it('keeps the recovery panel actionable when auto-recovery fails', async () => {
  state.snapshot = { session: { scope: 'user:1', generation: 1 }, intent: { key: 'k1', payload: defaultPayload, state: 'pending' } };
  desktop.compose.recoverSubmission.mockImplementationOnce(() => Promise.reject(new Error('offline')));
  await mount();
  expect(text('.submission-recovery p')).toContain('有一份发布结果待核对');
  desktop.compose.recoverSubmission.mockImplementation(() => Promise.resolve({ key: 'k1', payload: defaultPayload, state: 'confirmed', deleted: true }));
  await type(textarea(), 'draft text');
  await click(q('.submission-recovery button')[0]);
  expect(desktop.compose.recoverSubmission).toHaveBeenLastCalledWith({ scope: 'user:1', generation: 1 }, false);
  expect(desktop.compose.saveDraft).toHaveBeenCalledWith('draft text', { scope: 'user:1', generation: 1 });
  expect(text('.toast.info')).toBe('原提交已删除，不会重新创建。');
});

it('retries the original submission through the recovery panel', async () => {
  state.snapshot = { session: { scope: 'user:1', generation: 1 }, intent: { key: 'k1', payload: defaultPayload, state: 'pending' } };
  desktop.compose.recoverSubmission.mockImplementationOnce(() => new Promise(() => {}));
  await mount();
  const buttons = q('.submission-recovery button');
  expect(buttons).toHaveLength(2);
  desktop.compose.recoverSubmission.mockImplementation(() => Promise.resolve({ key: 'k1', payload: defaultPayload, state: 'confirmed' }));
  await click(buttons[1]);
  expect(desktop.compose.recoverSubmission).toHaveBeenLastCalledWith({ scope: 'user:1', generation: 1 }, true);
  expect(text('.toast.info')).toContain('原提交已确认');
});

it('saves the draft on close after uploads settle', async () => {
  await mount();
  await type(textarea(), 'before close');
  state.beforeCloseListeners.forEach(fn => { void fn(); });
  await settle();
  expect(desktop.compose.saveDraft).toHaveBeenCalledWith('before close', { scope: 'user:1', generation: 1 });
});

it('autosaves content changes as drafts', async () => {
  await mount();
  desktop.compose.saveDraft.mockClear();
  await type(textarea(), 'autosave me');
  expect(desktop.compose.saveDraft).toHaveBeenCalledWith('autosave me', { scope: 'user:1', generation: 1 });
});

it('shows an error toast when the draft cannot be saved', async () => {
  desktop.compose.saveDraft.mockImplementation(() => Promise.reject(new Error('只读磁盘')));
  await mount();
  await type(textarea(), 'will fail');
  expect(text('.toast.error')).toBe('只读磁盘');
});

it('renders session notices for offline and signed-out states with actions', async () => {
  desktop.auth.getState.mockImplementation(() => Promise.resolve({ status: 'offline', username: 'a' } as AuthState));
  await mount();
  expect(text('.session-notice')).toContain('当前离线，草稿已保留');
  await click(q('.session-notice button')[0]);
  expect(desktop.auth.restore).toHaveBeenCalledTimes(1);

  desktop.auth.getState.mockImplementation(() => Promise.resolve({ status: 'signed-out' } as AuthState));
  state.snapshot = null;
  await remount();
  expect(text('.session-notice')).toContain('登录后继续记录');
  await click(q('.session-notice button')[0]);
  expect(desktop.login.show).toHaveBeenCalledTimes(1);
});

it('shows the expired notice and refreshes the session on auth changes', async () => {
  desktop.auth.getState.mockImplementation(() => Promise.resolve({ status: 'expired' } as AuthState));
  await mount();
  expect(text('.session-notice')).toContain('登录已过期');

  desktop.auth.getState.mockImplementation(() => Promise.resolve({ status: 'authenticated', username: 'alice' } as AuthState));
  const calls = desktop.compose.submissionSnapshot.mock.calls.length;
  await act(() => state.authListeners.forEach(cb => cb({ status: 'authenticated', username: 'alice' } as AuthState)));
  await act(async () => {});
  expect(desktop.compose.submissionSnapshot.mock.calls.length).toBeGreaterThan(calls);
  expect(q('.session-notice')).toHaveLength(0);
});

it('reloads uploads when they change for the active scope', async () => {
  await mount();
  state.uploads = [{ id: 'u9', name: 'new.png', mimeType: 'image/png', fileSize: 1, type: 'image', status: 'uploaded' }];
  desktop.compose.listUploads.mockClear();
  await act(() => state.uploadsListeners.forEach(cb => cb('user:1')));
  await act(async () => {});
  expect(text('.file-preview-name')).toContain('new.png');
  desktop.compose.listUploads.mockClear();
  await act(() => state.uploadsListeners.forEach(cb => cb('user:other')));
  expect(desktop.compose.listUploads).not.toHaveBeenCalled();
});
