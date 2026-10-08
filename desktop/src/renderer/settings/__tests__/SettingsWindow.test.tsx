import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { installMiniDom, type MiniDom } from '../../__tests__/miniDom';
import { SettingsWindow } from '../SettingsWindow';
import type { AuthState, UpdateState } from '../../../shared/ipc-types';

const state = vi.hoisted(() => ({
  apiUrl: 'https://server.test',
  version: '1.2.3',
  auth: { status: 'signed-out' } as AuthState,
  update: { status: 'idle' } as UpdateState,
  updateListeners: new Array<(state: UpdateState) => void>(),
  authListeners: new Array<(state: AuthState) => void>(),
  saveServer: vi.fn(() => Promise.resolve()),
  logout: vi.fn(() => Promise.resolve()),
  install: vi.fn(() => Promise.resolve()),
  download: vi.fn(() => Promise.resolve()),
  check: vi.fn(() => Promise.resolve()),
}));

const desktop = vi.hoisted(() => ({
  updates: {
    getState: () => Promise.resolve(state.update),
    check: state.check, download: state.download, install: state.install,
    onChanged: (cb: (value: UpdateState) => void) => { state.updateListeners.push(cb); return () => { state.updateListeners = state.updateListeners.filter(fn => fn !== cb); }; },
  },
  compose: { getApiUrl: () => Promise.resolve(state.apiUrl) },
  settings: { getVersion: () => Promise.resolve(state.version), saveServer: state.saveServer, show: vi.fn(), hide: vi.fn() },
  auth: {
    getState: () => Promise.resolve(state.auth),
    logout: state.logout,
    onStateChanged: (cb: (value: AuthState) => void) => { state.authListeners.push(cb); return () => { state.authListeners = state.authListeners.filter(fn => fn !== cb); }; },
  },
  login: { show: vi.fn() },
  shell: { openExternal: vi.fn() },
}));

let dom: MiniDom;
let react: typeof import('react');
let client: typeof import('react-dom/client');
let root: import('react-dom/client').Root;

beforeEach(async () => {
  dom = installMiniDom();
  react = await import('react');
  client = await import('react-dom/client');
  vi.clearAllMocks();
  state.apiUrl = 'https://server.test';
  state.version = '1.2.3';
  state.auth = { status: 'signed-out' } as AuthState;
  state.update = { status: 'idle' };
  state.updateListeners = [];
  state.authListeners = [];
  state.saveServer.mockImplementation(() => Promise.resolve());
  state.check.mockImplementation(() => Promise.resolve());
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
  await act(() => root.render(react.createElement(SettingsWindow)));
  await act(async () => {});
  return container;
}

const q = (selector: string) => dom.document.querySelectorAll(selector);
const text = (selector: string) => q(selector).map(el => el.textContent).join('|');
const navTo = async (label: string) => {
  const button = q('.settings-nav-item').find(el => el.textContent?.includes(label))!;
  await act(() => dom.dispatch(button, { type: 'click' }));
};

it('shows the general pane with the configured server url by default', async () => {
  await mount();
  expect(text('.settings-nav-item.active span')).toBe('通用');
  expect(q('.settings-input')[0].value).toBe('https://server.test');
  expect(text('.settings-kbd')).toBe('Alt+B');
  expect(text('.settings-save-btn')).toBe('保存设置');
});

it('closes the window from the titlebar', async () => {
  await mount();
  await act(() => dom.dispatch(q('.settings-close-btn')[0], { type: 'click' }));
  expect(desktop.settings.hide).toHaveBeenCalledTimes(1);
});

it('saves the edited server url and reflects the normalized result', async () => {
  await mount();
  const input = q('.settings-input')[0];
  input.value = 'https://other.test/';
  await act(() => dom.dispatch(input, { type: 'input', target: input }));
  await act(() => dom.dispatch(q('.settings-save-btn')[0], { type: 'click' }));
  expect(state.saveServer).toHaveBeenCalledWith('https://other.test/');
  state.apiUrl = 'https://other.test';
  await act(() => dom.dispatch(q('.settings-save-btn')[0], { type: 'click' }));
  expect(q('.settings-input')[0].value).toBe('https://other.test');
  expect(text('.settings-save-btn')).toContain('已保存');
});

it('surfaces save failures without marking the form saved', async () => {
  await mount();
  state.saveServer.mockImplementation(() => Promise.reject(new Error('network down')));
  await act(() => dom.dispatch(q('.settings-save-btn')[0], { type: 'click' }));
  expect(text('[role=alert]')).toBe('network down');
  expect(text('.settings-save-btn')).toBe('保存设置');
});

it('describes the account state and offers login or logout', async () => {
  state.auth = { status: 'authenticated', username: 'alice' } as AuthState;
  await mount();
  await navTo('账号');
  expect(q('.settings-dot.active')).toHaveLength(1);
  expect(text('.settings-status-row span')).toContain('已登录 · alice');
  await act(() => dom.dispatch(q('.settings-danger-btn')[0], { type: 'click' }));
  expect(state.logout).toHaveBeenCalledTimes(1);
  expect(q('.settings-danger-btn')).toHaveLength(0);
  expect(text('.settings-save-btn')).toBe('去登录');
  await act(() => dom.dispatch(q('.settings-save-btn')[0], { type: 'click' }));
  expect(desktop.login.show).toHaveBeenCalledTimes(1);
});

it.each([
  ['offline', '离线 · 会话已保留'],
  ['restoring', '恢复登录中…'],
] as const)('renders %s account status without persistent warnings', async (status, expected) => {
  state.auth = { status, persistent: true } as AuthState;
  await mount();
  await navTo('账号');
  expect(text('.settings-status-row span')).toContain(expected);
  expect(q('[role=status].settings-help')).toHaveLength(0);
});

it('warns when the session is not persistent', async () => {
  state.auth = { status: 'authenticated', username: 'bob', persistent: false } as AuthState;
  await mount();
  await navTo('账号');
  expect(text('[role=status].settings-help')).toContain('安全存储不可用');
});

it('reacts to auth state changes pushed by the main process', async () => {
  state.auth = { status: 'signed-out' } as AuthState;
  await mount();
  await navTo('账号');
  expect(text('.settings-status-row span')).toContain('未登录');
  await act(() => state.authListeners.forEach(cb => cb({ status: 'authenticated', username: 'carol' } as AuthState)));
  expect(text('.settings-status-row span')).toContain('已登录 · carol');
});

it('lists stored logs newest-first and clears them', async () => {
  dom.window.localStorage.setItem('__bbtalk_logs', JSON.stringify([
    { timestamp: new Date('2026-01-02T03:04:05').getTime(), level: 'error', message: 'boom' },
    { timestamp: new Date('2026-01-02T03:04:06').getTime(), level: 'info', message: 'later' },
  ]));
  await mount();
  await navTo('日志');
  expect(q('.settings-log-item')).toHaveLength(2);
  expect(q('.settings-log-item')[0].textContent).toContain('later');
  expect(text('.settings-log-time')).toBe('03:04:06|03:04:05');
  await act(() => dom.dispatch(q('.settings-clear-btn')[0], { type: 'click' }));
  expect(q('.settings-log-item')).toHaveLength(0);
  expect(text('.settings-logs-empty')).toBe('暂无日志');
  expect(dom.window.localStorage.getItem('__bbtalk_logs')).toBeNull();
});

it('falls back to an empty log list for corrupted storage', async () => {
  dom.window.localStorage.setItem('__bbtalk_logs', '{not json');
  await mount();
  await navTo('日志');
  expect(text('.settings-logs-empty')).toBe('暂无日志');
});

it('shows the about pane with version and update affordances', async () => {
  await mount();
  await navTo('关于');
  expect(text('.settings-about-version')).toBe('Desktop v1.2.3');
  expect(text('.settings-update-btn')).toBe('检查更新');
  expect(q('.settings-update-btn')[0].disabled).toBe(false);
  await act(() => dom.dispatch(q('.settings-update-btn')[0], { type: 'click' }));
  expect(state.check).toHaveBeenCalledTimes(1);
  await act(() => dom.dispatch(q('.settings-clear-btn')[0], { type: 'click' }));
  expect(desktop.shell.openExternal).toHaveBeenCalledWith('https://github.com/cone387/ChewyBBTalk/releases/tag/desktop-stable');
});

it('drives update state changes through the matching actions', async () => {
  await mount();
  await act(() => state.updateListeners.forEach(cb => cb({ status: 'available', version: '9.9.9' })));
  await navTo('关于');
  expect(text('.settings-update-btn')).toBe('下载更新');
  await act(() => dom.dispatch(q('.settings-update-btn')[0], { type: 'click' }));
  expect(state.download).toHaveBeenCalledTimes(1);
  expect(state.check).not.toHaveBeenCalled();
  await act(() => state.updateListeners.forEach(cb => cb({ status: 'downloaded', version: '9.9.9' })));
  expect(q('.settings-nav-item')[3].textContent).toContain('可更新');
  expect(text('.settings-update-btn')).toBe('保存草稿并重启安装');
  await act(() => dom.dispatch(q('.settings-update-btn')[0], { type: 'click' }));
  expect(state.install).toHaveBeenCalledTimes(1);
});

it('renders progress while downloading and disables the update button', async () => {
  state.update = { status: 'downloading', version: '9.9.9', percent: 42 };
  await mount();
  await navTo('关于');
  expect(text('[role=status].settings-help')).toContain('42%');
  expect(q('progress')).toHaveLength(1);
  expect(q('.settings-update-btn')[0].disabled).toBe(true);
});

it.each(['checking', 'installing', 'unsupported'] as const)('keeps the update button disabled while %s', async status => {
  state.update = { status } as UpdateState;
  await mount();
  await navTo('关于');
  expect(q('.settings-update-btn')[0].disabled).toBe(true);
});

it('reports failed update operations', async () => {
  state.check.mockImplementation(() => Promise.reject(new Error('offline')));
  await mount();
  await navTo('关于');
  await act(() => dom.dispatch(q('.settings-update-btn')[0], { type: 'click' }));
  await act(() => dom.dispatch(q('.settings-update-btn')[0], { type: 'click' }));
  expect(text('[role=status].settings-help')).toContain('更新操作失败');
});
