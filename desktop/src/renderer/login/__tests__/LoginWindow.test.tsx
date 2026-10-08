import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { installMiniDom, type MiniDom } from '../../__tests__/miniDom';
import { LoginWindow } from '../LoginWindow';

const state = vi.hoisted(() => ({
  apiUrl: 'https://server.test',
}));

const desktop = vi.hoisted(() => ({
  compose: { getApiUrl: () => Promise.resolve(state.apiUrl) },
  auth: {
    browserLogin: vi.fn((): Promise<{ ok: boolean; error?: string }> => Promise.resolve({ ok: true })),
    login: vi.fn((): Promise<{ ok: boolean; error?: string }> => Promise.resolve({ ok: true })),
    cancelBrowserLogin: vi.fn(),
  },
  login: { hide: vi.fn() },
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
  desktop.auth.browserLogin.mockImplementation(() => Promise.resolve({ ok: true }));
  desktop.auth.login.mockImplementation(() => Promise.resolve({ ok: true }));
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
  await act(() => root.render(react.createElement(LoginWindow)));
  await act(async () => {});
  return container;
}

const q = (selector: string) => dom.document.querySelectorAll(selector);
const text = (selector: string) => q(selector).map(el => el.textContent).join('|');

it('shows the server url from the compose settings and hides password fields', async () => {
  await mount();
  expect(q('#server')[0].value).toBe('https://server.test');
  expect(text('.login-submit')).toBe('通过浏览器登录');
  expect(q('[aria-label=用户名]')).toHaveLength(0);
  expect(q('[aria-label=密码]')).toHaveLength(0);
  expect(q('.login-error')).toHaveLength(0);
});

it('closes the window from the titlebar', async () => {
  await mount();
  await act(() => dom.dispatch(q('.login-close-btn')[0], { type: 'click' }));
  expect(desktop.login.hide).toHaveBeenCalledTimes(1);
});

it('completes browser login, announces success, and hides after a delay', async () => {
  await mount();
  await act(() => dom.dispatch(q('.login-submit')[0], { type: 'click' }));
  expect(desktop.auth.browserLogin).toHaveBeenCalledWith('https://server.test');
  expect(text('[role=status].login-success')).toBe('登录成功');
  expect(desktop.login.hide).not.toHaveBeenCalled();
  await new Promise(resolve => setTimeout(resolve, 850));
  expect(desktop.login.hide).toHaveBeenCalledTimes(1);
});

it('surfaces a rejected browser login result as an error', async () => {
  desktop.auth.browserLogin.mockImplementation(() => Promise.resolve({ ok: false, error: '用户拒绝了授权' }));
  await mount();
  await act(() => dom.dispatch(q('.login-submit')[0], { type: 'click' }));
  expect(text('[role=alert].login-error')).toBe('用户拒绝了授权');
  expect(q('.login-success')).toHaveLength(0);
});

it('falls back to a generic message for thrown browser logins', async () => {
  desktop.auth.browserLogin.mockImplementation(() => Promise.reject(new Error('网络异常')));
  await mount();
  await act(() => dom.dispatch(q('.login-submit')[0], { type: 'click' }));
  expect(text('[role=alert].login-error')).toBe('网络异常');
});

it('marks the pending state and offers cancellation while the browser waits', async () => {
  let resolveLogin: (value: { ok: boolean; error?: string }) => void = () => {};
  desktop.auth.browserLogin.mockImplementation(() => new Promise(resolve => { resolveLogin = resolve; }));
  await mount();
  await act(() => dom.dispatch(q('.login-submit')[0], { type: 'click' }));
  expect(text('.login-submit')).toBe('等待浏览器授权…');
  expect(q('#server')[0].disabled).toBe(true);
  expect(text('.login-secondary')).toContain('取消登录');
  await act(() => dom.dispatch(q('.login-secondary')[0], { type: 'click' }));
  expect(desktop.auth.cancelBrowserLogin).toHaveBeenCalledTimes(1);
  await act(async () => { resolveLogin({ ok: false, error: '已取消' }); });
  expect(text('[role=alert].login-error')).toBe('已取消');
  expect(q('#server')[0].disabled).toBe(false);
});

it('toggles password mode, validates credentials, and submits the form', async () => {
  await mount();
  await act(() => dom.dispatch(q('.login-secondary')[0], { type: 'click' }));
  const username = q('[aria-label=用户名]')[0];
  const password = q('[aria-label=密码]')[0];
  expect(username).toBeDefined();
  expect(password.type).toBe('password');
  const submit = q('.login-submit')[1];
  expect(submit.disabled).toBe(true);
  username.value = 'alice';
  await act(() => dom.dispatch(username, { type: 'input', target: username }));
  expect(submit.disabled).toBe(true);
  password.value = 'secret';
  await act(() => dom.dispatch(password, { type: 'input', target: password }));
  expect(submit.disabled).toBe(false);
  await act(() => dom.dispatch(submit, { type: 'click' }));
  expect(desktop.auth.login).toHaveBeenCalledWith('alice', 'secret', 'https://server.test');
  expect(text('[role=status].login-success')).toBe('登录成功');
});

it('ignores plain typing on the password field', async () => {
  await mount();
  await act(() => dom.dispatch(q('.login-secondary')[0], { type: 'click' }));
  const password = q('[aria-label=密码]')[0];
  password.value = 'secret';
  await act(() => dom.dispatch(password, { type: 'input', target: password }));
  await act(() => dom.dispatch(password, { type: 'keydown', key: 'a' }));
  expect(desktop.auth.login).not.toHaveBeenCalled();
});

it('submits the password form with Enter', async () => {
  await mount();
  await act(() => dom.dispatch(q('.login-secondary')[0], { type: 'click' }));
  const username = q('[aria-label=用户名]')[0];
  const password = q('[aria-label=密码]')[0];
  username.value = 'bob';
  await act(() => dom.dispatch(username, { type: 'input', target: username }));
  password.value = 'pw';
  await act(() => dom.dispatch(password, { type: 'input', target: password }));
  await act(() => dom.dispatch(password, { type: 'keydown', key: 'Enter', nativeEvent: { isComposing: false } }));
  expect(desktop.auth.login).toHaveBeenCalledWith('bob', 'pw', 'https://server.test');
});

it('collapses the password form when toggled again', async () => {
  await mount();
  await act(() => dom.dispatch(q('.login-secondary')[0], { type: 'click' }));
  expect(q('[aria-label=密码]')).toHaveLength(1);
  await act(() => dom.dispatch(q('.login-secondary')[0], { type: 'click' }));
  expect(q('[aria-label=密码]')).toHaveLength(0);
  expect(text('.login-secondary')).toBe('使用账号密码（兼容旧服务器）');
});
