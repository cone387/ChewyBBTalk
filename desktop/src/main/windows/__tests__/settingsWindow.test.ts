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
vi.mock('../ballWindow', () => ({ suspendBallForWindow: native.suspend }));

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  (native.Window.instances as any).length = 0;
  native.data = {};
  vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

async function load() { return import('../settingsWindow'); }
function current() { return native.Window.instances.at(-1)!; }

it('creates a hidden frameless settings window with an isolated preload', async () => {
  const { showSettingsWindow } = await load();
  showSettingsWindow();
  const win = current();
  expect(win.options).toMatchObject({ width: 420, height: 380, frame: false, transparent: true, resizable: false, show: false, icon: '/fake/icon.png' });
  expect(win.options).not.toHaveProperty('thickFrame');
  expect(win.options).not.toHaveProperty('vibrancy');
  expect(win.options.webPreferences).toMatchObject({ contextIsolation: true, nodeIntegration: false, sandbox: false });
  expect(native.suspend).toHaveBeenCalledWith(win);
  win.emit('ready-to-show');
  expect(win.show).toHaveBeenCalledTimes(1); expect(win.focus).toHaveBeenCalledTimes(1);
});

it('loads the dev server URL during development and the bundle in production', async () => {
  const { showSettingsWindow } = await load();
  vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173');
  showSettingsWindow(); expect(current().loadURL).toHaveBeenCalledWith('http://localhost:5173/settings/index.html');
  current().emit('closed');
  vi.stubEnv('ELECTRON_RENDERER_URL', '');
  showSettingsWindow(); expect(current().loadFile).toHaveBeenCalledWith(expect.stringContaining('settings'));
});

it('focuses the live window instead of creating a second one', async () => {
  const { showSettingsWindow } = await load();
  showSettingsWindow(); showSettingsWindow();
  expect(native.Window.instances).toHaveLength(1);
  expect(current().focus).toHaveBeenCalledTimes(1);
});

it('destroys the window on hide and clears the singleton', async () => {
  const { showSettingsWindow, hideSettingsWindow } = await load();
  showSettingsWindow(); const win = current();
  hideSettingsWindow(); hideSettingsWindow();
  expect(win.destroy).toHaveBeenCalledTimes(1);
  showSettingsWindow();
  expect(native.Window.instances).toHaveLength(2);
  expect(native.Window.instances[0]).not.toBe(native.Window.instances[1]);
});

it('keeps tracking positions across window lifecycles with saved state per kind', async () => {
  native.data.windows = { settings: { x: 9, y: 9 } };
  const { showSettingsWindow } = await load();
  showSettingsWindow(); const win = current();
  win.emit('will-move');
  (win as any).getBounds = () => ({ x: 40, y: 50, width: 420, height: 380 });
  win.emit('moved');
  expect(native.data.windows).toEqual({ settings: { x: 40, y: 50 } });
});
