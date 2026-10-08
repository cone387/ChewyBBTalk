import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => {
  const authHandlers = new Map<string, Array<(state: unknown) => void>>();
  return {
    handlers: new Map<string, (...args: any[]) => any>(),
    windows: [] as Array<{ webContents: { send: (channel: string, payload: unknown) => void } }>,
    login: vi.fn(), logout: vi.fn(), getAccessToken: vi.fn(), getValidAccessToken: vi.fn(),
    isLoggedIn: vi.fn(), getAuthState: vi.fn(), tryRestore: vi.fn(), browserLogin: vi.fn(), cancelBrowserLogin: vi.fn(),
    authEvents: { on: vi.fn((event: string, handler: (state: unknown) => void) => { authHandlers.set(event, [...(authHandlers.get(event) || []), handler]); }) },
    emitAuth: (value: unknown) => authHandlers.get('change')?.forEach(handler => handler(value)),
  };
});

vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => any) => { state.handlers.set(channel, handler); } },
  BrowserWindow: { getAllWindows: () => state.windows },
}));
vi.mock('../../auth', () => ({
  login: state.login, logout: state.logout, getAccessToken: state.getAccessToken,
  getValidAccessToken: state.getValidAccessToken, isLoggedIn: state.isLoggedIn,
  getAuthState: state.getAuthState, tryRestoreSession: state.tryRestore, authEvents: state.authEvents,
}));
vi.mock('../../browserAuth', () => ({ browserLogin: state.browserLogin, cancelBrowserLogin: state.cancelBrowserLogin }));

const call = (channel: string, ...args: unknown[]) => state.handlers.get(channel)!(null, ...args);

beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks();
  state.handlers.clear(); state.windows = [];
  const { registerAuthIpc } = await import('../authIpc');
  registerAuthIpc();
});

it.each([
  ['auth:browser-login', () => call('auth:browser-login', 'https://server.test'), () => state.browserLogin],
  ['auth:cancel-browser-login', () => call('auth:cancel-browser-login'), () => state.cancelBrowserLogin],
  ['auth:state', () => call('auth:state'), () => state.getAuthState],
  ['auth:restore', () => call('auth:restore'), () => state.tryRestore],
  ['auth:get-access-token', () => call('auth:get-access-token'), () => state.getAccessToken],
  ['auth:get-valid-access-token', () => call('auth:get-valid-access-token'), () => state.getValidAccessToken],
  ['auth:is-logged-in', () => call('auth:is-logged-in'), () => state.isLoggedIn],
])('delegates %s to the auth module', (_name, invoke, target) => {
  invoke();
  expect(target()).toHaveBeenCalledTimes(1);
});

it('forwards credentials through the login handler', () => {
  call('auth:login', 'alice', 'hunter2', 'https://server.test');
  expect(state.login).toHaveBeenCalledWith('alice', 'hunter2', 'https://server.test');
});

it('cancels pending browser logins when logging out', () => {
  call('auth:logout');
  expect(state.cancelBrowserLogin).toHaveBeenCalledTimes(1);
  expect(state.logout).toHaveBeenCalledTimes(1);
});

it('broadcasts auth changes to every open window', () => {
  const first = { webContents: { send: vi.fn() } };
  const second = { webContents: { send: vi.fn() } };
  state.windows = [first, second];
  const broadcast = { status: 'authenticated', username: 'alice' };
  state.emitAuth(broadcast);
  expect(first.webContents.send).toHaveBeenCalledWith('auth:state-changed', broadcast);
  expect(second.webContents.send).toHaveBeenCalledWith('auth:state-changed', broadcast);
});

it('tolerates auth changes with no windows open', () => {
  expect(() => state.emitAuth({ status: 'signed-out' })).not.toThrow();
});
