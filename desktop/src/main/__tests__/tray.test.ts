import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  tray: { on: vi.fn(), setToolTip: vi.fn(), setContextMenu: vi.fn() },
  buildFromTemplate: vi.fn((template: unknown[]) => ({ template })),
  resized: { setTemplateImage: vi.fn() },
  resize: vi.fn(),
  createFromPath: vi.fn(),
  quit: vi.fn(),
  showCompose: vi.fn(),
  showSettings: vi.fn(),
}));

vi.mock('electron', () => ({
  Tray: vi.fn(() => state.tray),
  Menu: { buildFromTemplate: state.buildFromTemplate },
  nativeImage: {
    createFromPath: (path: string) => { state.createFromPath(path); return { resize: state.resize }; },
  },
  app: { quit: state.quit, _isQuitting: false },
}));
vi.mock('../windows/composeWindow', () => ({ showComposeWindow: state.showCompose }));
vi.mock('../windows/settingsWindow', () => ({ showSettingsWindow: state.showSettings }));
vi.mock('../icons', () => ({ appIconPath: (name: string) => `/fake/resources/${name}` }));

const realPlatform = process.platform;
function withPlatform(platform: string, run: () => void) {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  try { run(); } finally { Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true }); }
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  state.resize.mockImplementation(() => state.resized);
});

it('builds the tray menu and wires every action', async () => {
  const { createTray } = await import('../tray');
  createTray();

  expect(state.createFromPath).toHaveBeenCalledWith(`/fake/resources/${realPlatform === 'darwin' ? 'trayTemplate.png' : 'tray.png'}`);
  expect(state.resize).toHaveBeenCalledWith({ width: realPlatform === 'darwin' ? 22 : 16, height: realPlatform === 'darwin' ? 22 : 16 });
  expect(state.tray.setToolTip).toHaveBeenCalledWith('ChewyBBTalk');
  expect(state.tray.setContextMenu).toHaveBeenCalledWith({ template: expect.anything() });

  const template = state.buildFromTemplate.mock.calls[0][0] as Array<{ label?: string; click?: () => void; type?: string }>;
  expect(template.find(item => item.type === 'separator')).toBeTruthy();
  template.find(item => item.label === '新建碎碎念')!.click!();
  expect(state.showCompose).toHaveBeenCalledTimes(1);
  template.find(item => item.label === '设置')!.click!();
  expect(state.showSettings).toHaveBeenCalledTimes(1);
  template.find(item => item.label === '退出')!.click!();
  expect(state.quit).toHaveBeenCalledTimes(1);
  expect((await import('electron')).app._isQuitting).toBe(true);

  const trayClick = state.tray.on.mock.calls.find(([event]: [string]) => event === 'click')![1] as () => void;
  trayClick();
  expect(state.showCompose).toHaveBeenCalledTimes(2);
});

it('uses the mac template icon on darwin and a small icon elsewhere', async () => {
  const { createTray } = await import('../tray');
  withPlatform('darwin', () => createTray());
  expect(state.createFromPath).toHaveBeenCalledWith('/fake/resources/trayTemplate.png');
  expect(state.resize).toHaveBeenCalledWith({ width: 22, height: 22 });
  expect(state.resized.setTemplateImage).toHaveBeenCalledWith(true);

  vi.resetModules();
  const fresh = await import('../tray');
  withPlatform('win32', () => fresh.createTray());
  expect(state.createFromPath).toHaveBeenCalledWith('/fake/resources/tray.png');
  expect(state.resize).toHaveBeenCalledWith({ width: 16, height: 16 });
  expect(state.resized.setTemplateImage).toHaveBeenCalledTimes(1);
});
