import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import PrivacyLockPage from '../src/pages/PrivacyLockPage';
import bbtalkReducer from '../src/store/slices/bbtalkSlice';

const auth = vi.hoisted(() => ({
  verify: vi.fn(),
  user: { id: 1, username: 'alice', display_name: 'Alice' } as { id: number; username: string; display_name: string } | null,
}));
const api = vi.hoisted(() => ({ createBBTalk: vi.fn() }));
const boundary = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('../src/services/auth', () => ({ verifyPassword: auth.verify, getCurrentUser: () => auth.user }));
vi.mock('../src/services/api', () => ({ bbtalkApi: api }));
vi.mock('react-router-dom', () => ({ useNavigate: () => boundary.navigate }));
vi.mock('../src/components/BBTalkEditor', () => ({
  default: ({ onPublish }: { onPublish: (data: unknown) => Promise<void> }) => (
    <button type="button" onClick={() => onPublish({
      content: '锁定时发布', tags: [], attachments: [], visibility: 'private',
    }).catch(() => {})}>锁定发布</button>
  ),
}));

function createdRecord(content: string) {
  return { id: 'n1', content, visibility: 'private' as const, tags: [], attachments: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: 'v1' };
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  localStorage.setItem('bbtalk_privacy_mode', 'true');
  localStorage.setItem('bbtalk_privacy_timestamp', '12345');
  auth.user = { id: 1, username: 'alice', display_name: 'Alice' };
  auth.verify.mockResolvedValue({ success: true });
  api.createBBTalk.mockImplementation(async (data: { content: string }) => createdRecord(data.content));
  Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true, writable: true });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, 'credentials', { value: undefined, configurable: true });
  history.pushState({}, '', '/');
});

function lockPage() {
  const store = configureStore({ reducer: { bbtalk: bbtalkReducer } });
  return render(<Provider store={store}><PrivacyLockPage /></Provider>);
}
function supportBiometric(available = true) {
  const create = vi.fn().mockResolvedValue({ id: 'cred' });
  vi.stubGlobal('PublicKeyCredential', Object.assign(class PublicKeyCredentialStub {}, {
    isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(available),
  }));
  Object.defineProperty(navigator, 'credentials', { value: { create }, configurable: true });
  return create;
}
function passwordField() { return screen.getByPlaceholderText('请输入密码以继续') as HTMLInputElement; }

describe('gate keeping', () => {
  it('redirects home immediately when privacy mode is not armed', async () => {
    localStorage.removeItem('bbtalk_privacy_mode');
    lockPage();
    await waitFor(() => expect(boundary.navigate).toHaveBeenCalledWith('/', { replace: true }));
  });

  it('honours a desktop authorize continuation and rejects other targets', async () => {
    history.pushState({}, '', '/locked?next=/desktop/authorize?client_id=abc');
    lockPage();
    await waitFor(() => expect(passwordField()).toBeTruthy());
    fireEvent.change(passwordField(), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: '解锁' }));
    await waitFor(() => expect(boundary.navigate).toHaveBeenCalledWith('/desktop/authorize?client_id=abc', { replace: true }));
    expect(localStorage.getItem('bbtalk_privacy_mode')).toBeNull();
    expect(localStorage.getItem('bbtalk_privacy_timestamp')).toBeNull();
  });
});

describe('password unlock', () => {
  it('requires a non-empty password', () => {
    lockPage();
    fireEvent.click(screen.getByRole('button', { name: '解锁' }));
    expect(screen.getByText('请输入密码')).toBeTruthy();
    expect(auth.verify).not.toHaveBeenCalled();
  });

  it('explains wrong passwords and transport failures', async () => {
    lockPage();
    auth.verify.mockResolvedValue({ success: false, error: '密码不正确' });
    fireEvent.change(passwordField(), { target: { value: 'bad' } });
    fireEvent.click(screen.getByRole('button', { name: '解锁' }));
    expect(await screen.findByText('密码不正确')).toBeTruthy();
    expect(boundary.navigate).not.toHaveBeenCalled();
    auth.verify.mockRejectedValue(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: '解锁' }));
    expect(await screen.findByText('验证失败，请重试')).toBeTruthy();
    expect(boundary.navigate).not.toHaveBeenCalled();
  });

  it('unlocks after a successful verification', async () => {
    lockPage();
    fireEvent.change(passwordField(), { target: { value: 'correct' } });
    fireEvent.click(screen.getByRole('button', { name: '解锁' }));
    await waitFor(() => expect(auth.verify).toHaveBeenCalledWith('correct'));
    await waitFor(() => expect(boundary.navigate).toHaveBeenCalledWith('/', { replace: true }));
    expect(localStorage.getItem('bbtalk_privacy_mode')).toBeNull();
  });
});

describe('biometric unlock', () => {
  it('unlocks through a created platform credential on desktop', async () => {
    const create = supportBiometric(true);
    lockPage();
    fireEvent.click(await screen.findByTitle('指纹/面容解锁'));
    await waitFor(() => expect(boundary.navigate).toHaveBeenCalledWith('/', { replace: true }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      publicKey: expect.objectContaining({
        rp: expect.objectContaining({ name: 'BBTalk' }),
        attestation: 'none',
      }),
    }));
    expect(localStorage.getItem('bbtalk_privacy_mode')).toBeNull();
  });

  it('maps authenticator errors to guidance and drops support when unsupported', async () => {
    supportBiometric(true);
    lockPage();
    const button = await screen.findByTitle('指纹/面容解锁');
    Object.defineProperty(navigator, 'credentials', {
      value: { create: vi.fn().mockRejectedValue(Object.assign(new Error('cancel'), { name: 'NotAllowedError' })) },
      configurable: true,
    });
    fireEvent.click(button);
    expect(await screen.findByText('验证已取消')).toBeTruthy();
    Object.defineProperty(navigator, 'credentials', {
      value: { create: vi.fn().mockRejectedValue(Object.assign(new Error('secure'), { name: 'SecurityError' })) },
      configurable: true,
    });
    fireEvent.click(button);
    expect(await screen.findByText('安全错误，请使用密码解锁')).toBeTruthy();
    Object.defineProperty(navigator, 'credentials', {
      value: { create: vi.fn().mockResolvedValue(null) },
      configurable: true,
    });
    fireEvent.click(button);
    expect(await screen.findByText('生物识别验证失败')).toBeTruthy();
    Object.defineProperty(navigator, 'credentials', {
      value: { create: vi.fn().mockRejectedValue(Object.assign(new Error('boom'), { name: 'UnknownError' })) },
      configurable: true,
    });
    fireEvent.click(button);
    expect(await screen.findByText('验证失败，请使用密码解锁')).toBeTruthy();
    Object.defineProperty(navigator, 'credentials', {
      value: { create: vi.fn().mockRejectedValue(Object.assign(new Error('nope'), { name: 'NotSupportedError' })) },
      configurable: true,
    });
    fireEvent.click(button);
    expect(await screen.findByText('设备不支持生物识别')).toBeTruthy();
    await waitFor(() => expect(screen.queryByTitle('指纹/面容解锁')).toBeNull());
    expect(boundary.navigate).not.toHaveBeenCalled();
  });

  it('requires a signed-in user before prompting the authenticator', async () => {
    supportBiometric(true);
    auth.user = null;
    lockPage();
    fireEvent.click(await screen.findByTitle('指纹/面容解锁'));
    expect(await screen.findByText('用户未登录')).toBeTruthy();
  });

  it('hides the biometric affordance when the platform check says no', async () => {
    supportBiometric(false);
    lockPage();
    await waitFor(() => expect(screen.queryByTitle('指纹/面容解锁')).toBeNull());
  });
});

describe('mobile layout', () => {
  it('auto-prompts biometric verification after render', async () => {
    const create = supportBiometric(true);
    Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true, writable: true });
    lockPage();
    expect(await screen.findByText('面容/指纹解锁')).toBeTruthy();
    expect(screen.getByText('或使用密码')).toBeTruthy();
    expect(screen.getByPlaceholderText('输入密码')).toBeTruthy();
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1), { timeout: 2000 });
    await waitFor(() => expect(boundary.navigate).toHaveBeenCalledWith('/', { replace: true }));
  });

  it('does not auto-prompt when the platform lacks support', async () => {
    supportBiometric(false);
    Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true, writable: true });
    lockPage();
    await new Promise(resolve => setTimeout(resolve, 700));
    expect(boundary.navigate).not.toHaveBeenCalled();
  });
});

describe('publishing while locked', () => {
  it('confirms a successful record and stays on the lock page', async () => {
    lockPage();
    fireEvent.click(screen.getByText('锁定发布'));
    expect(await screen.findByText('发布成功')).toBeTruthy();
    expect(api.createBBTalk).toHaveBeenCalledWith(expect.objectContaining({ content: '锁定时发布' }));
    expect(boundary.navigate).not.toHaveBeenCalled();
  });

  it('propagates publishing failures without claiming success', async () => {
    api.createBBTalk.mockRejectedValue(new Error('容量已满'));
    lockPage();
    fireEvent.click(screen.getByText('锁定发布'));
    await waitFor(() => expect(api.createBBTalk).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('发布成功')).toBeNull();
    expect(boundary.navigate).not.toHaveBeenCalled();
  });
});
