import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DesktopAuthorizePage from '../src/pages/DesktopAuthorizePage';

const auth = vi.hoisted(() => ({ user: null as { id: number; username: string; display_name?: string } | null }));
const client = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('../src/services/auth', () => ({ getCurrentUser: () => auth.user }));
vi.mock('../src/services/api/apiClient', () => ({ apiClient: client }));

const challenge = 'a'.repeat(43);
const state = 'b'.repeat(43);
const validUri = 'http://127.0.0.1:8765/callback';

let assign: ReturnType<typeof vi.fn>;
function visit(query: string) {
  window.history.pushState({}, '', `/desktop/authorize${query}`);
  return render(<DesktopAuthorizePage />);
}
function validQuery(overrides: Record<string, string | null> = {}) {
  const params = new URLSearchParams({
    redirect_uri: validUri, state, code_challenge: challenge, code_challenge_method: 'S256', ...overrides,
  });
  return `?${params.toString()}`;
}

const realLocation = window.location;
beforeEach(() => {
  vi.resetAllMocks();
  auth.user = { id: 1, username: 'alice', display_name: '爱丽丝' };
  client.post.mockResolvedValue({ code: 'auth-code' });
  assign = vi.fn();
  Object.defineProperty(window, 'location', {
    value: {
      get search() { return realLocation.search; },
      get pathname() { return realLocation.pathname; },
      get href() { return realLocation.href; },
      assign,
    },
    writable: true,
    configurable: true,
  });
});
afterEach(() => {
  cleanup();
  window.history.pushState({}, '', '/');
});

describe('request validation', () => {
  it('rejects missing or malformed redirect targets without navigating', () => {
    visit('');
    expect(screen.getByRole('alert').textContent).toContain('授权链接无效');
    expect(assign).not.toHaveBeenCalled();
  });

  it.each([
    ['non-local host', validQuery({ redirect_uri: 'http://localhost:8765/callback' })],
    ['https scheme', validQuery({ redirect_uri: 'https://127.0.0.1:8765/callback' })],
    ['privileged port', validQuery({ redirect_uri: 'http://127.0.0.1:80/callback' })],
    ['wrong path', validQuery({ redirect_uri: 'http://127.0.0.1:8765/elsewhere' })],
    ['query suffix', validQuery({ redirect_uri: 'http://127.0.0.1:8765/callback?x=1' })],
    ['hash suffix', validQuery({ redirect_uri: 'http://127.0.0.1:8765/callback#top' })],
    ['embedded credentials', validQuery({ redirect_uri: 'http://user:pass@127.0.0.1:8765/callback' })],
    ['weak challenge method', validQuery({ code_challenge_method: 'plain' })],
    ['short challenge', validQuery({ code_challenge: 'too-short' })],
    ['short state', validQuery({ state: 'too-short' })],
  ])('rejects a %s', (_name, query) => {
    visit(query as string);
    expect(screen.getByRole('alert').textContent).toContain('授权链接无效');
    expect(screen.queryByRole('button', { name: '确认登录桌面端' })).toBeNull();
  });
});

describe('signed-out visitors', () => {
  it('points the login link back at the authorize URL', () => {
    auth.user = null;
    visit(validQuery());
    const login = screen.getByRole('link', { name: '登录并继续' }) as HTMLAnchorElement;
    expect(decodeURIComponent(login.getAttribute('href')!)).toBe(`/login?next=/desktop/authorize${validQuery()}`);
    expect(screen.queryByRole('button', { name: '确认登录桌面端' })).toBeNull();
  });
});

describe('authorization flow', () => {
  it('greets the user and hands the code back to the desktop app', async () => {
    visit(validQuery());
    expect(screen.getByText('使用 爱丽丝 登录桌面端，随时记录和上传附件。')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '确认登录桌面端' }));
    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    expect(client.post).toHaveBeenCalledWith('/api/v1/bbtalk/auth/desktop/authorize', {
      redirect_uri: validUri, code_challenge: challenge, code_challenge_method: 'S256',
    });
    const [target, params] = parseAssignCall();
    expect(target).toBe(`${validUri}?${new URLSearchParams({ code: 'auth-code', state }).toString()}`);
    expect(params.get('state')).toBe(state);
    expect(params.get('code')).toBe('auth-code');
  });

  it('falls back to the username when no display name exists', () => {
    auth.user = { id: 2, username: 'bob' };
    visit(validQuery());
    expect(screen.getByText('使用 bob 登录桌面端，随时记录和上传附件。')).toBeTruthy();
  });

  it('reports authorization failures and stays on the page', async () => {
    client.post.mockRejectedValue(new Error('会话已过期'));
    visit(validQuery());
    fireEvent.click(screen.getByRole('button', { name: '确认登录桌面端' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('会话已过期');
    expect((screen.getByRole('button', { name: '确认登录桌面端' }) as HTMLButtonElement).disabled).toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });

  it('surfaces non-error rejections with a generic message', async () => {
    client.post.mockRejectedValue('gateway timeout');
    visit(validQuery());
    fireEvent.click(screen.getByRole('button', { name: '确认登录桌面端' }));
    expect(await screen.findByText('授权失败，请重试')).toBeTruthy();
  });

  it('returns an access_denied error when the user cancels', () => {
    visit(validQuery());
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(assign).toHaveBeenCalledTimes(1);
    const [target, params] = parseAssignCall();
    expect(target).toBe(`${validUri}?${new URLSearchParams({ error: 'access_denied', state }).toString()}`);
    expect(params.get('error')).toBe('access_denied');
  });
});

function parseAssignCall(): [string, URLSearchParams] {
  const target = assign.mock.calls[0][0] as string;
  const url = new URL(target);
  return [target, url.searchParams];
}
