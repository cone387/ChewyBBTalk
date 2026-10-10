import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import BBTalkPage from '../src/pages/BBTalkPage';
import bbtalkReducer from '../src/store/slices/bbtalkSlice';
import tagReducer from '../src/store/slices/tagSlice';
import type { BBTalk, Tag } from '../src/types';

const boundary = vi.hoisted(() => ({
  user: { id: 1, username: 'alice', display_name: 'Alice' } as { id: number; username: string; display_name: string } | null,
  navigate: vi.fn(), privacy: false, activate: vi.fn(),
}));
const api = vi.hoisted(() => ({
  getBBTalks: vi.fn(), getPublicBBTalks: vi.fn(), createBBTalk: vi.fn(), updateBBTalk: vi.fn(), deleteBBTalk: vi.fn(),
}));
const tagsApi = vi.hoisted(() => ({ getTags: vi.fn(), updateTag: vi.fn() }));

vi.mock('../src/services/api', () => ({ bbtalkApi: api, tagApi: tagsApi }));
vi.mock('../src/services/auth', () => ({ getCurrentUser: () => boundary.user }));
vi.mock('react-router-dom', () => ({ useNavigate: () => boundary.navigate }));
vi.mock('../src/hooks/usePrivacyMode', () => ({
  usePrivacyMode: () => ({
    isPrivacyMode: boundary.privacy,
    activatePrivacy: boundary.activate,
    deactivatePrivacy: vi.fn(),
    resetTimer: vi.fn(),
    remainingSeconds: null,
  }),
}));
vi.mock('../src/components/BBTalkEditor', () => ({
  default: ({ onPublish, onCancelEdit, editing }: any) => (
    <div>
      <button type="button" onClick={() => onPublish({
        content: '新内容', tags: editing ? [] : ['新标签'], attachments: [],
        visibility: 'private', expectedUpdatedAt: editing?.updatedAt,
      })}>{editing ? '保存编辑' : '发布测试'}</button>
      {editing && <button type="button" onClick={onCancelEdit}>取消编辑</button>}
    </div>
  ),
}));
vi.mock('../src/components/BBTalkItem', () => ({
  default: ({ bbtalk, onEdit, onDelete, onPreviewImage, onShareSuccess }: any) => (
    <article>
      <h2>{bbtalk.content}</h2>
      <button type="button" onClick={() => onEdit?.(bbtalk)}>编辑{bbtalk.id}</button>
      <button type="button" onClick={() => onDelete?.(bbtalk)}>删除{bbtalk.id}</button>
      <button type="button" onClick={() => onPreviewImage?.({ src: '/x.png', alt: 'x' })}>预览{bbtalk.id}</button>
      <button type="button" onClick={() => onShareSuccess?.(bbtalk.id)}>分享{bbtalk.id}</button>
    </article>
  ),
}));
vi.mock('../src/components/ImagePreview', () => ({
  default: ({ src, onClose }: any) => <div><img alt="预览图" src={src} /><button type="button" onClick={onClose}>关闭预览</button></div>,
}));
vi.mock('../src/components/PrivacyCountdownButton', () => ({
  default: ({ onActivate }: any) => <button type="button" onClick={onActivate}>倒计时</button>,
}));
vi.mock('../src/components/SkeletonCard', () => ({ default: () => <div aria-hidden="true">skeleton</div> }));

const tags: Tag[] = [
  { id: 't1', name: '工作', color: '', sortOrder: 0, bbtalkCount: 1 },
  { id: 't2', name: '生活', color: '', sortOrder: 1, bbtalkCount: 2 },
];
function record(id: string, content: string): BBTalk {
  return {
    id, content, visibility: 'private', tags: [], attachments: [],
    createdAt: '2026-01-01T00:00:00Z', updatedAt: `2026-01-02T00:00:00Z-${id}`,
  };
}
const page1 = { count: 2, next: '/api/v1/bbtalks/?page=2', previous: null, results: [record('b1', '第一条'), record('b2', '第二条')] };

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  boundary.user = { id: 1, username: 'alice', display_name: 'Alice' };
  boundary.privacy = false;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  api.getBBTalks.mockResolvedValue(page1);
  api.getPublicBBTalks.mockResolvedValue({ ...page1, results: [record('p1', '公开记录')] });
  api.createBBTalk.mockImplementation(async (data: any) => ({ ...record('new', data.content) }));
  api.updateBBTalk.mockImplementation(async (id: string) => ({ ...record(id, '更新后的内容') }));
  api.deleteBBTalk.mockResolvedValue(undefined);
  tagsApi.getTags.mockResolvedValue(tags);
  tagsApi.updateTag.mockResolvedValue(tags[0]);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); delete window.__BBTALK_CONFIG__; });

function page(isPublic = false) {
  const store = configureStore({ reducer: { bbtalk: bbtalkReducer, tag: tagReducer } });
  return render(<Provider store={store}><BBTalkPage isPublic={isPublic} /></Provider>);
}
async function loaded(isPublic = false) {
  const view = page(isPublic);
  await screen.findByText(isPublic ? '公开记录' : '第一条');
  return view;
}
function scrollContainer() {
  return screen.getByRole('main');
}
// The scroll handler arms its rAF gate *after* scheduling, so the frame must run asynchronously.
function stubAsyncRaf() {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 0) as unknown as number);
}
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });

describe('initial rendering', () => {
  it('uses deployment branding and countdown defaults with an empty timeout fallback', async () => {
    window.__BBTALK_CONFIG__ = {
      VITE_SITE_NAME: 'Deployment Notes', VITE_SITE_COPYRIGHT: 'Private workspace',
      VITE_PRIVACY_TIMEOUT_MINUTES: '', VITE_SHOW_PRIVACY_COUNTDOWN: 'true',
    };
    const view = await loaded();
    expect(screen.getAllByText('Deployment Notes').length).toBeGreaterThan(0);
    expect(screen.getAllByText('倒计时')).toHaveLength(1);
    view.unmount();
    localStorage.setItem('privacy_timeout_minutes', '15');
    localStorage.setItem('show_privacy_countdown', 'false');
    await loaded();
    expect(screen.queryByText('倒计时')).toBeNull();
  });

  it('loads the private feed and tags, and offers navigation to settings', async () => {
    await loaded();
    expect(api.getBBTalks).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
    expect(tagsApi.getTags).toHaveBeenCalledTimes(1);
    expect(screen.getByText('我的碎碎念')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: '我的' })[0]);
    expect(boundary.navigate).toHaveBeenCalledWith('/settings');
  });

  it('shows skeletons while loading and the empty state afterwards', async () => {
    let finish!: (value: typeof page1) => void;
    const pending = new Promise<typeof page1>(resolve => { finish = resolve; });
    api.getBBTalks.mockReturnValue(pending);
    page();
    // The empty state flashes before the first request is marked pending.
    expect(screen.getByText('暂无碎碎念')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText('skeleton')).toHaveLength(3));
    await act(async () => { finish({ ...page1, results: [] }); });
    expect(screen.getByText('暂无碎碎念')).toBeTruthy();
    expect(screen.getByText('从今天的一件小事开始，写下第一条记录。')).toBeTruthy();
  });

  it('renders the public feed with a login prompt and no composer', async () => {
    const view = await loaded(true);
    expect(api.getPublicBBTalks).toHaveBeenCalledTimes(1);
    expect(api.getBBTalks).not.toHaveBeenCalled();
    expect(tagsApi.getTags).not.toHaveBeenCalled();
    expect(screen.getByText('公开碎碎念')).toBeTruthy();
    expect(screen.getByText('来都来了，说两句？')).toBeTruthy();
    expect(screen.queryByText('发布测试')).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: '登录' })[0]);
    view.unmount();
  });

  it('redirects to the lock page as soon as privacy mode is active', () => {
    boundary.privacy = true;
    const view = page();
    expect(boundary.navigate).toHaveBeenCalledWith('/locked', { replace: true });
    view.unmount();
  });

  it('shows the countdown button only when the user opted in, and forwards activation', async () => {
    const view = page();
    await screen.findByText('第一条');
    expect(view.queryByText('倒计时')).toBeNull();
    view.unmount();

    localStorage.setItem('show_privacy_countdown', 'true');
    const second = page();
    await screen.findByText('第一条');
    fireEvent.click(screen.getAllByText('倒计时')[0]);
    expect(boundary.activate).toHaveBeenCalledTimes(1);
    second.unmount();
  });
});

describe('search and tag filters', () => {
  it('debounces keyword changes into a fresh backend query', async () => {
    vi.useFakeTimers();
    page();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.change(screen.getByLabelText('搜索记录'), { target: { value: ' 关键 ' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(api.getBBTalks).toHaveBeenLastCalledWith(expect.objectContaining({ search: '关键' }));
  });

  it('switches a single tag, keeps the current tag selected and clears through All', async () => {
    vi.useFakeTimers();
    page();
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    fireEvent.click(screen.getByRole('button', { name: '工作' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(api.getBBTalks).toHaveBeenLastCalledWith(expect.objectContaining({ tags__name: '工作' }));
    scrollContainer().scrollTop = 240;
    fireEvent.click(screen.getByRole('button', { name: '生活' }));
    expect(scrollContainer().scrollTop).toBe(0);
    expect(screen.getByRole('button', { name: '工作' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: '生活' }).getAttribute('aria-pressed')).toBe('true');
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(api.getBBTalks).toHaveBeenLastCalledWith(expect.objectContaining({ tags__name: '生活' }));
    const requests = api.getBBTalks.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: '生活' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(api.getBBTalks).toHaveBeenCalledTimes(requests);
    expect(screen.getByRole('button', { name: '生活' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '全部', exact: true }));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(api.getBBTalks).toHaveBeenLastCalledWith(expect.objectContaining({ tags__name: '' }));
  });

  it('ignores a delayed response for the previous tag after switching', async () => {
    vi.useFakeTimers();
    page();
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    let finishOld!: (value: typeof page1) => void;
    api.getBBTalks.mockImplementation((params: { tags__name?: string }) => params.tags__name === '工作'
      ? new Promise(resolve => { finishOld = resolve; })
      : Promise.resolve({ ...page1, results: [record('life', '生活结果')] }));
    fireEvent.click(screen.getByRole('button', { name: '工作' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    fireEvent.click(screen.getByRole('button', { name: '生活' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(screen.getByText('生活结果')).toBeTruthy();
    await act(async () => { finishOld({ ...page1, results: [record('work', '过期工作结果')] }); });
    expect(screen.getByText('生活结果')).toBeTruthy();
    expect(screen.queryByText('过期工作结果')).toBeNull();
  });

  it('clears search and selected tags from an empty result without adding filter controls', async () => {
    api.getBBTalks.mockResolvedValue({ ...page1, results: [] });
    page();
    await screen.findByText('暂无碎碎念');
    fireEvent.change(screen.getByLabelText('搜索记录'), { target: { value: '关键词' } });
    fireEvent.click(screen.getByRole('button', { name: '工作' }));
    expect(screen.queryByLabelText('当前筛选条件')).toBeNull();
    expect(screen.queryByRole('button', { name: /筛选与排序/ })).toBeNull();
    expect(screen.getByText('没有找到匹配的碎碎念')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '清除条件，查看全部' }));
    expect(screen.getByText('暂无碎碎念')).toBeTruthy();
    expect((screen.getByLabelText('搜索记录') as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('button', { name: '工作' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('operates the mobile filter dialog with tag counts', async () => {
    await loaded();
    fireEvent.click(screen.getAllByRole('button', { name: /^标签/ })[0]);
    const dialog = await screen.findByRole('dialog', { name: '选择标签' });
    expect(within(dialog).getByText('全部标签')).toBeTruthy();
    expect(within(dialog).getAllByText('2')).toHaveLength(2);
    fireEvent.click(within(dialog).getByRole('button', { name: '工作 1' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '完成' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: '工作' }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('publishing and editing', () => {
  it('creates a record, scrolls to the top and reloads tags when a new tag appears', async () => {
    const view = await loaded();
    const container = scrollContainer();
    container.scrollTo = vi.fn();
    fireEvent.click(screen.getByText('发布测试'));
    await screen.findByText('新内容');
    expect(api.createBBTalk).toHaveBeenCalledWith(expect.objectContaining({ content: '新内容', tags: ['新标签'] }));
    expect(container.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    await waitFor(() => expect(tagsApi.getTags).toHaveBeenCalledTimes(2));
    view.unmount();
  });

  it('edits through the inline editor and falls back to the record timestamp', async () => {
    await loaded();
    fireEvent.click(screen.getByText('编辑b1'));
    expect(screen.getByText('保存编辑')).toBeTruthy();
    fireEvent.click(screen.getByText('保存编辑'));
    await screen.findByText('更新后的内容');
    expect(api.updateBBTalk).toHaveBeenCalledWith('b1',
      expect.objectContaining({ content: '新内容', visibility: 'private' }),
      '2026-01-02T00:00:00Z-b1');
    expect(screen.queryByText('保存编辑')).toBeNull();
  });

  it('abandoning an edit restores the read-only card', async () => {
    await loaded();
    fireEvent.click(screen.getByText('编辑b2'));
    fireEvent.click(screen.getByText('取消编辑'));
    expect(screen.getByText('第二条')).toBeTruthy();
    expect(screen.queryByText('取消编辑')).toBeNull();
  });
});

describe('deletion with undo', () => {
  it('hides the record optimistically, restores it on undo and never calls the API', async () => {
    await loaded();
    fireEvent.click(screen.getByText('删除b1'));
    expect(screen.queryByText('第一条')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '撤销' }));
    expect(await screen.findByText('第一条')).toBeTruthy();
    expect(api.deleteBBTalk).not.toHaveBeenCalled();
  });

  it('commits the deletion once the undo window elapses', async () => {
    page();
    const trigger = await screen.findByText('删除b1');
    vi.useFakeTimers();
    fireEvent.click(trigger);
    await act(async () => { await vi.advanceTimersByTimeAsync(3400); });
    expect(api.deleteBBTalk).toHaveBeenCalledWith('b1');
  });

  it.each([[new Error('网关超时'), '网关超时'], [null, '请稍后重试']])('offers a retry after API failure %s', async (error, message) => {
    api.deleteBBTalk.mockRejectedValueOnce(error);
    await loaded();
    fireEvent.click(screen.getByText('删除b1'));
    // The failure is only reported once the undo window commits the deletion.
    const alert = await screen.findByRole('alert', undefined, { timeout: 4500 });
    expect(alert.textContent).toContain(`删除失败：${message}`);
    api.deleteBBTalk.mockResolvedValue(undefined);
    fireEvent.click(within(alert).getByRole('button', { name: '重试操作' }));
    await waitFor(() => expect(api.deleteBBTalk).toHaveBeenCalledTimes(2));
  });
});

describe('list refresh and paging', () => {
  it('refetches the feed when the window regains focus', async () => {
    await loaded();
    const before = api.getBBTalks.mock.calls.length;
    fireEvent(window, new Event('focus'));
    await waitFor(() => expect(api.getBBTalks.mock.calls.length).toBeGreaterThan(before));
  });

  it('loads the next page when scrolling near the bottom and reports the end', async () => {
    const view = await loaded();
    await waitFor(() => expect(api.getBBTalks).toHaveBeenCalledTimes(2)); // initial load + debounced re-run
    api.getBBTalks.mockClear();
    api.getBBTalks.mockResolvedValueOnce({ count: 3, next: null, previous: null, results: [record('b3', '第三条')] });

    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 0; });
    const container = scrollContainer();
    Object.defineProperty(container, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 800, configurable: true });
    Object.defineProperty(container, 'scrollTop', { value: 150, configurable: true, writable: true });
    container.scrollTo = vi.fn();
    fireEvent.scroll(container);
    await screen.findByText('第三条');
    expect(api.getBBTalks).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
    expect(screen.getByText('没有更多了')).toBeTruthy();
    view.unmount();
  });

  it('reveals the back-to-top control without hiding the composer', async () => {
    stubAsyncRaf();
    const view = await loaded();
    const container = scrollContainer();
    Object.defineProperty(container, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true });
    container.scrollTo = vi.fn();
    Object.defineProperty(container, 'scrollTop', { value: 500, configurable: true, writable: true });
    fireEvent.scroll(container);
    await settle();
    await screen.findByTitle('回到顶部');
    const publishButton = screen.getByRole('button', { name: '发布测试' });
    publishButton.focus();
    expect(document.activeElement).toBe(publishButton);
    Object.defineProperty(container, 'scrollTop', { value: 100, configurable: true, writable: true });
    fireEvent.scroll(container);
    await settle();
    await waitFor(() => expect(screen.queryByTitle('回到顶部')).toBeNull());
    expect(screen.getByRole('button', { name: '发布测试' })).toBe(publishButton);
    Object.defineProperty(container, 'scrollTop', { value: 600, configurable: true, writable: true });
    fireEvent.scroll(container);
    await settle();
    fireEvent.click(screen.getByTitle('回到顶部'));
    expect(container.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    view.unmount();
  });

  it('loads more public records through the public endpoint', async () => {
    api.getPublicBBTalks.mockReset();
    api.getPublicBBTalks.mockResolvedValueOnce({ count: 2, next: '/page2', previous: null, results: [record('p1', '公开记录')] })
      .mockResolvedValueOnce({ count: 2, next: null, previous: null, results: [record('p2', '更多公开')] });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 0; });
    const view = page(true);
    await screen.findByText('公开记录');
    const container = scrollContainer();
    Object.defineProperty(container, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 800, configurable: true });
    Object.defineProperty(container, 'scrollTop', { value: 150, configurable: true, writable: true });
    fireEvent.scroll(container);
    await screen.findByText('更多公开');
    expect(api.getPublicBBTalks).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
    expect(api.getBBTalks).not.toHaveBeenCalled();
    view.unmount();
  });
});

describe('secondary overlays', () => {
  it('opens the image preview from a card and closes it', async () => {
    await loaded();
    fireEvent.click(screen.getByText('预览b1'));
    const img = await screen.findByRole('img');
    expect(img.getAttribute('src')).toBe('/x.png');
    fireEvent.click(screen.getByText('关闭预览'));
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('shows the copy confirmation toast when a link was shared', async () => {
    page();
    fireEvent.click(await screen.findByText('分享b1'));
    expect(screen.getByText('链接已复制')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('链接已复制')).toBeNull(), { timeout: 2500 });
  });
});
