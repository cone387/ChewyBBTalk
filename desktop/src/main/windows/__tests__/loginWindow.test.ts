import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => {
  class Window {
    static instances: Array<InstanceType<typeof Window>> = [];
    handlers = new Map<string, Array<(...args: any[]) => void>>();
    options: any;
    visible = false;
    destroyed = false;
    webContents = { send: vi.fn(), on: vi.fn(), focus: vi.fn() };
    show = vi.fn(() => { this.visible = true; }); hide = vi.fn(() => { this.visible = false; });
    focus = vi.fn(); destroy = vi.fn(() => { this.destroyed = true; this.visible = false; });
    loadURL = vi.fn(); loadFile = vi.fn();
    isDestroyed = () => this.destroyed; isVisible = () => this.visible;
    constructor(options?: any) { this.options = options; Window.instances.push(this); }
    on(event: string, callback: (...args: any[]) => void) { this.handlers.set(event, [...(this.handlers.get(event) || []), callback]); return this; }
    once(event: string, callback: (...args: any[]) => void) {
      const listener = (...args: any[]) => { this.handlers.set(event, this.handlers.get(event)!.filter(fn => fn !== listener)); callback(...args); };
      return this.on(event, listener);
    }
    emit(event: string, ...args: any[]) { this.handlers.get(event)?.slice().forEach(callback => callback(...args)); }
  }
  return {
    Window,
    cancel: vi.fn(),
    suspend: vi.fn(),
    icon: vi.fn(() => '/fake/icon.png'),
    data: {} as Record<string, any>,
    workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    cursor: { x: 100, y: 100 },
  };
});

vi.mock('electron', () => ({
  BrowserWindow: native.Window,
  screen: {
    getDisplayMatching: () => ({ workArea: native.workArea }),
    getDisplayNearestPoint: () => ({ workArea: native.workArea }),
    getCursorScreenPoint: () => native.cursor,
  },
}));
vi.mock('../../store', () => ({ store: { get: (key: string) => native.data[key], set: (key: string, value: any) => { native.data[key] = structuredClone(value); } } }));
vi.mock('../../icons', () => ({ appIconPath: native.icon }));
vi.mock('../../browserAuth', () => ({ cancelBrowserLogin: native.cancel }));
vi.mock('../ballWindow', () => ({ suspendBallForWindow: native.suspend }));

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  (native.Window.instances as any).length = 0;
  native.data = {};
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

async function load() { return import('../loginWindow'); }
function current() { return native.Window.instances.at(-1)!; }

it('creates a hidden frameless login window that shows once ready', async () => {
  const { showLoginWindow } = await load();
  showLoginWindow();
  const win = current();
  expect(win.options).toMatchObject({ width: 340, height: 510, frame: false, transparent: true, resizable: false, show: false, thickFrame: false, icon: '/fake/icon.png' });
  expect(win.options.webPreferences).toMatchObject({ contextIsolation: true, nodeIntegration: false, sandbox: false });
  expect(win.options.webPreferences.preload).toContain('preload');
  expect(native.suspend).toHaveBeenCalledWith(win);
  win.emit('ready-to-show');
  expect(win.show).toHaveBeenCalledTimes(1); expect(win.focus).toHaveBeenCalledTimes(1);
});

it('centers the window when no position was saved yet', async () => {
  const { showLoginWindow } = await load();
  showLoginWindow();
  expect(current().options).toMatchObject({ x: Math.round((1920 - 340) / 2), y: Math.round((1080 - 510) / 2) });
});

it('reuses the saved position clamped into the display work area', async () => {
  native.data.windows = { login: { x: 5000, y: 20 } };
  const { showLoginWindow } = await load();
  showLoginWindow();
  expect(current().options).toMatchObject({ x: 1920 - 340, y: 20 });
});

it('loads the dev server URL during development and the bundle in production', async () => {
  const { showLoginWindow } = await load();
  vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173');
  showLoginWindow(); expect(current().loadURL).toHaveBeenCalledWith('http://localhost:5173/login/index.html');
  current().emit('closed');
  vi.stubEnv('ELECTRON_RENDERER_URL', '');
  showLoginWindow(); expect(current().loadFile).toHaveBeenCalledWith(expect.stringContaining('login'));
});

it('focuses the existing window instead of creating a second one', async () => {
  const { showLoginWindow } = await load();
  showLoginWindow(); showLoginWindow();
  expect(native.Window.instances).toHaveLength(1);
  expect(current().focus).toHaveBeenCalledTimes(1);
});

it('cancels pending browser login when the window closes and recreates afterwards', async () => {
  const { showLoginWindow } = await load();
  showLoginWindow(); const first = current();
  first.emit('closed');
  expect(native.cancel).toHaveBeenCalledTimes(1);
  showLoginWindow();
  expect(native.Window.instances).toHaveLength(2);
});

it('destroys the window on hide and tolerates repeated hides', async () => {
  const { showLoginWindow, hideLoginWindow } = await load();
  showLoginWindow(); const win = current();
  hideLoginWindow(); hideLoginWindow();
  expect(win.destroy).toHaveBeenCalledTimes(1);
  showLoginWindow();
  expect(native.Window.instances).toHaveLength(2);
});

it('persists the login window position only after the user moves it', async () => {
  native.data.windows = { compose: { x: 1, y: 2 } };
  const { showLoginWindow } = await load();
  showLoginWindow(); const win = current();
  win.emit('moved');
  expect(native.data.windows).toEqual({ compose: { x: 1, y: 2 } });
  win.emit('will-move');
  (win as any).getBounds = () => ({ x: 30, y: 40, width: 340, height: 510 });
  win.emit('moved');
  expect(native.data.windows).toMatchObject({ login: { x: 30, y: 40 }, compose: { x: 1, y: 2 } });
});

it('skips saving the position for a destroyed window', async () => {
  native.data.windows = { login: { x: 1, y: 2 } };
  const { showLoginWindow } = await load();
  showLoginWindow(); const win = current();
  win.emit('will-move'); win.destroyed = true;
  (win as any).getBounds = () => ({ x: 55, y: 66, width: 340, height: 510 });
  win.emit('moved');
  expect(native.data.windows).toEqual({ login: { x: 1, y: 2 } });
});
