import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { installMiniDom, type MiniDom, type FakeElement } from '../../__tests__/miniDom';
import { BallMenu } from '../BallMenu';

const desktop = vi.hoisted(() => ({
  settings: { show: vi.fn() },
  quit: vi.fn(),
}));

let dom: MiniDom;
let react: typeof import('react');
let client: typeof import('react-dom/client');
let root: import('react-dom/client').Root;
let onClose: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  dom = installMiniDom();
  react = await import('react');
  client = await import('react-dom/client');
  vi.clearAllMocks();
  onClose = vi.fn();
  (window as any).desktop = desktop;
});

afterEach(async () => {
  if (root) await act(() => root.unmount());
  root = undefined as unknown as import('react-dom/client').Root;
  dom.restore();
});

function mount(props: Partial<React.ComponentProps<typeof BallMenu>> = {}) {
  const container = dom.document.createElement('div');
  dom.document.body.appendChild(container);
  root = client.createRoot(container as any);
  return act(() => root.render(react.createElement(BallMenu, {
    visible: true, ballX: 100, ballY: 200, overlayWidth: 1920, overlayHeight: 1080, onClose, ...props,
  }))).then(() => container);
}

async function act(fn: () => void) {
  const { act: run } = await import('react');
  let error: unknown;
  await run(async () => { try { fn(); } catch (e) { error = e; } });
  if (error) throw error;
}

it('renders nothing while hidden', async () => {
  const container = await mount({ visible: false });
  expect(container.children).toHaveLength(0);
});

it('positions the menu to the right of the ball by default', async () => {
  await mount();
  const menu = dom.document.querySelectorAll('.ball-menu')[0];
  expect(menu.style).toMatchObject({ left: '164px', top: '188px', width: '120px' });
  const spans = menu.querySelectorAll('span');
  expect(spans.map((span: FakeElement) => span.textContent).join('|')).toBe('设置|退出');
});

it('flips the menu to the left when the right side has no room', async () => {
  await mount({ overlayWidth: 200 });
  const menu = dom.document.querySelectorAll('.ball-menu')[0];
  expect(menu.style.left).toBe('-28px');
});

it('clamps the menu inside the vertical bounds', async () => {
  await mount({ ballY: -50, overlayHeight: 80 });
  const menu = dom.document.querySelectorAll('.ball-menu')[0];
  expect(menu.style.top).toBe('-8px');
});

it('runs the menu actions and closes', async () => {
  await mount();
  const buttons = dom.document.querySelectorAll('.ball-menu-item');
  await act(() => dom.dispatch(buttons[0], { type: 'click' }));
  expect(desktop.settings.show).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
  await act(() => dom.dispatch(buttons[1], { type: 'click' }));
  expect(desktop.quit).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(2);
});

it('closes when clicking outside after the menu opens', async () => {
  await mount();
  dom.window.runAnimationFrames();
  const outside = dom.document.createElement('div');
  dom.document.body.appendChild(outside);
  await act(() => dom.fireWindow('pointerdown', { target: outside }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('stays open when clicking inside the menu', async () => {
  await mount();
  dom.window.runAnimationFrames();
  const item = dom.document.querySelectorAll('.ball-menu-item')[0];
  await act(() => dom.fireWindow('pointerdown', { target: item }));
  expect(onClose).not.toHaveBeenCalled();
});

it('closes on Escape', async () => {
  await mount();
  await act(() => dom.fireWindow('keydown', { key: 'Escape' }));
  expect(onClose).toHaveBeenCalledTimes(1);
  await act(() => dom.fireWindow('keydown', { key: 'Enter' }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('does not bind outside-click handling while the menu is closed', async () => {
  await mount({ visible: false });
  dom.window.runAnimationFrames();
  await act(() => dom.fireWindow('pointerdown', { target: dom.document.body }));
  expect(onClose).not.toHaveBeenCalled();
});
