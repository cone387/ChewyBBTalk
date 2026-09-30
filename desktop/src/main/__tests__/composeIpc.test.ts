import { beforeEach, expect, it, vi } from 'vitest';
import type { SubmissionSession } from '../../shared/ipc-types';
const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(), data: {} as Record<string, any>,
  session: { scope: 'server/alice', generation: 1 } as SubmissionSession,
  composeVisible: false, show: vi.fn(), hide: vi.fn(), resize: vi.fn(), pin: vi.fn(),
  cancel: vi.fn(), logout: vi.fn(), emit: vi.fn(), dialog: vi.fn(),
}));
vi.mock('electron', () => ({ ipcMain: { handle: (channel: string, handler: (...args: any[]) => any) => state.handlers.set(channel, handler) }, dialog: { showOpenDialog: state.dialog }, app: { getVersion: () => '1.0.0' } }));
vi.mock('../store', () => ({ store: { get: (key: string) => state.data[key], set: (key: string, value: any) => { state.data[key] = structuredClone(value); } } }));
vi.mock('../auth', () => ({
  getSubmissionSession: () => state.session, normalizeServer: (value: string) => value.replace(/\/+$/, ''), getApiUrl: () => 'https://a.example',
  logout: state.logout, getAuthState: () => ({ status: 'signedOut' }), authEvents: { emit: state.emit },
}));
vi.mock('../browserAuth', () => ({ cancelBrowserLogin: state.cancel }));
vi.mock('../uploads', () => ({ listUploads: vi.fn(), stageUpload: vi.fn(), retryUpload: vi.fn(), removeUpload: vi.fn(), clearUploads: vi.fn(), previewUpload: vi.fn() }));
vi.mock('../windows/composeWindow', () => ({ showComposeWindow: state.show, hideComposeWindow: state.hide, resizeComposeWindow: state.resize, isComposeVisible: () => state.composeVisible, getComposeWindow: () => ({ setAlwaysOnTop: state.pin }) }));
vi.mock('../windows/loginWindow', () => ({ showLoginWindow: vi.fn(), hideLoginWindow: vi.fn() }));
vi.mock('../windows/settingsWindow', () => ({ showSettingsWindow: vi.fn(), hideSettingsWindow: vi.fn() }));
const call = (channel: string, ...args: unknown[]) => state.handlers.get(channel)!(null, ...args);
beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks(); state.handlers.clear(); state.data = {}; state.composeVisible = false;
  state.session = { scope: 'server/alice', generation: 1 };
  const { registerComposeIpc } = await import('../ipc/composeIpc'); registerComposeIpc();
});
it('isolates persisted drafts by account and preserves other drafts on clear', () => {
  const alice = { ...state.session };
  call('compose:save-draft', 'alice draft', alice);
  state.session = { scope: 'server/bob', generation: 2 };
  call('compose:save-draft', 'bob draft', state.session);
  expect(call('compose:get-draft', state.session)).toBe('bob draft');
  call('compose:clear-draft', state.session);
  expect(call('compose:get-draft', state.session)).toBe('');
  state.session = alice;
  expect(call('compose:get-draft', alice)).toBe('alice draft');
});
it.each(['compose:get-draft', 'compose:clear-draft', 'compose:save-draft'])('rejects stale %s operations before touching drafts', channel => {
  const old = { ...state.session }; state.session = { ...old, generation: 2 };
  expect(() => channel === 'compose:save-draft' ? call(channel, 'stale', old) : call(channel, old)).toThrow('切换');
  expect(state.data).toEqual({});
});
it('switches servers by cancelling pending browser login and invalidating credentials first', () => {
  call('settings:save-server', 'https://b.example/');
  expect(state.cancel).toHaveBeenCalledTimes(1); expect(state.logout).toHaveBeenCalledTimes(1);
  expect(state.data.auth).toEqual({ apiUrl: 'https://b.example', username: '' });
  expect(state.data['general.webUrl']).toBe('https://b.example');
  expect(state.emit).toHaveBeenCalledWith('change', { status: 'signedOut' });
});
it('does not invalidate credentials when saving the same normalized server', () => {
  call('settings:save-server', 'https://a.example/');
  expect(state.logout).not.toHaveBeenCalled(); expect(state.cancel).not.toHaveBeenCalled();
});
it('updates persisted pin state and the visible native window together', () => {
  expect(call('compose:get-pinned')).toBe(false);
  call('compose:set-pinned', true); expect(state.data['compose.pinned']).toBe(true); expect(state.pin).toHaveBeenLastCalledWith(true);
  call('compose:set-pinned', false); expect(state.pin).toHaveBeenLastCalledWith(false);
});
it('toggles the existing compose window and forwards placement and resize data', () => {
  call('compose:toggle', 20, 30); expect(state.show).toHaveBeenCalledWith(20, 30);
  state.composeVisible = true; call('compose:toggle'); expect(state.hide).toHaveBeenCalledTimes(1);
  call('compose:resize', 300, 400); expect(state.resize).toHaveBeenCalledWith(300, 400);
});
it('returns no file selections on cancellation and all selections on confirmation', async () => {
  state.dialog.mockResolvedValueOnce({ canceled: true, filePaths: ['must-ignore'] }).mockResolvedValueOnce({ canceled: false, filePaths: ['a.jpg', 'b.jpg'] });
  expect(await call('compose:open-file-dialog')).toEqual([]);
  expect(await call('compose:open-file-dialog')).toEqual(['a.jpg', 'b.jpg']);
});
it('uses private visibility and the default server before preferences are configured', () => {
  expect(call('compose:get-visibility')).toBe('private');
  expect(call('compose:get-api-url')).toBe('https://bbtalk.cone387.top');
  call('compose:set-visibility', 'public'); expect(call('compose:get-visibility')).toBe('public');
});
