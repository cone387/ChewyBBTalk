import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => {
  const screenHandlers = new Map<string, Array<() => void>>();
  return {
    handlers: new Map<string, (...args: any[]) => any>(),
    screenHandlers,
    displays: [{ id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1080 } }, { id: 2, workArea: { x: 1920, y: 0, width: 1280, height: 720 } }],
    overlayBounds: { x: 0, y: 0, width: 3200, height: 1080 },
    ballWindow: { isDestroyed: () => false, webContents: { send: vi.fn() } } as any,
    hasWindow: true,
    passthrough: vi.fn(),
    resize: vi.fn(),
    suspended: false,
    ballState: { position: null } as any,
    setPosition: vi.fn(),
    openExternal: vi.fn(),
    quit: vi.fn(),
    screenOn: vi.fn((event: string, handler: () => void) => { screenHandlers.set(event, [...(screenHandlers.get(event) || []), handler]); }),
  };
});

vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => any) => { state.handlers.set(channel, handler); } },
  screen: { getAllDisplays: () => state.displays, on: state.screenOn },
  shell: { openExternal: state.openExternal },
  app: { quit: state.quit, _isQuitting: false },
}));
vi.mock('../../windows/ballWindow', () => ({
  computeOverlayBounds: () => state.overlayBounds,
  getBallWindow: () => (state.hasWindow ? state.ballWindow : null),
  resizeOverlayToDisplays: state.resize,
  setBallMousePassthrough: state.passthrough,
  isBallSuspended: () => state.suspended,
}));
vi.mock('../../store', () => ({
  getBallState: () => state.ballState,
  setBallPosition: state.setPosition,
}));

const call = (channel: string, ...args: unknown[]) => state.handlers.get(channel)!(null, ...args);

beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks();
  state.handlers.clear(); state.screenHandlers.clear();
  state.hasWindow = true;
  state.ballState = { position: null };
  state.ballWindow = { isDestroyed: () => false, webContents: { send: vi.fn() } };
  const { registerBallIpc, registerDisplayWatchers } = await import('../ballIpc');
  registerBallIpc(); registerDisplayWatchers();
});

it('answers suspension queries from the ball window module', () => {
  expect(call('ball:get-suspended')).toBe(false);
  state.suspended = true;
  expect(call('ball:get-suspended')).toBe(true);
});

it('coerces mouse passthrough requests to booleans', () => {
  call('ball:set-ignore-mouse-events', true);
  expect(state.passthrough).toHaveBeenLastCalledWith(true);
  call('ball:set-ignore-mouse-events', 0);
  expect(state.passthrough).toHaveBeenLastCalledWith(false);
  call('ball:set-ignore-mouse-events', 'yes');
  expect(state.passthrough).toHaveBeenLastCalledWith(true);
});

it('describes the overlay geometry, displays, and saved position', () => {
  expect(call('ball:get-overlay-info')).toEqual({
    overlay: { x: 0, y: 0, width: 3200, height: 1080 },
    displays: [
      { id: 1, x: 0, y: 0, width: 1920, height: 1080 },
      { id: 2, x: 1920, y: 0, width: 1280, height: 720 },
    ],
    savedPosition: null,
  });
  state.ballState = { position: { x: 12, y: 34, displayId: 1 } };
  expect(call('ball:get-overlay-info')).toMatchObject({ savedPosition: { x: 12, y: 34 } });
});

it('rounds saved ball positions and stores them without a display binding', () => {
  call('ball:save-position', 41.7, -9.2);
  expect(state.setPosition).toHaveBeenCalledWith(42, -9, null);
});

it('delegates external links to the shell', () => {
  call('shell:open-external', 'https://example.test');
  expect(state.openExternal).toHaveBeenCalledWith('https://example.test');
});

it('marks the app as quitting and quits through electron', async () => {
  const electron = await import('electron');
  call('app:quit');
  expect((electron.app as any)._isQuitting).toBe(true);
  expect(state.quit).toHaveBeenCalledTimes(1);
});

it.each(['display-added', 'display-removed', 'display-metrics-changed'])('recomputes the overlay on %s', async event => {
  state.screenHandlers.get(event)![0]();
  expect(state.resize).toHaveBeenCalledTimes(1);
  expect(state.ballWindow.webContents.send).toHaveBeenCalledWith('ball:overlay-info', expect.objectContaining({ overlay: state.overlayBounds }));
});

it('skips broadcasts while no overlay window exists', () => {
  state.hasWindow = false;
  state.screenHandlers.get('display-added')![0]();
  expect(state.resize).toHaveBeenCalledTimes(1);
});

it('skips broadcasts for destroyed overlay windows', () => {
  state.ballWindow.isDestroyed = () => true;
  state.screenHandlers.get('display-removed')![0]();
  expect(state.ballWindow.webContents.send).not.toHaveBeenCalled();
});
