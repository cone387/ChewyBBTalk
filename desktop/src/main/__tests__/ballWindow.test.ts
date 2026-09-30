import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => {
  class Window {
    handlers = new Map<string, Array<(...args: any[]) => void>>();
    options: any;
    visible = false;
    destroyed = false;
    webContents = { send: vi.fn(), on: vi.fn() };
    setIgnoreMouseEvents = vi.fn(); setOpacity = vi.fn(); setBounds = vi.fn();
    setAlwaysOnTop = vi.fn(); setVisibleOnAllWorkspaces = vi.fn(); loadURL = vi.fn(); loadFile = vi.fn();
    showInactive = vi.fn(() => { this.visible = true; }); hide = vi.fn(() => { this.visible = false; });
    isVisible = () => this.visible; isDestroyed = () => this.destroyed;
    constructor(options?: any) { this.options = options; }
    on(event: string, callback: (...args: any[]) => void) { this.handlers.set(event, [...(this.handlers.get(event) || []), callback]); return this; }
    once(event: string, callback: (...args: any[]) => void) {
      const listener = (...args: any[]) => { this.handlers.set(event, this.handlers.get(event)!.filter(fn => fn !== listener)); callback(...args); };
      return this.on(event, listener);
    }
    emit(event: string, ...args: any[]) { this.handlers.get(event)?.slice().forEach(callback => callback(...args)); }
  }
  return { Window, quitting: false, displays: [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }] };
});
vi.mock('electron', () => ({ BrowserWindow: native.Window, app: { get _isQuitting() { return native.quitting; } }, screen: { getAllDisplays: () => native.displays } }));
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); native.quitting = false;
  native.displays = [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }];
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
async function setup() {
  const ball = await import('../windows/ballWindow'); const overlay = ball.createBallWindow() as unknown as InstanceType<typeof native.Window>;
  return { ball, overlay, editor: new native.Window() };
}
it('creates a transparent nonfocusable overlay with explicit mouse passthrough', async () => {
  const { ball, overlay } = await setup();
  expect(overlay.options).toMatchObject({ x: 0, y: 0, width: 1920, height: 1080, transparent: true, focusable: false, movable: false, show: false });
  expect(overlay.setIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true });
  expect(overlay.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver');
  overlay.emit('ready-to-show'); expect(overlay.showInactive).toHaveBeenCalledTimes(1); expect(ball.getBallWindow()).toBe(overlay);
  overlay.emit('closed'); expect(ball.getBallWindow()).toBeNull();
});
it('loads the renderer URL during development', async () => {
  vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173'); const { overlay } = await setup();
  expect(overlay.loadURL).toHaveBeenCalledWith('http://localhost:5173/ball/index.html'); expect(overlay.loadFile).not.toHaveBeenCalled();
});
it('loads the bundled renderer in production', async () => {
  vi.stubEnv('ELECTRON_RENDERER_URL', ''); const { overlay } = await setup();
  expect(overlay.loadFile).toHaveBeenCalledWith(expect.stringContaining('renderer')); expect(overlay.loadURL).not.toHaveBeenCalled();
});
it('covers displays left of and above the primary screen', async () => {
  native.displays = [{ workArea: { x: -1280, y: -200, width: 1280, height: 800 } }, { workArea: { x: 0, y: 0, width: 1920, height: 1080 } }];
  const { ball, overlay } = await setup(); expect(ball.computeOverlayBounds()).toEqual({ x: -1280, y: -200, width: 3200, height: 1280 });
  expect(overlay.options).toMatchObject(ball.computeOverlayBounds());
});
it('updates bounds after display changes and does nothing without a live overlay', async () => {
  const { ball, overlay } = await setup(); native.displays = [{ workArea: { x: 100, y: 20, width: 800, height: 600 } }];
  expect(ball.resizeOverlayToDisplays()).toEqual({ x: 100, y: 20, width: 800, height: 600 }); expect(overlay.setBounds).toHaveBeenCalledWith(ball.computeOverlayBounds());
  overlay.destroyed = true; expect(ball.resizeOverlayToDisplays()).toBeNull(); overlay.emit('closed'); expect(ball.resizeOverlayToDisplays()).toBeNull();
});
it.each(['win32', 'darwin', 'linux'] as const)('suspends the surface and restores passthrough on %s', async platform => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue(platform); const { ball, overlay, editor } = await setup(); overlay.visible = true;
  ball.suspendBallForWindow(editor as any); expect(ball.isBallSuspended()).toBe(true);
  expect(overlay.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: false }); expect(overlay.webContents.send).toHaveBeenLastCalledWith('ball:suspension-changed', true);
  if (platform === 'linux') expect(overlay.hide).toHaveBeenCalledTimes(1); else { expect(overlay.setOpacity).toHaveBeenLastCalledWith(0); expect(overlay.hide).not.toHaveBeenCalled(); }
  ball.setBallMousePassthrough(false); expect(overlay.setIgnoreMouseEvents).toHaveBeenCalledTimes(2);
  editor.emit('closed'); expect(ball.isBallSuspended()).toBe(false); expect(overlay.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, { forward: false });
  expect(overlay.webContents.send).toHaveBeenLastCalledWith('ball:suspension-changed', false);
  expect(overlay.showInactive).toHaveBeenCalledTimes(platform === 'linux' ? 1 : 0);
});
it('keeps the overlay suspended until every foreground window closes', async () => {
  const { ball, overlay, editor } = await setup(); const second = new native.Window(); ball.suspendBallForWindow(editor as any); ball.suspendBallForWindow(second as any);
  overlay.webContents.send.mockClear(); editor.emit('closed'); expect(ball.isBallSuspended()).toBe(true); expect(overlay.webContents.send).not.toHaveBeenCalled();
  second.emit('closed'); expect(ball.isBallSuspended()).toBe(false); expect(overlay.webContents.send).toHaveBeenCalledWith('ball:suspension-changed', false);
});
it('resumes on minimize and suspends again on restore', async () => {
  const { ball, overlay, editor } = await setup(); ball.suspendBallForWindow(editor as any); editor.emit('minimize'); expect(ball.isBallSuspended()).toBe(false);
  editor.emit('restore'); expect(ball.isBallSuspended()).toBe(true); expect(overlay.webContents.send).toHaveBeenLastCalledWith('ball:suspension-changed', true);
  editor.emit('closed'); expect(ball.isBallSuspended()).toBe(false);
});
it('does not show an overlay that becomes ready while an editor is active', async () => {
  const { ball, overlay, editor } = await setup(); ball.suspendBallForWindow(editor as any); overlay.emit('ready-to-show'); expect(overlay.showInactive).not.toHaveBeenCalled();
  editor.emit('closed'); expect(overlay.showInactive).toHaveBeenCalledTimes(1);
});
it.each(['quitting', 'destroyed', 'closed'])('does not restore an unusable overlay: %s', async reason => {
  const { ball, overlay, editor } = await setup(); ball.suspendBallForWindow(editor as any); overlay.showInactive.mockClear();
  if (reason === 'quitting') native.quitting = true; if (reason === 'destroyed') overlay.destroyed = true; if (reason === 'closed') overlay.emit('closed');
  editor.emit('closed'); expect(ball.isBallSuspended()).toBe(false); expect(overlay.showInactive).not.toHaveBeenCalled();
});
it('applies requested mouse passthrough directly when no editor is open', async () => {
  const { ball, overlay } = await setup(); ball.setBallMousePassthrough(false); expect(overlay.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, { forward: false });
  ball.setBallMousePassthrough(true); expect(overlay.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true });
});
