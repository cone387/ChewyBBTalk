import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import BBTalkItem from '../src/components/BBTalkItem';
import type { BBTalk, Comment } from '../src/types';

const api = vi.hoisted(() => ({ getCommentPage: vi.fn(), createComment: vi.fn(), deleteComment: vi.fn() }));
const auth = vi.hoisted(() => ({ session: 0, listeners: new Set<() => void>() }));
vi.mock('../src/services/api', () => ({ bbtalkApi: api }));
vi.mock('../src/services/authSessionScope', () => ({ getAuthSessionScope: () => String(auth.session), subscribeAuthSession: (listener: () => void) => { auth.listeners.add(listener); return () => auth.listeners.delete(listener); } }));
vi.mock('../src/components/MarkdownRenderer', () => ({ default: ({ content }: { content: string }) => <p>{content}</p> }));
vi.mock('../src/components/CachedImage', () => ({ default: () => null }));
vi.mock('../src/components/AuthenticatedMedia', () => ({ AttachmentVideo: () => null, AttachmentDownload: () => null }));
vi.mock('react-router-dom', () => ({ useHref: (path: string) => path }));

function comment(n: number): Comment {
  return { uid: `c${n}`, user: 1, userDisplayName: 'Alice', userAvatar: '', userUsername: 'alice', content: `reply-${n}`, createdAt: '2026-10-10T00:00:00Z', updatedAt: '' };
}
function record(overrides: Partial<BBTalk> = {}): BBTalk {
  return { id: 'record', content: 'body', tags: [], attachments: [], visibility: 'private', createdAt: '', updatedAt: '', commentCount: 5, commentPreview: [comment(1), comment(2), comment(3)], commentsRevision: 'v1', ...overrides };
}
beforeEach(() => { vi.resetAllMocks(); auth.session++; });
afterEach(cleanup);

it('renders 100 preview-bearing records without a per-card comment GET', () => {
  render(<>{Array.from({ length: 100 }, (_, n) => <BBTalkItem key={n} bbtalk={record({ id: `r${n}` })} />)}</>);
  expect(screen.getAllByText('reply-1')).toHaveLength(100);
  expect(api.getCommentPage).not.toHaveBeenCalled();
  expect(api.getCommentPage).not.toHaveBeenCalled();
});

it('loads pages on demand and reuses them after remount without replacing total count with page length', async () => {
  api.getCommentPage.mockResolvedValueOnce({ total: 5, has_more: true, page: 1, page_size: 20, items: [comment(1), comment(2), comment(3), comment(4)], revision: 'v1' })
    .mockResolvedValueOnce({ total: 5, has_more: false, page: 1, page_size: 20, items: [comment(5)], revision: 'v1' });
  const first = render(<BBTalkItem bbtalk={record()} />);
  fireEvent.click(screen.getByText('查看全部 5 条评论'));
  await screen.findByText('reply-4');
  expect(screen.getByTitle('评论').textContent).toBe('5');
  fireEvent.click(screen.getByText('加载更多评论'));
  await screen.findByText('reply-5');
  expect(api.getCommentPage).toHaveBeenLastCalledWith('record', 2, false);
  first.unmount();
  render(<BBTalkItem bbtalk={record()} />);
  fireEvent.click(screen.getByText('查看全部 5 条评论'));
  expect(await screen.findByText('reply-5')).toBeTruthy();
  expect(api.getCommentPage).toHaveBeenCalledTimes(2);
});

it('replaces stale expanded comments when a refreshed record reports a new revision', async () => {
  api.getCommentPage.mockResolvedValueOnce({ total: 5, has_more: false, page: 1, page_size: 20, items: [1, 2, 3, 4, 5].map(comment), revision: 'v1' })
    .mockResolvedValueOnce({ total: 4, has_more: false, page: 1, page_size: 20, items: [2, 3, 4, 5].map(comment), revision: 'v2' });
  const view = render(<BBTalkItem bbtalk={record()} />);
  fireEvent.click(screen.getByText('查看全部 5 条评论'));
  await screen.findByText('reply-5');
  view.rerender(<BBTalkItem bbtalk={record({ commentCount: 4, commentPreview: [2, 3, 4].map(comment), commentsRevision: 'v2' })} />);
  await waitFor(() => expect(api.getCommentPage).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByText('reply-1')).toBeNull());
  await waitFor(() => expect(screen.getByTitle('评论').textContent).toBe('4'));
});

it('sends one request to append a comment and preserves the new count across remounts', async () => {
  api.createComment.mockResolvedValue(comment(6));
  const first = render(<BBTalkItem bbtalk={record()} />);
  fireEvent.click(screen.getByTitle('评论'));
  fireEvent.change(screen.getByLabelText('评论内容'), { target: { value: 'reply-6' } });
  fireEvent.click(screen.getByRole('button', { name: '发送' }));
  await screen.findByText('reply-6');
  // Rendering the comment does not flush the effect that updates its parent badge.
  await waitFor(() => expect(screen.getByTitle('评论').textContent).toBe('6'));
  expect(api.getCommentPage).not.toHaveBeenCalled();
  expect(api.getCommentPage).not.toHaveBeenCalled();
  first.unmount();
  render(<BBTalkItem bbtalk={record()} />);
  expect(screen.getByTitle('评论').textContent).toBe('6');
});

it('expands public comments with one public page request and no write controls', async () => {
  api.getCommentPage.mockResolvedValue({ total: 5, has_more: false, page: 1, page_size: 20, items: [1, 2, 3, 4, 5].map(comment), revision: 'v1' });
  render(<BBTalkItem bbtalk={record()} isPublic />);
  fireEvent.click(screen.getByTitle('评论'));
  await screen.findByText('reply-5');
  expect(api.getCommentPage).toHaveBeenCalledExactlyOnceWith('record', 1, true);
  expect(screen.queryByLabelText('评论内容')).toBeNull();
  expect(screen.queryByRole('button', { name: '删除评论：reply-1' })).toBeNull();
});

it('clears mounted old-session previews without reseeding them until fresh record props arrive', async () => {
  const view = render(<BBTalkItem bbtalk={record()} />);
  expect(screen.getByText('reply-1')).toBeTruthy();
  act(() => { auth.session++; auth.listeners.forEach(listener => listener()); });
  expect(screen.queryByText('reply-1')).toBeNull();
  expect(screen.getByTitle('评论').textContent).toBe('');
  expect(api.getCommentPage).not.toHaveBeenCalled();
  view.rerender(<BBTalkItem bbtalk={record({ commentPreview: [comment(9)], commentCount: 1, commentsRevision: 'v2' })} />);
  expect(await screen.findByText('reply-9')).toBeTruthy();
});

it('can load missing comments after deleting a preview item drops the total below four', async () => {
  api.deleteComment.mockResolvedValue(undefined);
  api.getCommentPage.mockResolvedValue({ total: 3, has_more: false, page: 1, page_size: 20, items: [2, 3, 4].map(comment), revision: 'v2' });
  render(<BBTalkItem bbtalk={record({ commentCount: 4 })} />);
  fireEvent.click(screen.getByRole('button', { name: '删除评论：reply-1' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '确认删除' }));
  await waitFor(() => expect(screen.queryByText('reply-1')).toBeNull());
  expect(api.getCommentPage).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('查看全部 3 条评论'));
  expect(await screen.findByText('reply-4')).toBeTruthy();
});
