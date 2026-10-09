import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const boundary = vi.hoisted(() => ({ initAuth: vi.fn() }));
vi.mock('../src/services/auth', () => ({
  initAuth: boundary.initAuth,
  getCurrentUser: () => null,
  getAccessToken: () => 'token',
  refreshAccessToken: vi.fn(),
  logout: vi.fn(),
}));
vi.mock('../src/pages/BBTalkPage', () => ({ default: () => <div>私有主页</div> }));
vi.mock('../src/pages/PublicBBTalkPage', () => ({ default: () => <div>公开主页</div> }));
vi.mock('../src/pages/BBTalkDetailPage', () => ({ default: () => <div>详情页</div> }));
vi.mock('../src/pages/LoginPage', () => ({ default: () => <div>登录页</div> }));
vi.mock('../src/pages/DesktopAuthorizePage', () => ({ default: () => <div>桌面授权页</div> }));
vi.mock('../src/pages/PrivacyLockPage', () => ({ default: () => <div>锁定页</div> }));
vi.mock('../src/pages/SettingsPage', () => ({ default: () => <div>设置页</div> }));
vi.mock('../src/pages/PrivacySettingsPage', () => ({ default: () => <div>隐私设置页</div> }));
vi.mock('../src/pages/StorageSettingsPage', () => ({ default: () => <div>存储设置页</div> }));
vi.mock('../src/pages/S3ConfigListPage', () => ({ default: () => <div>S3配置页</div> }));
vi.mock('../src/pages/DataManagementPage', () => ({ default: () => <div>数据管理页</div> }));
vi.mock('../src/pages/StatusPage', () => ({ default: () => <div>状态页</div> }));

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  boundary.initAuth.mockResolvedValue(true);
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { value: vi.fn(), configurable: true });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  history.pushState({}, '', '/');
  delete (window as { __POWERED_BY_WUJIE__?: boolean }).__POWERED_BY_WUJIE__;
});

async function mountApp() {
  const { default: App } = await import('../src/App');
  return render(<App />);
}

describe('authentication bootstrap', () => {
  it('waits for the auth probe before rendering the private home', async () => {
    let finish!: (value: boolean) => void;
    boundary.initAuth.mockReturnValue(new Promise<boolean>(resolve => { finish = resolve; }));
    const view = await mountApp();
    expect(view.getByText('加载中...')).toBeTruthy();
    expect(boundary.initAuth).toHaveBeenCalledTimes(1);
    await waitFor(() => finish(true));
    expect(await view.findByText('私有主页')).toBeTruthy();
  });

  it('sends unauthenticated visitors from protected roots to the login page', async () => {
    boundary.initAuth.mockResolvedValue(false);
    const view = await mountApp();
    expect(await view.findByText('登录页')).toBeTruthy();
    expect(view.queryByText('私有主页')).toBeNull();
  });

  it('treats an auth probe crash as signed out', async () => {
    boundary.initAuth.mockRejectedValue(new Error('token 解析失败'));
    const view = await mountApp();
    expect(await view.findByText('登录页')).toBeTruthy();
  });

  it('trusts the host app in wujie micro-frontend mode without probing', async () => {
    (window as { __POWERED_BY_WUJIE__?: boolean }).__POWERED_BY_WUJIE__ = true;
    const view = await mountApp();
    expect(await view.findByText('私有主页')).toBeTruthy();
    expect(boundary.initAuth).not.toHaveBeenCalled();
  });
});

describe('routing', () => {
  it('sends a locked authenticated login visit to unlock without a return URL', async () => {
    localStorage.setItem('bbtalk_privacy_mode', 'true');
    history.pushState({}, '', '/login');
    const view = await mountApp();
    expect(await view.findByText('锁定页')).toBeTruthy();
    expect(window.location.pathname).toBe('/locked');
    expect(window.location.search).toBe('');
  });
  it.each([
    ['/login', '/', '私有主页'],
    ['/login?next=https%3A%2F%2Fevil.example', '/', '私有主页'],
    ['/login?next=%2Fdesktop%2Fauthorize%3Fstate%3Dabc', '/desktop/authorize', '桌面授权页'],
  ])('redirects an authenticated visit to %s', async (path, destination, marker) => {
    history.pushState({}, '', path);
    const view = await mountApp();
    expect(await view.findByText(marker)).toBeTruthy();
    expect(window.location.pathname).toBe(destination);
    expect(view.queryByText('登录页')).toBeNull();
    if (destination === '/desktop/authorize') expect(window.location.search).toBe('?state=abc');
  });

  it('keeps authenticated login redirects behind the privacy lock', async () => {
    localStorage.setItem('bbtalk_privacy_mode', 'true');
    history.pushState({}, '', '/login?next=%2Fdesktop%2Fauthorize%3Fstate%3Dabc');
    const view = await mountApp();
    expect(await view.findByText('锁定页')).toBeTruthy();
    expect(window.location.pathname).toBe('/locked');
    expect(new URLSearchParams(window.location.search).get('next')).toBe('/desktop/authorize?state=abc');
    expect(view.queryByText('桌面授权页')).toBeNull();
  });

  it('serves public routes to anonymous visitors', async () => {
    boundary.initAuth.mockResolvedValue(false);
    history.pushState({}, '', '/public');
    let view = await mountApp();
    expect(await view.findByText('公开主页')).toBeTruthy();
    view.unmount();

    history.pushState({}, '', '/detail/abc');
    view = await mountApp();
    expect(await view.findByText('详情页')).toBeTruthy();
    view.unmount();

    history.pushState({}, '', '/desktop/authorize');
    view = await mountApp();
    expect(await view.findByText('桌面授权页')).toBeTruthy();
    view.unmount();

    history.pushState({}, '', '/locked');
    view = await mountApp();
    expect(await view.findByText('锁定页')).toBeTruthy();
  });

  it('maps every settings route to its page for authenticated users', async () => {
    const routes: Array<[string, RegExp]> = [
      ['/', /私有主页/],
      ['/settings', /设置页/],
      ['/settings/privacy', /隐私设置页/],
      ['/settings/storage', /存储设置页/],
      ['/settings/storage/s3', /S3配置页/],
      ['/settings/data', /数据管理页/],
      ['/settings/status', /状态页/],
      ['/bbtalk/z9', /详情页/],
      ['/locked', /锁定页/],
    ];
    for (const [path, marker] of routes) {
      history.pushState({}, '', path);
      const view = await mountApp();
      expect(await view.findByText(marker)).toBeTruthy();
      view.unmount();
    }
  });

  it('redirects anonymous visitors away from nested settings routes', async () => {
    boundary.initAuth.mockResolvedValue(false);
    for (const path of ['/settings', '/settings/privacy', '/settings/storage', '/settings/storage/s3', '/settings/data', '/settings/status']) {
      history.pushState({}, '', path);
      const view = await mountApp();
      expect(await view.findByText('登录页')).toBeTruthy();
      view.unmount();
    }
  });
});

describe('privacy gate', () => {
  it('redirects a locked session to the lock page, preserving desktop authorize intent', async () => {
    localStorage.setItem('bbtalk_privacy_mode', 'true');
    history.pushState({}, '', '/settings');
    const view = await mountApp();
    await waitFor(() => expect(window.location.pathname).toBe('/locked'));
    expect(await view.findByText('锁定页')).toBeTruthy();
    view.unmount();

    history.pushState({}, '', '/desktop/authorize?client_id=abc');
    const second = await mountApp();
    await waitFor(() => expect(window.location.pathname).toBe('/locked'));
    expect(window.location.search).toContain(`next=${encodeURIComponent('/desktop/authorize?client_id=abc')}`);
    expect(await second.findByText('锁定页')).toBeTruthy();
  });

  it('does not redirect when the lock page is already active', async () => {
    localStorage.setItem('bbtalk_privacy_mode', 'true');
    history.pushState({}, '', '/locked');
    const view = await mountApp();
    expect(await view.findByText('锁定页')).toBeTruthy();
    expect(window.location.pathname).toBe('/locked');
  });
});
