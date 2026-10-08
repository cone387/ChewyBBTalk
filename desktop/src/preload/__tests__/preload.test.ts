import { beforeEach, expect, it, vi } from 'vitest';

const ipc = vi.hoisted(() => {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  return {
    listeners,
    invoke: vi.fn(),
    send: vi.fn(),
    on: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
      listeners.set(channel, [...(listeners.get(channel) || []), listener]);
    }),
    off: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
      listeners.set(channel, (listeners.get(channel) || []).filter(fn => fn !== listener));
    }),
    emit: (channel: string, ...args: unknown[]) => {
      listeners.get(channel)?.slice().forEach(listener => listener(...args));
    },
    exposed: {} as Record<string, unknown>,
  };
});

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: (key: string, value: unknown) => { ipc.exposed[key] = value; } },
  ipcRenderer: { invoke: ipc.invoke, send: ipc.send, on: ipc.on, off: ipc.off },
}));

beforeEach(() => {
  vi.clearAllMocks();
  ipc.listeners.clear();
});

async function loadApi() {
  const mod = await import('../index');
  return mod;
}

it('exposes the desktop bridge under the window.desktop key', async () => {
  await loadApi();
  expect(Object.keys(ipc.exposed)).toEqual(['desktop']);
  const api = ipc.exposed['desktop'] as Record<string, Record<string, unknown>>;
  expect(Object.keys(api).sort()).toEqual(['auth', 'ball', 'compose', 'login', 'quit', 'settings', 'shell', 'updates']);
});

it.each([
  ['updates:state', () => (ipc.exposed['desktop'] as any).updates.getState(), []],
  ['updates:check', () => (ipc.exposed['desktop'] as any).updates.check(), []],
  ['updates:download', () => (ipc.exposed['desktop'] as any).updates.download(), []],
  ['updates:install', () => (ipc.exposed['desktop'] as any).updates.install(), []],
  ['ball:get-suspended', () => (ipc.exposed['desktop'] as any).ball.getSuspended(), []],
  ['ball:get-overlay-info', () => (ipc.exposed['desktop'] as any).ball.getOverlayInfo(), []],
  ['ball:set-ignore-mouse-events', () => (ipc.exposed['desktop'] as any).ball.setIgnoreMouseEvents(true), [true]],
  ['ball:save-position', () => (ipc.exposed['desktop'] as any).ball.savePosition(12, 34), [12, 34]],
  ['compose:get-pinned', () => (ipc.exposed['desktop'] as any).compose.getPinned(), []],
  ['compose:set-pinned', () => (ipc.exposed['desktop'] as any).compose.setPinned(true), [true]],
  ['uploads:list', () => (ipc.exposed['desktop'] as any).compose.listUploads('scope-a'), ['scope-a']],
  ['uploads:stage', () => (ipc.exposed['desktop'] as any).compose.stageUpload('scope-a', { name: 'a.png' }), ['scope-a', { name: 'a.png' }]],
  ['uploads:retry', () => (ipc.exposed['desktop'] as any).compose.retryUpload('scope-a', 'u1'), ['scope-a', 'u1']],
  ['uploads:remove', () => (ipc.exposed['desktop'] as any).compose.removeUpload('scope-a', 'u1'), ['scope-a', 'u1']],
  ['uploads:clear', () => (ipc.exposed['desktop'] as any).compose.clearUploads('scope-a'), ['scope-a']],
  ['uploads:preview', () => (ipc.exposed['desktop'] as any).compose.previewUpload('scope-a', 'u1'), ['scope-a', 'u1']],
  ['compose:show', () => (ipc.exposed['desktop'] as any).compose.show(10, 20), [10, 20]],
  ['compose:hide', () => (ipc.exposed['desktop'] as any).compose.hide(), []],
  ['compose:toggle', () => (ipc.exposed['desktop'] as any).compose.toggle(5, 6), [5, 6]],
  ['compose:submission-snapshot', () => (ipc.exposed['desktop'] as any).compose.submissionSnapshot(), []],
  ['compose:publish-submission', () => (ipc.exposed['desktop'] as any).compose.publishSubmission('s', { content: 'x' }), ['s', { content: 'x' }]],
  ['compose:recover-submission', () => (ipc.exposed['desktop'] as any).compose.recoverSubmission('s', true), ['s', true]],
  ['compose:forget-submission', () => (ipc.exposed['desktop'] as any).compose.forgetSubmission('s', 'k'), ['s', 'k']],
  ['compose:get-draft', () => (ipc.exposed['desktop'] as any).compose.getDraft('s'), ['s']],
  ['compose:save-draft', () => (ipc.exposed['desktop'] as any).compose.saveDraft('text', 's'), ['text', 's']],
  ['compose:clear-draft', () => (ipc.exposed['desktop'] as any).compose.clearDraft('s'), ['s']],
  ['compose:get-api-url', () => (ipc.exposed['desktop'] as any).compose.getApiUrl(), []],
  ['compose:resize', () => (ipc.exposed['desktop'] as any).compose.resize(440, 220), [440, 220]],
  ['compose:get-visibility', () => (ipc.exposed['desktop'] as any).compose.getVisibility(), []],
  ['compose:set-visibility', () => (ipc.exposed['desktop'] as any).compose.setVisibility('public'), ['public']],
  ['compose:open-file-dialog', () => (ipc.exposed['desktop'] as any).compose.openFileDialog(), []],
  ['auth:browser-login', () => (ipc.exposed['desktop'] as any).auth.browserLogin('https://server.test'), ['https://server.test']],
  ['auth:cancel-browser-login', () => (ipc.exposed['desktop'] as any).auth.cancelBrowserLogin(), []],
  ['auth:state', () => (ipc.exposed['desktop'] as any).auth.getState(), []],
  ['auth:restore', () => (ipc.exposed['desktop'] as any).auth.restore(), []],
  ['auth:login', () => (ipc.exposed['desktop'] as any).auth.login('alice', 'pw', 'https://server.test'), ['alice', 'pw', 'https://server.test']],
  ['auth:logout', () => (ipc.exposed['desktop'] as any).auth.logout(), []],
  ['auth:get-access-token', () => (ipc.exposed['desktop'] as any).auth.getAccessToken(), []],
  ['auth:get-valid-access-token', () => (ipc.exposed['desktop'] as any).auth.getValidAccessToken(), []],
  ['auth:is-logged-in', () => (ipc.exposed['desktop'] as any).auth.isLoggedIn(), []],
  ['shell:open-external', () => (ipc.exposed['desktop'] as any).shell.openExternal('https://x.test'), ['https://x.test']],
  ['login:show', () => (ipc.exposed['desktop'] as any).login.show(), []],
  ['login:hide', () => (ipc.exposed['desktop'] as any).login.hide(), []],
  ['settings:get-version', () => (ipc.exposed['desktop'] as any).settings.getVersion(), []],
  ['settings:save-server', () => (ipc.exposed['desktop'] as any).settings.saveServer('https://server.test'), ['https://server.test']],
  ['settings:show', () => (ipc.exposed['desktop'] as any).settings.show(), []],
  ['settings:hide', () => (ipc.exposed['desktop'] as any).settings.hide(), []],
  ['app:quit', () => (ipc.exposed['desktop'] as any).quit(), []],
])('forwards %s over invoke', async (_name, call, args) => {
  await loadApi();
  call();
  expect(ipc.invoke).toHaveBeenCalledWith(_name, ...args);
});

it.each([
  ['updates:changed', 'onChanged', 'updates', [{ checking: true }]],
  ['ball:suspension-changed', 'onSuspensionChanged', 'ball', [true]],
  ['ball:overlay-info', 'onOverlayInfo', 'ball', [{ overlay: { x: 0, y: 0, width: 100, height: 100 }, displays: [] }]],
  ['uploads:changed', 'onUploadsChanged', 'compose', ['scope-a']],
  ['auth:state-changed', 'onStateChanged', 'auth', [{ status: 'authenticated' }]],
])('routes %s events to subscribers and detaches on unsubscribe', async (channel, method, group, payload) => {
  await loadApi();
  const cb = vi.fn();
  const unsubscribe = (ipc.exposed['desktop'] as any)[group][method](cb);
  expect(cb).not.toHaveBeenCalled();
  ipc.emit(channel, { sender: {} }, ...payload);
  expect(cb).toHaveBeenCalledWith(...payload);
  unsubscribe();
  ipc.emit(channel, { sender: {} }, ...payload);
  expect(cb).toHaveBeenCalledTimes(1);
  expect(ipc.off).toHaveBeenCalledWith(channel, expect.any(Function));
});

it('ignores the ipc event payload when notifying compose focus requests', async () => {
  await loadApi();
  const cb = vi.fn();
  (ipc.exposed['desktop'] as any).compose.onFocusRequested(cb);
  ipc.emit('compose:focus-input', { sender: {} }, 'unused-payload');
  expect(cb).toHaveBeenCalledWith();
});

it('acknowledces before-close flushes and reports callback failures', async () => {
  await loadApi();
  const api = ipc.exposed['desktop'] as any;
  let onClose: (() => Promise<void>) | undefined;
  const flush = vi.fn(() => { onClose?.(); return Promise.resolve(); });
  api.compose.onBeforeClose(flush);
  const channel = 'compose:before-close';
  const registered = ipc.listeners.get(channel)![0] as any;
  await registered({ sender: {} }, 'close-1');
  expect(flush).toHaveBeenCalledTimes(1);
  expect(ipc.send).toHaveBeenCalledWith('compose:close-ready', 'close-1');

  ipc.send.mockClear();
  const failing = vi.fn(() => Promise.reject(new Error('disk full')));
  api.compose.onBeforeClose(failing);
  const failingListener = ipc.listeners.get(channel)![1] as any;
  await failingListener({ sender: {} }, 'close-2');
  expect(ipc.send).toHaveBeenCalledWith('compose:close-error', 'close-2', 'disk full');

  ipc.send.mockClear();
  const nonError = vi.fn(() => Promise.reject('nope'));
  api.compose.onBeforeClose(nonError);
  const nonErrorListener = ipc.listeners.get(channel)![2] as any;
  await nonErrorListener({ sender: {} }, 'close-3');
  expect(ipc.send).toHaveBeenCalledWith('compose:close-error', 'close-3', '保存失败');
});
