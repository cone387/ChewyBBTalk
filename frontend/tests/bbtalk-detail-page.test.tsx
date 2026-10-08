import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BBTalkDetailPage from '../src/pages/BBTalkDetailPage';
import type { BBTalk } from '../src/types';

const api = vi.hoisted(() => ({ getBBTalk: vi.fn(), getPublicBBTalk: vi.fn() }));
const boundary = vi.hoisted(() => ({
  user: { id: 1 } as { id: number } | null,
  params: { id: 'b1' } as { id?: string },
  navigate: vi.fn(),
}));
vi.mock('../src/services/api/bbtalkApi', () => ({ bbtalkApi: api }));
vi.mock('../src/services/auth', () => ({ getCurrentUser: () => boundary.user }));
vi.mock('react-router-dom', () => ({
  useParams: () => boundary.params,
  useNavigate: () => boundary.navigate,
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));
vi.mock('../src/components/BBTalkItem', () => ({
  default: ({ bbtalk, isPublic, onPreviewImage, onShareSuccess }: {
    bbtalk: BBTalk; isPublic?: boolean; onPreviewImage: (v: { src: string; alt: string }) => void; onShareSuccess: () => void;
  }) => (
    <article>
      <h2>{bbtalk.content}</h2>
      <span data-testid="is-public">{isPublic ? '公开访客' : '本人'}</span>
      <button type="button" onClick={() => onPreviewImage({ src: '/media/a.png', alt: 'a.png' })}>预览图片</button>
      <button type="button" onClick={onShareSuccess}>分享</button>
    </article>
  ),
}));
vi.mock('../src/components/ImagePreview', () => ({
  default: ({ src, onClose }: { src: string; onClose: () => void }) => (
    <div><img alt="预览图" src={src} /><button type="button" onClick={onClose}>关闭预览</button></div>
  ),
}));

function record(): BBTalk {
  return { id: 'b1', content: '私密的正文', visibility: 'private', tags: [], attachments: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: 'v1' };
}

beforeEach(() => {
  vi.resetAllMocks();
  boundary.user = { id: 1 };
  boundary.params = { id: 'b1' };
  api.getBBTalk.mockResolvedValue(record());
  api.getPublicBBTalk.mockResolvedValue({ ...record(), content: '公开的正文', visibility: 'public' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => cleanup());

function detail() {
  return render(<BBTalkDetailPage />);
}

describe('loading strategies', () => {
  it('shows the spinner while fetching', () => {
    api.getBBTalk.mockReturnValue(new Promise(() => {}));
    const view = detail();
    expect(view.getByText('加载中...')).toBeTruthy();
    expect(api.getBBTalk).toHaveBeenCalledWith('b1');
  });

  it('loads the private endpoint first for signed-in users', async () => {
    const view = detail();
    expect(await view.findByText('私密的正文')).toBeTruthy();
    expect(api.getPublicBBTalk).not.toHaveBeenCalled();
    expect(view.getByTestId('is-public').textContent).toBe('本人');
  });

  it('falls back to the public endpoint on 401, 403 and 404', async () => {
    for (const status of [401, 403, 404]) {
      api.getBBTalk.mockReset();
      api.getPublicBBTalk.mockClear();
      api.getBBTalk.mockRejectedValue(Object.assign(new Error('无权查看'), { status }));
      const view = detail();
      expect(await view.findByText('公开的正文')).toBeTruthy();
      expect(api.getPublicBBTalk).toHaveBeenCalledWith('b1');
      view.unmount();
    }
  });

  it('surfaces server errors without the public fallback', async () => {
    api.getBBTalk.mockRejectedValue(Object.assign(new Error('服务器错误'), { status: 500 }));
    const view = detail();
    expect(await view.findByRole('alert')).toBeTruthy();
    expect(view.getByRole('alert').textContent).toBe('服务器错误');
    expect(api.getPublicBBTalk).not.toHaveBeenCalled();
    view.unmount();
  });

  it('anonymous visitors only use the public endpoint', async () => {
    boundary.user = null;
    const view = detail();
    expect(await view.findByText('公开的正文')).toBeTruthy();
    expect(api.getBBTalk).not.toHaveBeenCalled();
    expect(view.getByTestId('is-public').textContent).toBe('公开访客');
  });
});

describe('failure panel', () => {
  it('offers reload, home and login destinations, then recovers', async () => {
    boundary.user = null;
    api.getPublicBBTalk.mockRejectedValueOnce(Object.assign(new Error('已删除'), { status: 404 }));
    const view = detail();
    expect(await view.findByRole('alert')).toBeTruthy();
    expect(view.getByRole('link', { name: '返回首页' }).getAttribute('href')).toBe('/public');
    expect(view.getByRole('link', { name: '前往登录' }).getAttribute('href')).toBe('/login?next=/detail/b1');
    fireEvent.click(view.getByRole('button', { name: '重新加载' }));
    expect(await view.findByText('公开的正文')).toBeTruthy();
    view.unmount();
  });

  it('points signed-in users home and uses a default message when none is given', async () => {
    api.getBBTalk.mockRejectedValueOnce(Object.assign(new Error(''), { status: 500 }));
    const view = detail();
    expect(await view.findByRole('alert')).toBeTruthy();
    expect(view.getByRole('alert').textContent).toBe('加载失败，请检查网络后重试');
    expect(view.getByRole('link', { name: '返回首页' }).getAttribute('href')).toBe('/');
    expect(view.queryByRole('link', { name: '前往登录' })).toBeNull();
  });

  it('rejects a missing id outright', async () => {
    boundary.params = {};
    const view = detail();
    expect(await view.findByText('无效的 BBTalk ID')).toBeTruthy();
    expect(api.getBBTalk).not.toHaveBeenCalled();
  });
});

describe('record interactions', () => {
  it('navigates back, opens and closes the image preview', async () => {
    history.pushState({}, '', '/somewhere'); // ensures history.length > 1
    const view = detail();
    await view.findByText('私密的正文');
    fireEvent.click(view.getByRole('button', { name: '返回' }));
    expect(boundary.navigate).toHaveBeenCalledWith(-1);
    fireEvent.click(view.getByRole('button', { name: '预览图片' }));
    expect(await view.findByRole('img')).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: '关闭预览' }));
    await waitFor(() => expect(view.queryByRole('img')).toBeNull());
  });

  it('shows the copy toast after a successful share', async () => {
    const view = detail();
    await view.findByText('私密的正文');
    fireEvent.click(view.getByRole('button', { name: '分享' }));
    expect(view.getByText('链接已复制')).toBeTruthy();
    await waitFor(() => expect(view.queryByText('链接已复制')).toBeNull(), { timeout: 2500 });
  });
});
