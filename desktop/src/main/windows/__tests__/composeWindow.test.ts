import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => {
  class Window {
    static instances: Array<InstanceType<typeof Window>> = [];
    handlers = new Map<string, Array<(...args: any[]) => void>>();
    options: any;
    visible = false;
    destroyed = false;
    bounds = { x: 0, y: 0, width: 440, height: 160 };
    webContents = { send: vi.fn(), on: vi.fn(), focus: vi.fn() };
    show = vi.fn(() => { this.visible = true; }); hide = vi.fn(() => { this.visible = false; });
    focus = vi.fn(); destroy = vi.fn(() => { this.destroyed = true; this.visible = false; });
    setBounds = vi.fn((next: any) => { this.bounds = { ...this.bounds, ...next }; });
    loadURL = vi.fn(); loadFile = vi.fn();
    getBounds = function (this: any) { return { ...this.bounds }; };
    isDestroyed = () => this.destroyed; isVisible = () => this.visible;
    constructor(options?: any) { this.options = options; Window.instances.push(this); }
    on(event: string, callback: (...args: any[]) => void) { this.handlers.set(event, [...(this.handlers.get(event) || []), callback]); return this; }
    once(event: string, callback: (...args: any[]) => void) {
      const listener = (...args: any[]) => { this.handlers.set(event, this.handlers.get(event)!.filter(fn => fn !== listener)); callback(...args); };
      return this.on(event, listener);
    }
    emit(event: string, ...args: any[]) { this.handlers.get(event)?.slice().forEach(callback => callback(...args)); }
  }
  const ipcHandlers = new Map<string, Array<(...args: any[]) => void>>();
  return {
    Window, ipcHandlers,
    suspend: vi.fn(),
    icon: vi.fn(() => '/fake/icon.png'),
    dialog: vi.fn(),
    data: {} as Record<string, any>,
    workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    cursor: { x: 100, y: 100 },
    on: vi.fn((channel: string, listener: (...args: any[]) => void) => { ipcHandlers.set(channel, [...(ipcHandlers.get(channel) || []), listener]); }),
    off: vi.fn((channel: string, listener: (...args: any[]) => void) => { ipcHandlers.set(channel, (ipcHandlers.get(channel) || []).filter(fn => fn !== listener)); }),
    ipcEmit: (channel: string, ...args: any[]) => { ipcHandlers.get(channel)?.slice().forEach(listener => listener(...args)); },
  };
});

vi.mock('electron', () => ({
  BrowserWindow: native.Window,
  ipcMain: { on: native.on, off: native.off },
  dialog: { showMessageBox: native.dialog },
  screen: {
    getDisplayMatching: () => ({ workArea: native.workArea }),
    getDisplayNearestPoint: () => ({ workArea: native.workArea }),
    getCursorScreenPoint: () => native.cursor,
  },
}));
vi.mock('../../store', () => ({ store: { get: (key: string) => native.data[key], set: (key: string, value: any) => { native.data[key] = structuredClone(value); } } }));
vi.mock('../../icons', () => ({ appIconPath: native.icon }));
vi.mock('../ballWindow', () => ({ suspendBallForWindow: native.suspend }));

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  (native.Window.instances as any).length = 0;
  native.ipcHandlers.clear();
  native.data = {};
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); });

async function load() { return import('../composeWindow'); }
function current() { return native.Window.instances.at(-1)!; }
function closeIdOf(win: InstanceType<typeof native.Window>) {
  const call = (win.webContents.send as ReturnType<typeof vi.fn>).mock.calls.find((args: any[]) => args[0] === 'compose:before-close');
  return call?.[1] as string;
}

it('creates a hidden frameless editor pinned according to stored preferences', async () => {
  native.data['compose.pinned'] = true;
  const { showComposeWindow, getComposeWindow } = await load();
  showComposeWindow();
  const win = current();
  expect(win.options).toMatchObject({ width: 440, height: 160, minHeight: 160, maxHeight: 500, frame: false, transparent: true, resizable: false, alwaysOnTop: true, show: false, backgroundColor: '#00000000', thickFrame: false });
  expect(win.options.webPreferences).toMatchObject({ contextIsolation: true, nodeIntegration: false, sandbox: false });
  expect(native.suspend).toHaveBeenCalledWith(win);
  expect(getComposeWindow()).toBe(win);
});

it('loads the dev server URL during development and the bundle in production', async () => {
  const { showComposeWindow } = await load();
  vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173');
  showComposeWindow(); expect(current().loadURL).toHaveBeenCalledWith('http://localhost:5173/compose/index.html');
  current().emit('closed');
  vi.stubEnv('ELECTRON_RENDERER_URL', '');
  showComposeWindow(); expect(current().loadFile).toHaveBeenCalledWith(expect.stringContaining('compose'));
});

it('reuses the live editor and refocuses its input', async () => {
  const { showComposeWindow } = await load();
  showComposeWindow(); const win = current();
  win.emit('ready-to-show');
  (win.webContents.send as ReturnType<typeof vi.fn>).mockClear();
  showComposeWindow();
  expect(native.Window.instances).toHaveLength(1);
  expect(win.show).toHaveBeenCalledTimes(2); expect(win.focus).toHaveBeenCalledTimes(2);
  expect(win.webContents.send).toHaveBeenCalledWith('compose:focus-input');
});

it('shows and focuses the editor when it is ready to display', async () => {
  const { showComposeWindow } = await load();
  showComposeWindow(); const win = current();
  win.emit('ready-to-show');
  expect(win.show).toHaveBeenCalledTimes(1); expect(win.focus).toHaveBeenCalledTimes(1);
  expect(win.webContents.send).toHaveBeenCalledWith('compose:focus-input');
});

it('destroys the editor after the renderer acknowledges the close flush', async () => {
  const { showComposeWindow, hideComposeWindow, getComposeWindow } = await load();
  showComposeWindow(); const win = current();
  hideComposeWindow();
  const id = closeIdOf(win);
  expect(id).toBeTruthy();
  expect(win.destroy).not.toHaveBeenCalled();
  expect(getComposeWindow()).toBe(win);
  native.ipcEmit('compose:close-ready', { sender: {} }, id);
  expect(win.destroy).not.toHaveBeenCalled();
  native.ipcEmit('compose:close-ready', { sender: win.webContents }, 'wrong-id');
  expect(win.destroy).not.toHaveBeenCalled();
  native.ipcEmit('compose:close-ready', { sender: win.webContents }, id);
  expect(win.destroy).toHaveBeenCalledTimes(1);
  win.emit('closed');
  expect(getComposeWindow()).toBeNull();
  expect(native.off).toHaveBeenCalledWith('compose:close-ready', expect.any(Function));
  expect(native.off).toHaveBeenCalledWith('compose:close-error', expect.any(Function));
});

it('shows a recovery dialog when the flush fails and keeps the editor open', async () => {
  const { showComposeWindow, hideComposeWindow } = await load();
  showComposeWindow(); const win = current();
  hideComposeWindow();
  const id = closeIdOf(win);
  native.ipcEmit('compose:close-error', { sender: win.webContents }, id, 'disk full');
  expect(win.destroy).not.toHaveBeenCalled();
  expect(native.dialog).toHaveBeenCalledWith(win, { type: 'error', message: '草稿尚未保存，窗口保持打开', detail: 'disk full' });
  expect(native.off).toHaveBeenCalledWith('compose:close-ready', expect.any(Function));
});

it('ignores close errors from other windows or stale ids', async () => {
  const { showComposeWindow, hideComposeWindow } = await load();
  showComposeWindow(); const win = current();
  hideComposeWindow();
  const id = closeIdOf(win);
  native.ipcEmit('compose:close-error', { sender: {} }, id, 'nope');
  native.ipcEmit('compose:close-error', { sender: win.webContents }, 'stale', 'nope');
  expect(native.dialog).not.toHaveBeenCalled();
  expect(native.off).not.toHaveBeenCalled();
});

it('falls back to a timeout warning when the renderer never acknowledges', async () => {
  vi.useFakeTimers();
  const { showComposeWindow, hideComposeWindow } = await load();
  showComposeWindow(); const win = current();
  hideComposeWindow();
  vi.advanceTimersByTime(15_000);
  expect(native.dialog).toHaveBeenCalledWith(win, { type: 'warning', message: '编辑器仍在保存，请稍后关闭。' });
  expect(win.destroy).not.toHaveBeenCalled();
});

it('close events trigger a save-flush instead of destroying the window directly', async () => {
  const { showComposeWindow } = await load();
  showComposeWindow(); const win = current();
  const event = { preventDefault: vi.fn() };
  win.emit('close', event);
  expect(event.preventDefault).toHaveBeenCalledTimes(1);
  expect(closeIdOf(win)).toBeTruthy();
});

it('re-arms the handshake after a completed close', async () => {
  const { showComposeWindow, hideComposeWindow } = await load();
  showComposeWindow(); const first = current();
  hideComposeWindow();
  native.ipcEmit('compose:close-ready', { sender: first.webContents }, closeIdOf(first));
  first.emit('closed');
  showComposeWindow(); const second = current();
  hideComposeWindow();
  expect(closeIdOf(second)).toBeTruthy();
  expect(second.destroy).not.toHaveBeenCalled();
  native.ipcEmit('compose:close-ready', { sender: second.webContents }, closeIdOf(second));
  expect(second.destroy).toHaveBeenCalledTimes(1);
});

it('skips the handshake entirely while one is already running', async () => {
  const { showComposeWindow, hideComposeWindow } = await load();
  showComposeWindow(); const win = current();
  hideComposeWindow();
  (win.webContents.send as ReturnType<typeof vi.fn>).mockClear();
  hideComposeWindow();
  expect(win.webContents.send).not.toHaveBeenCalled();
});

it.each([
  [null, false], ['destroyed', false], ['hidden', false], ['visible', true],
] as const)('reports visibility=%s correctly for %s', async (mode, expected) => {
  const { showComposeWindow, isComposeVisible } = await load();
  if (mode !== null) {
    showComposeWindow(); const win = current();
    if (mode === 'destroyed') win.destroyed = true;
    if (mode === 'visible') win.visible = true;
  }
  expect(isComposeVisible()).toBe(expected);
});

it('resize clamps the height into range and centers fresh windows', async () => {
    const { showComposeWindow, resizeComposeWindow } = await load();
    showComposeWindow(); const win = current();
    win.bounds = { x: 0, y: 0, width: 440, height: 160 };
    resizeComposeWindow(440, 999);
    expect(win.bounds).toEqual({ x: Math.round((1920 - 440) / 2), y: Math.round((1080 - 500) / 2), width: 440, height: 500 });
    resizeComposeWindow(440, 20);
    expect(win.bounds).toMatchObject({ height: 160 });
  });

  it('keeps the current origin once the user has positioned the window', async () => {
    native.data.windows = { compose: { x: 10, y: 20 } };
    const { showComposeWindow, resizeComposeWindow } = await load();
    showComposeWindow(); const win = current();
    win.bounds = { x: 10, y: 20, width: 440, height: 160 };
    resizeComposeWindow(440, 300);
    expect(win.bounds).toMatchObject({ x: 10, y: 20, width: 440, height: 300 });
  });

  it('does not rewrite bounds that already match the target', async () => {
    const { showComposeWindow, resizeComposeWindow } = await load();
    showComposeWindow(); const win = current();
    win.bounds = { x: Math.round((1920 - 440) / 2), y: Math.round((1080 - 240) / 2), width: 440, height: 240 };
    resizeComposeWindow(440, 240);
    expect(win.setBounds).not.toHaveBeenCalled();
  });

  it('ignores resizes without a live window or finite dimensions', async () => {
    const { showComposeWindow, resizeComposeWindow, getComposeWindow } = await load();
    resizeComposeWindow(440, 300);
    expect(getComposeWindow()).toBeNull();
    showComposeWindow(); const win = current();
    win.setBounds.mockClear();
    resizeComposeWindow(Number.NaN, 300);
    resizeComposeWindow(440, Number.POSITIVE_INFINITY);
    win.destroyed = true;
    resizeComposeWindow(440, 300);
    expect(win.setBounds).not.toHaveBeenCalled();
  });

  it('caps the window to small work areas', async () => {
    native.workArea = { x: 0, y: 0, width: 300, height: 200 };
    const { showComposeWindow, resizeComposeWindow } = await load();
    showComposeWindow(); const win = current();
    win.bounds = { x: 0, y: 0, width: 300, height: 160 };
    resizeComposeWindow(440, 500);
    expect(win.bounds).toEqual({ x: 0, y: 0, width: 300, height: 200 });
  });
