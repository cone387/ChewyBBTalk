import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from '../src/pages/SettingsPage';

const auth = vi.hoisted(() => ({
  logout: vi.fn(),
  user: null as { id: number; username: string; display_name: string; email?: string; avatar?: string } | null,
}));
const boundary = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('../src/services/auth', () => ({ getCurrentUser: () => auth.user, logout: auth.logout }));
vi.mock('react-router-dom', () => ({ useNavigate: () => boundary.navigate }));

beforeEach(() => {
  vi.resetAllMocks();
  auth.user = { id: 1, username: 'alice', display_name: '爱丽丝', email: 'alice@example.com' };
  auth.logout.mockResolvedValue(undefined);
});
afterEach(() => cleanup());

describe('profile card', () => {
  it('shows display name, email and the avatar initial', () => {
    render(<SettingsPage />);
    expect(screen.getByText('爱丽丝')).toBeTruthy();
    expect(screen.getByText('alice@example.com')).toBeTruthy();
    expect(screen.getByText('爱')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('renders a photo avatar and falls back to the handle', () => {
    auth.user = { id: 2, username: 'bob', display_name: '', avatar: '/avatar.png' };
    render(<SettingsPage />);
    expect(screen.getByRole('img').getAttribute('src')).toBe('/avatar.png');
    expect(screen.getByText('bob')).toBeTruthy();
    expect(screen.getByText('@bob')).toBeTruthy();
  });

  it('uses the username initial when neither photo nor display name is available', () => {
    auth.user = { id: 3, username: 'carol', display_name: '' };
    render(<SettingsPage />);
    expect(screen.getByText('C')).toBeTruthy();
    expect(screen.getByText('carol')).toBeTruthy();
    expect(screen.getByText('@carol')).toBeTruthy();
  });

  it('hides account surfaces for signed-out visitors', () => {
    auth.user = null;
    render(<SettingsPage />);
    expect(screen.queryByText('退出登录')).toBeNull();
    expect(screen.getByText('我的')).toBeTruthy();
  });
});

describe('navigation', () => {
  it('links to every settings section and back to the feed', () => {
    render(<SettingsPage />);
    const destinations: Array<[string, string]> = [
      ['防窥设置', '/settings/privacy'],
      ['存储设置', '/settings/storage'],
      ['数据管理', '/settings/data'],
      ['运行状态', '/settings/status'],
    ];
    for (const [label, target] of destinations) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(label) }));
      expect(boundary.navigate).toHaveBeenLastCalledWith(target);
    }
    fireEvent.click(screen.getByLabelText('返回记录'));
    expect(boundary.navigate).toHaveBeenLastCalledWith('/');
  });
});

describe('signing out', () => {
  it('asks for confirmation, then logs out', async () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: '退出登录' }));
    const dialog = await screen.findByRole('dialog', { name: '退出登录' });
    expect(within(dialog).getByText('确定退出当前账号？')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(auth.logout).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '退出登录' }));
    const second = await screen.findByRole('dialog', { name: '退出登录' });
    fireEvent.click(within(second).getByRole('button', { name: '退出登录' }));
    await waitFor(() => expect(auth.logout).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('offers a retry when the logout request fails', async () => {
    auth.logout.mockRejectedValue(new Error('会话已过期'));
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: '退出登录' }));
    const dialog = await screen.findByRole('dialog', { name: '退出登录' });
    fireEvent.click(within(dialog).getByRole('button', { name: '退出登录' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('会话已过期');
    // While the dialog stays open its confirm button turns into the retry control.
    auth.logout.mockResolvedValue(undefined);
    fireEvent.click(within(screen.getByRole('dialog', { name: '退出登录' })).getByRole('button', { name: '重试操作' }));
    await waitFor(() => expect(auth.logout).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
