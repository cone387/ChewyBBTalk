import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { installMiniDom, type MiniDom } from '../../__tests__/miniDom';
import { Ball } from '../Ball';
import type { OverlayInfo } from '../../../shared/ipc-types';

const overlay = vi.hoisted(() => ({
  info: null as OverlayInfo | null,
  saved: null as { x: number; y: number } | null,
  events: {
    overlayListeners: new Array<(info: OverlayInfo) => void>(),
    suspensionListeners: new Array<(value: boolean) => void>(),
  },
}));

const desktop = vi.hoisted(() => ({
  ball: {
    getOverlayInfo: vi.fn(() => Promise.resolve(overlay.info)),
    onOverlayInfo: vi.fn((cb: (info: OverlayInfo) => void) => { overlay.events.overlayListeners.push(cb); return () => { overlay.events.overlayListeners = overlay.events.overlayListeners.filter(fn => fn !== cb); }; }),
    setIgnoreMouseEvents: vi.fn(() => Promise.resolve()),
    savePosition: vi.fn(() => Promise.resolve()),
    getSuspended: vi.fn(() => Promise.resolve(false)),
    onSuspensionChanged: vi.fn((cb: (value: boolean) => void) => { overlay.events.suspensionListeners.push(cb); return () => { overlay.events.suspensionListeners = overlay.events.suspensionListeners.filter(fn => fn !== cb); }; }),
  },
  compose: { toggle: vi.fn() },
  settings: { show: vi.fn() },
  quit: vi.fn(),
}));

function makeInfo(overrides: Partial<OverlayInfo> = {}): OverlayInfo {
  return {
    overlay: { x: 0, y: 0, width: 1920, height: 1080 },
    displays: [{ id: 1, x: 0, y: 0, width: 1920, height: 1080 }],
    savedPosition: overlay.saved,
    ...overrides,
  };
}

let dom: MiniDom;
let react: typeof import('react');
let client: typeof import('react-dom/client');
let root: import('react-dom/client').Root;

beforeEach(async () => {
  dom = installMiniDom();
  react = await import('react');
  client = await import('react-dom/client');
  vi.clearAllMocks();
  overlay.saved = null;
  overlay.info = makeInfo();
  overlay.events.overlayListeners = [];
  overlay.events.suspensionListeners = [];
  (window as any).desktop = desktop;
});

afterEach(async () => {
  if (root) await act(() => root.unmount());
  root = undefined as unknown as import('react-dom/client').Root;
  dom.restore();
});

async function act(fn: () => void) {
  const { act: run } = await import('react');
  let error: unknown;
  await run(async () => { try { fn(); } catch (e) { error = e; } });
  if (error) throw error;
}

async function mount() {
  const container = dom.document.createElement('div');
  dom.document.body.appendChild(container);
  root = client.createRoot(container as any);
  await act(() => root.render(react.createElement(Ball)));
  return container;
}

function ballEl() { return dom.document.querySelectorAll('.ball')[0]; }
function transform() { return ballEl().style.transform; }
const suspend = (value: boolean) => overlay.events.suspensionListeners.forEach(cb => cb(value));
const pushOverlay = (info: OverlayInfo) => overlay.events.overlayListeners.forEach(cb => cb(info));

it('renders nothing until overlay info arrives', async () => {
  desktop.ball.getOverlayInfo.mockImplementationOnce(() => new Promise<OverlayInfo>(() => {}));
  await mount();
  expect(dom.document.querySelectorAll('.ball')).toHaveLength(0);
  expect(desktop.ball.getOverlayInfo).toHaveBeenCalledTimes(1);
});

it('places the ball at the default corner position once info arrives', async () => {
  await mount();
  expect(transform()).toBe('translate(1840px, 904px)');
  expect(desktop.ball.setIgnoreMouseEvents).toHaveBeenCalledWith(true);
  expect(ballEl().classList.contains('animating')).toBe(false);
});

it('restores and clamps a saved position', async () => {
  overlay.saved = { x: 4000, y: 200 };
  overlay.info = makeInfo();
  await mount();
  expect(transform()).toBe('translate(1864px, 200px)');
});

it('falls back to a hardcoded position without displays and reflows on overlay updates', async () => {
  overlay.info = { overlay: { x: 0, y: 0, width: 800, height: 600 }, displays: [], savedPosition: null };
  await mount();
  expect(transform()).toBe('translate(100px, 100px)');
  await act(() => pushOverlay(makeInfo()));
  expect(transform()).toBe('translate(1840px, 904px)');
});

it('toggles the compose editor on click without dragging', async () => {
  await mount();
  await act(() => dom.dispatch(ballEl(), { type: 'pointerdown', button: 0, screenX: 500, screenY: 500, clientX: 1868, clientY: 932, pointerId: 1 }));
  await act(() => dom.fireWindow('pointerup', { pointerId: 1 }));
  expect(desktop.compose.toggle).toHaveBeenCalledWith(1868, 932);
  expect(desktop.ball.savePosition).not.toHaveBeenCalled();
});

it('ignores non-primary buttons and ignores stray moves after release', async () => {
  await mount();
  await act(() => dom.dispatch(ballEl(), { type: 'pointerdown', button: 2, screenX: 500, screenY: 500, pointerId: 1 }));
  expect(ballEl().classList.contains('pressed')).toBe(false);
  await act(() => dom.fireWindow('pointermove', { screenX: 900, screenY: 900, pointerId: 1 }));
  expect(transform()).toBe('translate(1840px, 904px)');
});

it('drags the ball, clamps it to the display, and keeps it un-snapped mid screen', async () => {
  await mount();
  await act(() => dom.dispatch(ballEl(), { type: 'pointerdown', button: 0, screenX: 1868, screenY: 932, clientX: 1868, clientY: 932, pointerId: 1 }));
  expect(ballEl().classList.contains('pressed')).toBe(true);
  await act(() => dom.fireWindow('pointermove', { screenX: 1568, screenY: 932, clientX: 1568, clientY: 932, pointerId: 1 }));
  expect(ballEl().classList.contains('dragging')).toBe(true);
  expect(ballEl().classList.contains('pressed')).toBe(false);
  expect(transform()).toBe('translate(1540px, 904px)');
  await act(() => dom.fireWindow('pointerup', { pointerId: 1 }));
  expect(desktop.ball.savePosition).toHaveBeenCalledWith(1540, 904);
  expect(ballEl().classList.contains('snapped')).toBe(false);
  expect(desktop.compose.toggle).not.toHaveBeenCalled();
});

it('drags below the threshold without engaging drag mode', async () => {
  await mount();
  await act(() => dom.dispatch(ballEl(), { type: 'pointerdown', button: 0, screenX: 1868, screenY: 932, pointerId: 1 }));
  await act(() => dom.fireWindow('pointermove', { screenX: 1866, screenY: 932, pointerId: 1 }));
  expect(ballEl().classList.contains('dragging')).toBe(false);
  await act(() => dom.fireWindow('pointerup', { pointerId: 1 }));
  expect(desktop.compose.toggle).toHaveBeenCalled();
});

it('snaps to the nearest edge and persists the half-hidden position', async () => {
  await mount();
  await act(() => dom.dispatch(ballEl(), { type: 'pointerdown', button: 0, screenX: 1868, screenY: 932, pointerId: 1 }));
  await act(() => dom.fireWindow('pointermove', { screenX: 1600, screenY: 1048, pointerId: 1 }));
  await act(() => dom.fireWindow('pointerup', { pointerId: 1 }));
  expect(transform()).toBe('translate(1572px, 1052px)');
  expect(desktop.ball.savePosition).toHaveBeenCalledWith(1572, 1052);
  expect(ballEl().classList.contains('snapped')).toBe(true);
});

it('falls back to saving the raw position when no display matches', async () => {
  overlay.info = { overlay: { x: 0, y: 0, width: 1920, height: 1080 }, displays: [], savedPosition: null };
  await mount();
  await act(() => dom.dispatch(ballEl(), { type: 'pointerdown', button: 0, screenX: 1868, screenY: 932, pointerId: 1 }));
  await act(() => dom.fireWindow('pointermove', { screenX: 1668, screenY: 932, pointerId: 1 }));
  expect(transform()).toBe('translate(-100px, 100px)');
  await act(() => dom.fireWindow('pointerup', { pointerId: 1 }));
  expect(desktop.ball.savePosition).toHaveBeenCalledWith(-100, 100);
});

it('turns mouse passthrough off inside the ball and on when far away', async () => {
  await mount();
  desktop.ball.setIgnoreMouseEvents.mockClear();
  await act(() => dom.fireWindow('mousemove', { clientX: 1868, clientY: 932 }));
  expect(desktop.ball.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false);
  await act(() => dom.fireWindow('mousemove', { clientX: 100, clientY: 100 }));
  expect(desktop.ball.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true);
});

it('keeps passthrough off inside the peek ring around a half-hidden ball', async () => {
  await mount();
  await act(() => dom.dispatch(ballEl(), { type: 'pointerdown', button: 0, screenX: 1868, screenY: 932, pointerId: 1 }));
  await act(() => dom.fireWindow('pointermove', { screenX: 1600, screenY: 1048, pointerId: 1 }));
  await act(() => dom.fireWindow('pointerup', { pointerId: 1 }));
  desktop.ball.setIgnoreMouseEvents.mockClear();
  await act(() => dom.fireWindow('mousemove', { clientX: 1608, clientY: 1064 }));
  expect(desktop.ball.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false);
  expect(transform()).toBe('translate(1572px, 1024px)');
  expect(ballEl().classList.contains('animating')).toBe(true);
});

it('collapses the peeked ball again after the mouse leaves', async () => {
  await mount();
  await act(() => dom.dispatch(ballEl(), { type: 'pointerdown', button: 0, screenX: 1868, screenY: 932, pointerId: 1 }));
  await act(() => dom.fireWindow('pointermove', { screenX: 1600, screenY: 1048, pointerId: 1 }));
  await act(() => dom.fireWindow('pointerup', { pointerId: 1 }));
  await act(() => dom.fireWindow('mousemove', { clientX: 1608, clientY: 1064 }));
  await act(() => dom.fireWindow('mousemove', { clientX: 100, clientY: 100 }));
  await new Promise(resolve => setTimeout(resolve, 460));
  expect(transform()).toBe('translate(1572px, 1052px)');
});

it('opens the context menu, keeps passthrough off, and closes via menu action', async () => {
  await mount();
  await act(() => dom.dispatch(ballEl(), { type: 'contextmenu', clientX: 1868, clientY: 932, button: 2 }));
  expect(dom.document.querySelectorAll('.ball-menu')).toHaveLength(1);
  expect(desktop.ball.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false);
  await act(() => dom.fireWindow('mousemove', { clientX: 100, clientY: 100 }));
  expect(desktop.ball.setIgnoreMouseEvents).not.toHaveBeenLastCalledWith(true);
  const items = dom.document.querySelectorAll('.ball-menu-item');
  await act(() => dom.dispatch(items[1], { type: 'click' }));
  expect(desktop.quit).toHaveBeenCalledTimes(1);
  expect(dom.document.querySelectorAll('.ball-menu')).toHaveLength(0);
});

it('suspends interactions while an editor window is in the foreground', async () => {
  await mount();
  await act(() => dom.dispatch(ballEl(), { type: 'contextmenu', clientX: 1868, clientY: 932, button: 2 }));
  expect(dom.document.querySelectorAll('.ball-menu')).toHaveLength(1);
  desktop.ball.setIgnoreMouseEvents.mockClear();
  await act(() => suspend(true));
  expect(dom.document.querySelectorAll('.ball-menu')).toHaveLength(0);
  expect(desktop.ball.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true);
  desktop.ball.setIgnoreMouseEvents.mockClear();
  await act(() => dom.fireWindow('mousemove', { clientX: 1868, clientY: 932 }));
  expect(desktop.ball.setIgnoreMouseEvents).not.toHaveBeenCalled();
  await act(() => suspend(false));
  await act(() => dom.fireWindow('mousemove', { clientX: 1868, clientY: 932 }));
  expect(desktop.ball.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false);
});

it('restores passthrough when unmounting', async () => {
  await mount();
  desktop.ball.setIgnoreMouseEvents.mockClear();
  await act(() => root.unmount());
  expect(desktop.ball.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false);
});
