import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import LoginPage from '../src/pages/LoginPage';

const auth = vi.hoisted(() => ({ login: vi.fn(), register: vi.fn(), getAuthPolicy: vi.fn() }));
vi.mock('../src/services/auth', () => auth);

beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  auth.getAuthPolicy.mockResolvedValue({ registration_enabled: true });
  auth.login.mockResolvedValue({ success: false, error: '凭证不正确' });
  auth.register.mockResolvedValue({ success: false, error: '用户名已存在' });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
async function page() {
  const view = render(<LoginPage />);
  await screen.findByRole('button', { name: '创建新账户' });
  return view;
}
function credentials() {
  fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'alice' } });
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'secret' } });
}
function submit() { fireEvent.submit(screen.getByLabelText('密码').closest('form')!); }

it('restores only the remembered username, never a password', async () => {
  localStorage.setItem('bbtalk_saved_username', 'alice');
  await page();
  expect((screen.getByLabelText('用户名') as HTMLInputElement).value).toBe('alice');
  expect((screen.getByLabelText('密码') as HTMLInputElement).value).toBe('');
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
});
it('honors the opt-out even when an older saved username exists', async () => {
  localStorage.setItem('bbtalk_remember_username', 'false');
  localStorage.setItem('bbtalk_saved_username', 'alice');
  await page();
  expect((screen.getByLabelText('用户名') as HTMLInputElement).value).toBe('');
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
});
it('does not send an incomplete form to the server', async () => {
  await page(); submit();
  expect(await screen.findByText('请输入用户名和密码')).toBeTruthy();
  expect(auth.login).not.toHaveBeenCalled();
});
it('keeps login usable when registration policy is unavailable and allows retry', async () => {
  auth.getAuthPolicy.mockRejectedValueOnce(new Error('offline'));
  render(<LoginPage />);
  fireEvent.click(await screen.findByRole('button', { name: '重试读取注册设置' }));
  await screen.findByRole('button', { name: '创建新账户' });
  expect(auth.getAuthPolicy).toHaveBeenCalledTimes(2);
  credentials(); submit();
  expect(await screen.findByText('凭证不正确')).toBeTruthy();
});
it('hides registration when the server disables it', async () => {
  auth.getAuthPolicy.mockResolvedValue({ registration_enabled: false });
  render(<LoginPage />);
  await screen.findByText('当前服务未开放注册，请联系管理员');
  expect(screen.queryByRole('button', { name: '创建新账户' })).toBeNull();
  credentials(); submit();
  await waitFor(() => expect(auth.login).toHaveBeenCalledWith('alice', 'secret'));
});
it('aborts policy loading on unmount and ignores its late result', async () => {
  let finish!: (value: { registration_enabled: boolean }) => void;
  auth.getAuthPolicy.mockImplementation(signal => {
    expect(signal.aborted).toBe(false);
    return new Promise(resolve => { finish = resolve; });
  });
  const view = render(<LoginPage />);
  const signal = auth.getAuthPolicy.mock.calls[0][0] as AbortSignal;
  view.unmount(); expect(signal.aborted).toBe(true);
  await act(async () => { finish({ registration_enabled: true }); });
});
it('disables all credentials and rejects a second submission while login is pending', async () => {
  auth.login.mockReturnValue(new Promise(() => {}));
  await page(); credentials(); submit(); submit();
  expect((screen.getByLabelText('用户名') as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByLabelText('密码') as HTMLInputElement).disabled).toBe(true);
  expect(auth.login).toHaveBeenCalledTimes(1);
});
it.each([false, true])('saves username according to remember=%s and clears the previous privacy lock', async remember => {
  auth.login.mockResolvedValue({ success: true });
  await page(); credentials();
  if (!remember) fireEvent.click(screen.getByRole('checkbox'));
  localStorage.setItem('bbtalk_privacy_mode', 'true');
  localStorage.setItem('bbtalk_privacy_timestamp', '123');
  await act(async () => submit());
  expect(screen.getByText('登录成功！')).toBeTruthy();
  expect(localStorage.getItem('bbtalk_saved_username')).toBe(remember ? 'alice' : null);
  expect(localStorage.getItem('bbtalk_privacy_mode')).toBeNull();
  expect(localStorage.getItem('bbtalk_privacy_timestamp')).toBeNull();
  expect((screen.getByLabelText('密码') as HTMLInputElement).disabled).toBe(true);
  submit(); expect(auth.login).toHaveBeenCalledTimes(1);
});
it('clears stale validation errors when switching to registration', async () => {
  await page(); submit();
  expect(screen.getByText('请输入用户名和密码')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '创建新账户' }));
  expect(screen.queryByText('请输入用户名和密码')).toBeNull();
  expect(screen.getByLabelText(/邮箱/)).toBeTruthy();
  expect(screen.queryByRole('checkbox')).toBeNull();
});
it.each([false, true])('sends registration optional fields only when entered: %s', async filled => {
  await page(); fireEvent.click(screen.getByRole('button', { name: '创建新账户' }));
  credentials();
  if (filled) {
    fireEvent.change(screen.getByLabelText(/邮箱/), { target: { value: 'alice@example.com' } });
    fireEvent.change(screen.getByLabelText(/显示名称/), { target: { value: 'Alice' } });
  }
  submit(); await screen.findByText('用户名已存在');
  expect(auth.register).toHaveBeenCalledWith({ username: 'alice', password: 'secret',
    email: filled ? 'alice@example.com' : undefined, display_name: filled ? 'Alice' : undefined });
  expect(auth.login).not.toHaveBeenCalled();
});
it('new registration also clears the previous account privacy lock', async () => {
  auth.register.mockResolvedValue({ success: true });
  await page(); fireEvent.click(screen.getByRole('button', { name: '创建新账户' })); credentials();
  localStorage.setItem('bbtalk_privacy_mode', 'true');
  localStorage.setItem('bbtalk_privacy_timestamp', '123');
  await act(async () => submit());
  expect(screen.getByText('注册成功！')).toBeTruthy();
  expect(localStorage.getItem('bbtalk_privacy_mode')).toBeNull();
  expect(localStorage.getItem('bbtalk_privacy_timestamp')).toBeNull();
});
it('cancels the pending redirect when the page unmounts', async () => {
  auth.login.mockResolvedValue({ success: true });
  const view = await page(); credentials();
  const schedule = vi.spyOn(window, 'setTimeout');
  const clear = vi.spyOn(window, 'clearTimeout');
  await act(async () => submit());
  const redirectIndex = schedule.mock.calls.findIndex(call => call[1] === 800);
  expect(redirectIndex).toBeGreaterThanOrEqual(0);
  const redirect = schedule.mock.results[redirectIndex].value;
  view.unmount();
  expect(clear).toHaveBeenCalledWith(redirect);
});
it('ignores authentication UI side effects if its request completes after unmount', async () => {
  let finish!: (value: { success: boolean }) => void;
  auth.login.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const view = await page(); credentials(); submit(); view.unmount();
  localStorage.setItem('bbtalk_privacy_mode', 'true');
  const schedule = vi.spyOn(window, 'setTimeout');
  await act(async () => finish({ success: true }));
  expect(localStorage.getItem('bbtalk_privacy_mode')).toBe('true');
  expect(localStorage.getItem('bbtalk_saved_username')).toBeNull();
  expect(schedule.mock.calls.some(call => call[1] === 800)).toBe(false);
});
it('shows a useful fallback and re-enables the form after an unexpected failure', async () => {
  auth.login.mockRejectedValue(new Error('network failed'));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await page(); credentials(); submit();
  await screen.findByText('操作失败，请稍后重试');
  expect((screen.getByRole('button', { name: '登录' }) as HTMLButtonElement).disabled).toBe(false);
});
