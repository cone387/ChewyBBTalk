import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  shortcuts: new Map<string, () => void>(),
  unregisterAll: vi.fn(),
  ballWindow: { isVisible: vi.fn(() => false), hide: vi.fn(), show: vi.fn() } as any,
  ball: null as any,
  composeVisible: false, showCompose: vi.fn(), hideCompose: vi.fn(),
}));

vi.mock('electron', () => ({
  globalShortcut: {
    register: (accelerator: string, handler: () => void) => { state.shortcuts.set(accelerator, handler); },
    unregisterAll: state.unregisterAll,
  },
}));
vi.mock('../windows/ballWindow', () => ({ getBallWindow: () => state.ball }));
vi.mock('../windows/composeWindow', () => ({
  showComposeWindow: state.showCompose,
  hideComposeWindow: state.hideCompose,
  isComposeVisible: () => state.composeVisible,
}));

const fire = (accelerator: string) => state.shortcuts.get(accelerator)!();

beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks();
  state.shortcuts.clear();
  state.ballWindow = { isVisible: vi.fn(() => false), hide: vi.fn(), show: vi.fn() };
  state.ball = state.ballWindow;
  state.composeVisible = false;
  (await import('../hotkey')).registerHotkeys();
});

it('registers the three global shortcuts', () => {
  expect([...state.shortcuts.keys()].sort()).toEqual(['Alt+B', 'CommandOrControl+Shift+B', 'CommandOrControl+Shift+N']);
});

it('hides a visible ball overlay and shows a hidden one', () => {
  state.ballWindow.isVisible.mockReturnValue(true);
  fire('CommandOrControl+Shift+B');
  expect(state.ballWindow.hide).toHaveBeenCalledTimes(1);
  expect(state.ballWindow.show).not.toHaveBeenCalled();
  state.ballWindow.isVisible.mockReturnValue(false);
  fire('CommandOrControl+Shift+B');
  expect(state.ballWindow.show).toHaveBeenCalledTimes(1);
});

it('leaves the ball alone when no overlay exists', () => {
  state.ball = null;
  expect(() => fire('CommandOrControl+Shift+B')).not.toThrow();
});

it('opens the compose editor with the dedicated shortcut', () => {
  fire('CommandOrControl+Shift+N');
  expect(state.showCompose).toHaveBeenCalledTimes(1);
  expect(state.hideCompose).not.toHaveBeenCalled();
});

it('toggles the compose editor visibility with Alt+B', () => {
  fire('Alt+B');
  expect(state.showCompose).toHaveBeenCalledTimes(1);
  state.composeVisible = true;
  fire('Alt+B');
  expect(state.hideCompose).toHaveBeenCalledTimes(1);
  expect(state.showCompose).toHaveBeenCalledTimes(1);
});

it('unregisters every shortcut on teardown', async () => {
  const { unregisterHotkeys } = await import('../hotkey');
  unregisterHotkeys();
  expect(state.unregisterAll).toHaveBeenCalledTimes(1);
});
