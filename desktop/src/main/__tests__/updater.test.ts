import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

const mocks = vi.hoisted(() => ({
  packaged: true,
  handlers: new Map<string, Function>(),
  send: vi.fn(), check: vi.fn(), download: vi.fn(), install: vi.fn(), hide: vi.fn(),
  compose: null as any,
}));
let events: EventEmitter;
vi.mock('electron-updater', () => ({ default: { get autoUpdater() {
  return Object.assign(events, { checkForUpdates: mocks.check, downloadUpdate: mocks.download, quitAndInstall: mocks.install });
} } }));
vi.mock('electron', () => ({
  app: { get isPackaged() { return mocks.packaged; }, once: vi.fn() },
  BrowserWindow: { getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: mocks.send } }] },
  ipcMain: { handle: (name: string, handler: Function) => mocks.handlers.set(name, handler) },
  Notification: { isSupported: () => false },
}));
vi.mock('../windows/composeWindow', () => ({ getComposeWindow: () => mocks.compose, hideComposeWindow: () => mocks.hide() }));
vi.mock('../windows/settingsWindow', () => ({ showSettingsWindow: vi.fn() }));

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); vi.useFakeTimers();
  events = new EventEmitter(); mocks.packaged = true; mocks.compose = null;
  mocks.check.mockResolvedValue(null); mocks.download.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());
async function setup() { const module = await import('../updater'); module.registerUpdater(); return module; }

it('checks after startup and periodically, without installing on ordinary quit', async () => {
  await setup();
  expect((events as any).autoInstallOnAppQuit).toBe(false);
  expect((events as any).allowDowngrade).toBe(false);
  await vi.advanceTimersByTimeAsync(15_000);
  expect(mocks.check).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
  expect(mocks.check).toHaveBeenCalledTimes(2);
});
it('deduplicates checks, automatically downloads and broadcasts progress/readiness', async () => {
  const update = await setup();
  let finish!: () => void;
  mocks.check.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  const first = update.checkForUpdate(); const second = update.checkForUpdate();
  await Promise.resolve(); expect(mocks.check).toHaveBeenCalledTimes(1);
  events.emit('update-available', { version: '0.3.0' });
  await Promise.resolve(); expect(mocks.download).toHaveBeenCalledTimes(1);
  events.emit('download-progress', { percent: 34.5 });
  expect(update.getUpdateState()).toEqual({ status: 'downloading', version: '0.3.0', percent: 34.5 });
  events.emit('update-downloaded', { version: '0.3.0' }); finish(); await Promise.all([first, second]);
  expect(update.getUpdateState().status).toBe('downloaded');
  await update.checkForUpdate(); expect(mocks.check).toHaveBeenCalledTimes(1);
  expect(mocks.send).toHaveBeenCalledWith('updates:changed', { status: 'downloaded', version: '0.3.0' });
});
it('reports network failure and supports retry instead of claiming the app is current', async () => {
  const update = await setup(); mocks.check.mockRejectedValueOnce(new Error('offline'));
  await update.checkForUpdate(); expect(update.getUpdateState().status).toBe('error');
  mocks.check.mockImplementationOnce(async () => { events.emit('update-not-available'); });
  await update.checkForUpdate(); expect(update.getUpdateState().status).toBe('current');
});
it('identifies an unpublished feed even when updater both emits and rejects the error', async () => {
  const update = await setup();
  mocks.check.mockImplementationOnce(async () => { const error = new Error('Cannot find latest.yml: HTTP 404'); events.emit('error', error); throw error; });
  await update.checkForUpdate();
  expect(update.getUpdateState().status).toBe('unpublished');
  expect(update.getUpdateState().message).toContain('尚未发布');
});
it('waits for draft save and ignores duplicate install requests', async () => {
  const update = await setup();
  mocks.compose = Object.assign(new EventEmitter(), { isDestroyed: () => false });
  events.emit('update-downloaded', { version: '0.3.0' });
  const pending = update.installUpdate();
  await update.installUpdate();
  expect(mocks.install).not.toHaveBeenCalled(); expect(mocks.hide).toHaveBeenCalledTimes(1);
  mocks.compose.emit('closed'); await pending;
  expect(mocks.install).toHaveBeenCalledTimes(1);
  expect(mocks.install).toHaveBeenCalledWith(false, true);
});
it('keeps a downloaded update available when saving times out, with no delayed installation', async () => {
  const update = await setup();
  mocks.compose = Object.assign(new EventEmitter(), { isDestroyed: () => false });
  events.emit('update-downloaded', { version: '0.3.0' });
  const pending = update.installUpdate(); await vi.advanceTimersByTimeAsync(16_000); await pending;
  expect(update.getUpdateState().status).toBe('downloaded');
  expect(update.getUpdateState().message).toContain('草稿');
  mocks.compose.emit('closed'); expect(mocks.install).not.toHaveBeenCalled();
});
it('development builds never query the production feed or install', async () => {
  mocks.packaged = false; const update = await setup();
  await update.checkForUpdate(); await update.installUpdate();
  await vi.advanceTimersByTimeAsync(7 * 60 * 60 * 1000);
  expect(update.getUpdateState().status).toBe('unsupported');
  expect(mocks.check).not.toHaveBeenCalled(); expect(mocks.install).not.toHaveBeenCalled();
});
