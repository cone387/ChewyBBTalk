import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  handlers: new Map<string, Array<(...args: any[]) => void>>(),
  ready: { resolve: (_?: unknown) => {} } as { resolve: (value?: unknown) => void },
  lock: true,
  quit: vi.fn(),
  setAppUserModelId: vi.fn(),
  windows: [] as unknown[],
  powerHandlers: new Map<string, Array<() => void>>(),
  createBall: vi.fn(), registerBall: vi.fn(), registerCompose: vi.fn(), registerAuth: vi.fn(),
  registerUpdater: vi.fn(), registerWatchers: vi.fn(), registerHotkeys: vi.fn(), unregisterHotkeys: vi.fn(),
  createTray: vi.fn(), tryRestore: vi.fn(() => Promise.resolve(true)), cancelBrowser: vi.fn(),
  setupCsp: vi.fn(), compose: null as any, hideCompose: vi.fn(),
}));

vi.mock('electron', () => ({
  app: {
    requestSingleInstanceLock: () => state.lock,
    quit: state.quit,
    setAppUserModelId: state.setAppUserModelId,
    whenReady: () => new Promise(resolve => { state.ready.resolve = resolve; }),
    on: (event: string, handler: (...args: any[]) => void) => { state.handlers.set(event, [...(state.handlers.get(event) || []), handler]); },
    _isQuitting: false,
  },
  BrowserWindow: { getAllWindows: () => state.windows },
  powerMonitor: { on: (event: string, handler: () => void) => { state.powerHandlers.set(event, [...(state.powerHandlers.get(event) || []), handler]); } },
}));
vi.mock('../windows/ballWindow', () => ({ createBallWindow: state.createBall }));
vi.mock('../ipc/ballIpc', () => ({ registerBallIpc: state.registerBall, registerDisplayWatchers: state.registerWatchers }));
vi.mock('../ipc/composeIpc', () => ({ registerComposeIpc: state.registerCompose }));
vi.mock('../ipc/authIpc', () => ({ registerAuthIpc: state.registerAuth }));
vi.mock('../auth', () => ({ tryRestoreSession: state.tryRestore }));
vi.mock('../tray', () => ({ createTray: state.createTray }));
vi.mock('../hotkey', () => ({ registerHotkeys: state.registerHotkeys, unregisterHotkeys: state.unregisterHotkeys }));
vi.mock('../windows/composeWindow', () => ({ getComposeWindow: () => state.compose, hideComposeWindow: state.hideCompose }));
vi.mock('../browserAuth', () => ({ cancelBrowserLogin: state.cancelBrowser }));
vi.mock('../security', () => ({ setupCsp: state.setupCsp }));
vi.mock('../updater', () => ({ registerUpdater: state.registerUpdater }));

const emit = (event: string, ...args: unknown[]) => state.handlers.get(event)?.slice().forEach(handler => handler(...args));

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  state.handlers.clear(); state.powerHandlers.clear(); state.windows = [];
  state.lock = true; state.compose = null;
  state.tryRestore.mockImplementation(() => Promise.resolve(true));
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.spyOn(process, 'platform', 'get').mockRestore(); });

async function boot() {
  await import('../index');
  await Promise.resolve();
  await Promise.resolve();
}

it('quits immediately when another instance owns the single-instance lock', async () => {
  state.lock = false;
  await boot();
  expect(state.quit).toHaveBeenCalledTimes(1);
  expect(state.createBall).not.toHaveBeenCalled();
});

it('wires up every subsystem once the app is ready', async () => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
  await boot();
  expect(state.quit).not.toHaveBeenCalled();
  state.ready.resolve(undefined);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  expect(state.setAppUserModelId).toHaveBeenCalledWith('com.chewybbtalk.desktop');
  expect(state.setupCsp).toHaveBeenCalledTimes(1);
  expect(state.registerBall).toHaveBeenCalledTimes(1);
  expect(state.registerCompose).toHaveBeenCalledTimes(1);
  expect(state.registerAuth).toHaveBeenCalledTimes(1);
  expect(state.registerUpdater).toHaveBeenCalledTimes(1);
  expect(state.registerWatchers).toHaveBeenCalledTimes(1);
  expect(state.registerHotkeys).toHaveBeenCalledTimes(1);
  expect(state.createTray).toHaveBeenCalledTimes(1);
  expect(state.createBall).toHaveBeenCalledTimes(1);
  expect(state.tryRestore).toHaveBeenCalledTimes(1);
  expect(console.log).toHaveBeenCalledWith('[Auth] session restore:', 'success');
});

it('skips the windows app id on other platforms and logs missing sessions', async () => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
  state.tryRestore.mockImplementation(() => Promise.resolve(false));
  await boot();
  state.ready.resolve(undefined);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  expect(state.setAppUserModelId).not.toHaveBeenCalled();
  expect(console.log).toHaveBeenCalledWith('[Auth] session restore:', 'no saved session');
});

it('re-arms session restore after the system wakes up', async () => {
  await boot();
  state.ready.resolve(undefined);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  state.powerHandlers.get('resume')![0]();
  expect(state.tryRestore).toHaveBeenCalledTimes(2);
});

it('recreates the overlay on activate only when no windows remain', async () => {
  await boot();
  state.ready.resolve(undefined);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  expect(state.createBall).toHaveBeenCalledTimes(1);
  state.windows = [{ id: 1 }];
  emit('activate');
  expect(state.createBall).toHaveBeenCalledTimes(1);
  state.windows = [];
  emit('activate');
  expect(state.createBall).toHaveBeenCalledTimes(2);
});

it('flushes the compose editor before quitting', async () => {
  await boot();
  const event = { preventDefault: vi.fn() };
  const closedHandlers: Array<() => void> = [];
  state.compose = { isDestroyed: () => false, once: (_: string, cb: () => void) => { closedHandlers.push(cb); } };
  emit('before-quit', event);
  const electron = await import('electron');
  expect((electron.app as any)._isQuitting).toBe(true);
  expect(state.cancelBrowser).toHaveBeenCalledTimes(1);
  expect(event.preventDefault).toHaveBeenCalledTimes(1);
  expect(state.hideCompose).toHaveBeenCalledTimes(1);
  expect(state.quit).not.toHaveBeenCalled();
  closedHandlers.forEach(cb => cb());
  expect(state.quit).toHaveBeenCalledTimes(1);
});

it('quits directly when no compose editor needs flushing', async () => {
  await boot();
  const event = { preventDefault: vi.fn() };
  emit('before-quit', event);
  expect(event.preventDefault).not.toHaveBeenCalled();
  expect(state.hideCompose).not.toHaveBeenCalled();
  state.compose = { isDestroyed: () => true };
  emit('before-quit', event);
  expect(event.preventDefault).not.toHaveBeenCalled();
});

it('unregisters hotkeys when the app is about to quit', async () => {
  await boot();
  emit('will-quit');
  expect(state.unregisterHotkeys).toHaveBeenCalledTimes(1);
  expect(state.handlers.has('window-all-closed')).toBe(true);
});
