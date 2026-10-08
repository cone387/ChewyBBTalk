import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BBTalkItem from '../src/components/BBTalkItem';
import type { BBTalk, Comment } from '../src/types';

const api = vi.hoisted(() => ({ getComments: vi.fn(), createComment: vi.fn(), deleteComment: vi.fn() }));
vi.mock('../src/services/api', () => ({ bbtalkApi: api }));
vi.mock('../src/components/MarkdownRenderer', () => ({
  default: ({ content, search }: { content: string; search?: string }) => (
    <div data-markdown data-search={search ?? ''}>{content}</div>
  ),
}));
vi.mock('../src/components/CachedImage', () => ({
  default: ({ src, alt, onClick }: { src: string; alt?: string; onClick?: () => void }) => (
    <button type="button" data-testid="cached-image" data-src={src} onClick={onClick}>{alt}</button>
  ),
}));
vi.mock('react-router-dom', () => ({ useHref: (path: string) => path }));

const now = Date.now();
function item(overrides: Partial<BBTalk> = {}): BBTalk {
  return {
    id: 'b1', content: '今天的记录', visibility: 'private', tags: [], attachments: [],
    createdAt: new Date(now - 30 * 1000).toISOString(), updatedAt: new Date(now).toISOString(),
    commentCount: 0, ...overrides,
  };
}
function comment(uid: string, minutesAgo = 1): Comment {
  return {
    uid, user: 1, userDisplayName: '用户' + uid, userAvatar: '', userUsername: 'user' + uid,
    content: '评论' + uid, createdAt: new Date(now - minutesAgo * 60000).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };
}
function withClipboard(value: Pick<Clipboard, 'writeText'> | undefined) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true });
}

beforeEach(() => {
  vi.resetAllMocks();
  withClipboard(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { cleanup(); withClipboard(undefined); });

describe('metadata rendering', () => {
  it('highlights search keywords, tags, and formats just-now timestamps', () => {
    render(<BBTalkItem bbtalk={item({ tags: [{ id: 't1', name: '工作', color: '' }] })} searchKeyword="记录" />);
    expect(screen.getByText('今天的记录')).toBeTruthy();
    expect(screen.getByText('工作')).toBeTruthy();
    expect(screen.getByText('刚刚')).toBeTruthy();
    expect(screen.getByText('刚刚').closest('span')?.hasAttribute('title')).toBe(true);
  });

  it.each([
    [70 * 60000, '1 小时前'],
    [3 * 86400000, '3 天前'],
    [40 * 86400000, ''],
  ])('renders relative time for %sms ago', (ago, expected) => {
    render(<BBTalkItem bbtalk={item({ createdAt: new Date(now - ago).toISOString() })} />);
    if (expected) expect(screen.getByText(expected)).toBeTruthy();
    else expect(screen.queryByText('刚刚')).toBeNull();
  });

  it('derives source client, mobile platform and location from context', () => {
    render(<BBTalkItem bbtalk={item({
      context: { source: { client: 'Desktop', platform: 'iOS' }, location: { latitude: 31.2, longitude: 121.5 } },
    })} />);
    expect(screen.getByTitle('手机')).toBeTruthy();
    expect(screen.getByText('纬度: 31.200000')).toBeTruthy();
    expect(screen.getByText('经度: 121.500000')).toBeTruthy();
  });

  it('falls back through legacy context shapes to Web', () => {
    const { rerender } = render(<BBTalkItem bbtalk={item({ context: '旧客户端' })} />);
    expect(screen.getByTitle('旧客户端')).toBeTruthy();
    rerender(<BBTalkItem bbtalk={item({ context: { client: 'CustomClient' } })} />);
    expect(screen.getByTitle('CustomClient')).toBeTruthy();
    rerender(<BBTalkItem bbtalk={item({ context: { source: { platform: 'desktop' } } })} />);
    expect(screen.getByTitle('Web')).toBeTruthy();
  });

  it('distinguishes public and private visibility badges', async () => {
    const { rerender } = render(<BBTalkItem bbtalk={item({ visibility: 'public' })} />);
    expect(screen.getByTitle('公开可见')).toBeTruthy();
    rerender(<BBTalkItem bbtalk={item({ visibility: 'private' })} />);
    expect(screen.getByTitle('仅自己可见')).toBeTruthy();
  });
});

describe('attachment galleries', () => {
  it('groups images, videos and generic files by type and extension', () => {
    render(<BBTalkItem bbtalk={item({
      attachments: [
        { uid: 'a1', url: '/img/photo.JPG?x=1', type: 'image', originalFilename: 'photo.JPG' },
        { uid: 'a2', url: '/files/clip.mp4', type: 'file', originalFilename: 'clip.mp4' },
        { uid: 'a3', url: '/files/report.pdf', type: 'file', filename: 'report.pdf', originalFilename: 'report.pdf', fileSize: 2048 },
        { uid: 'a4', url: '/files/huge.zip', type: 'file', originalFilename: 'huge.zip', fileSize: 5 * 1024 * 1024 * 1024 },
      ],
    })} />);
    expect(screen.getAllByTestId('cached-image')).toHaveLength(1);
    expect(screen.getByText('clip.mp4')).toBeTruthy();
    expect(screen.getByText('report.pdf')).toBeTruthy();
    expect(screen.getByText('(2.0 KB)')).toBeTruthy();
    expect(screen.getByText('(5.0 GB)')).toBeTruthy();
  });

  it('opens the preview when an image is clicked', () => {
    const onPreviewImage = vi.fn();
    render(<BBTalkItem bbtalk={item({
      attachments: [{ uid: 'a1', url: '/img/a.png', type: 'image', originalFilename: 'a.png' }],
    })} onPreviewImage={onPreviewImage} />);
    fireEvent.click(screen.getByTestId('cached-image'));
    expect(onPreviewImage).toHaveBeenCalledWith({ src: '/img/a.png', alt: 'a.png' });
  });

  it('shows the raw video element for non-attachment sources', () => {
    render(<BBTalkItem bbtalk={item({
      attachments: [{ uid: 'v1', url: 'https://cdn.example.com/v.mp4', type: 'video' }],
    })} />);
    const video = document.querySelector('video');
    expect(video?.getAttribute('src')).toBe('https://cdn.example.com/v.mp4');
  });
});

describe('more menu', () => {
  it('copies the detail link and notifies the parent on success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    withClipboard({ writeText });
    const onShareSuccess = vi.fn();
    render(<BBTalkItem bbtalk={item()} onShareSuccess={onShareSuccess} />);
    fireEvent.click(screen.getByTitle('更多'));
    fireEvent.click(screen.getByText('复制链接'));
    await waitFor(() => expect(onShareSuccess).toHaveBeenCalledWith('b1'));
    expect(writeText).toHaveBeenCalledWith('http://localhost:3000/detail/b1');
    expect(screen.queryByText('复制链接')).toBeNull();
  });

  it('reports a retryable failure when the clipboard is unavailable', async () => {
    const { container } = render(<BBTalkItem bbtalk={item()} />);
    fireEvent.click(screen.getByTitle('更多'));
    fireEvent.click(screen.getByText('复制链接'));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('复制失败，请检查浏览器剪贴板权限后重试');
    withClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });
    fireEvent.click(within(alert).getByRole('button', { name: '重试操作' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(container).toBeTruthy();
  });

  it('offers edit and delete to the owner only', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const { rerender } = render(<BBTalkItem bbtalk={item()} onEdit={onEdit} onDelete={onDelete} />);
    fireEvent.click(screen.getByTitle('更多'));
    fireEvent.click(screen.getByText('编辑'));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1' }));
    fireEvent.click(screen.getByTitle('更多'));
    fireEvent.click(screen.getByText('删除'));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1' }));
    rerender(<BBTalkItem bbtalk={item()} isPublic onEdit={onEdit} onDelete={onDelete} />);
    fireEvent.click(screen.getByTitle('更多'));
    expect(screen.queryByText('编辑')).toBeNull();
    expect(screen.queryByText('删除')).toBeNull();
  });

  it('closes the menu when clicking outside', () => {
    render(<BBTalkItem bbtalk={item()} />);
    fireEvent.click(screen.getByTitle('更多'));
    expect(screen.getByText('复制链接')).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText('复制链接')).toBeNull();
  });
});

describe('inline comments', () => {
  it('auto loads existing comments and reflects the count from the server', async () => {
    api.getComments.mockResolvedValue([comment('c1'), comment('c2', 30), comment('c3', 5 * 3600000 / 60000)]);
    render(<BBTalkItem bbtalk={item({ commentCount: 2 })} />);
    expect(await screen.findByText('评论c1')).toBeTruthy();
    expect(screen.getByText('5小时前')).toBeTruthy();
    expect(screen.getByTitle('评论').textContent).toBe('3');
  });

  it('shows a retryable error when loading comments fails', async () => {
    api.getComments.mockRejectedValue(new Error('离线'));
    render(<BBTalkItem bbtalk={item({ commentCount: 1 })} />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('评论加载失败');
    api.getComments.mockResolvedValue([comment('c1')]);
    fireEvent.click(within(alert).getByRole('button', { name: '重试操作' }));
    expect(await screen.findByText('评论c1')).toBeTruthy();
  });

  it('collapses long comment threads and expands them again', async () => {
    api.getComments.mockResolvedValue([comment('c1'), comment('c2'), comment('c3'), comment('c4')]);
    render(<BBTalkItem bbtalk={item({ commentCount: 4 })} />);
    await screen.findByText('评论c4');
    fireEvent.click(screen.getByText('收起'));
    fireEvent.click(screen.getByText('查看 4 条评论'));
    expect(screen.getByText('评论c4')).toBeTruthy();
  });

  it('submits a comment with Enter, appends it and hides the input', async () => {
    api.createComment.mockImplementation(async (_id: string, text: string) => ({ ...comment('c9'), content: text }));
    render(<BBTalkItem bbtalk={item()} />);
    fireEvent.click(screen.getByTitle('评论'));
    const input = screen.getByLabelText('评论内容');
    fireEvent.change(input, { target: { value: '新评论' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByText('新评论')).toBeTruthy();
    expect(api.createComment).toHaveBeenCalledWith('b1', '新评论');
    expect(screen.queryByLabelText('评论内容')).toBeNull();
    expect(screen.getByTitle('评论').textContent).toBe('1');
  });

  it('keeps the drafted comment and allows retry when sending fails', async () => {
    api.createComment.mockRejectedValueOnce(new Error('网络中断'));
    render(<BBTalkItem bbtalk={item()} />);
    fireEvent.click(screen.getByTitle('评论'));
    const input = screen.getByLabelText('评论内容');
    fireEvent.change(input, { target: { value: '待发的评论' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('发送失败，评论内容已保留：网络中断');
    expect((screen.getByLabelText('评论内容') as HTMLInputElement).value).toBe('待发的评论');
    api.createComment.mockResolvedValue({ ...comment('c7'), content: '待发的评论' });
    fireEvent.click(within(alert).getByRole('button', { name: '重试操作' }));
    await screen.findByText('待发的评论');
  });

  it('ignores empty submissions and cancels with Escape', () => {
    render(<BBTalkItem bbtalk={item()} />);
    fireEvent.click(screen.getByTitle('评论'));
    const input = screen.getByLabelText('评论内容');
    fireEvent.change(input, { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: '发送' })).toHaveProperty('disabled', true);
    fireEvent.change(input, { target: { value: 'x' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByLabelText('评论内容')).toBeNull();
    expect(api.createComment).not.toHaveBeenCalled();
  });

  it('deletes a comment after confirmation', async () => {
    api.getComments.mockResolvedValue([comment('c1')]);
    api.deleteComment.mockResolvedValue(undefined);
    render(<BBTalkItem bbtalk={item({ commentCount: 1 })} />);
    await screen.findByText('评论c1');
    fireEvent.click(screen.getByRole('button', { name: '删除评论：评论c1' }));
    const dialog = await screen.findByRole('dialog', { name: '删除评论' });
    fireEvent.click(within(dialog).getByRole('button', { name: '确认删除' }));
    await waitFor(() => expect(screen.queryByText('评论c1')).toBeNull());
    expect(api.deleteComment).toHaveBeenCalledWith('b1', 'c1');
  });
});
