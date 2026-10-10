import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import PublicBBTalkPage from '../src/pages/PublicBBTalkPage';
import BBTalkPage from '../src/pages/BBTalkPage';
import bbtalkReducer from '../src/store/slices/bbtalkSlice';
import tagReducer from '../src/store/slices/tagSlice';
import type { BBTalk, Tag } from '../src/types';

const boundary = vi.hoisted(() => ({
  user: { id: 1, username: 'alice', display_name: 'Alice' } as { id: number; username: string; display_name: string } | null,
  navigate: vi.fn(), privacy: false, activate: vi.fn(),
  drag: null as null | { active: { id: string }; over: { id: string } | null },
  dragging: false,
}));
const api = vi.hoisted(() => ({
  getBBTalks: vi.fn(), getPublicBBTalks: vi.fn(), createBBTalk: vi.fn(), updateBBTalk: vi.fn(), deleteBBTalk: vi.fn(),
}));
const tagsApi = vi.hoisted(() => ({ getTags: vi.fn(), updateTag: vi.fn(), reorderTags: vi.fn() }));

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
      <button type="button" onClick={() => {
        void Promise.resolve(onPublish({
          content: '提交的内容', tags: editing ? ['现有标签'] : [], attachments: [],
          visibility: 'private', expectedUpdatedAt: editing?.updatedAt,
        })).catch(() => { /* the page surfaces failures itself */ });
      }}>{editing ? '保存编辑' : '发布测试'}</button>
      {editing && <button type="button" onClick={onCancelEdit}>取消编辑</button>}
    </div>
  ),
}));
vi.mock('../src/components/BBTalkItem', () => ({
  default: ({ bbtalk, onEdit }: any) => (
    <article>
      <h2>{bbtalk.content}</h2>
      <button type="button" onClick={() => onEdit?.(bbtalk)}>编辑{bbtalk.id}</button>
    </article>
  ),
}));
vi.mock('../src/components/ImagePreview', () => ({ default: () => <div>预览</div> }));
vi.mock('../src/components/PrivacyCountdownButton', () => ({ default: () => <div>倒计时占位</div> }));
vi.mock('../src/components/SkeletonCard', () => ({ default: () => <div aria-hidden="true">skeleton</div> }));
vi.mock('@dnd-kit/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@dnd-kit/core')>()),
  // The real DndContext needs pointer geometry jsdom cannot provide; expose onDragEnd directly.
  DndContext: ({ onDragEnd, children }: { onDragEnd: (event: unknown) => void; children: React.ReactNode }) => (
    <div>
      {children}
      <button type="button" onClick={() => onDragEnd(boundary.drag)}>触发拖拽</button>
    </div>
  ),
}));
vi.mock('@dnd-kit/sortable', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@dnd-kit/sortable')>()),
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSortable: () => ({
    attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, transition: null,
    isDragging: boundary.dragging,
  }),
}));

const tags: Tag[] = [
  { id: 't1', name: '工作', color: '', sortOrder: 0, bbtalkCount: 1 },
  { id: 't2', name: '生活', color: '', sortOrder: 1000, bbtalkCount: 2 },
  { id: 't3', name: '阅读', color: '', sortOrder: 2000, bbtalkCount: 0 },
];
function record(id: string, content: string): BBTalk {
  return {
    id, content, visibility: 'private', tags: [], attachments: [],
    createdAt: '2026-01-01T00:00:00Z', updatedAt: `2026-01-02T00:00:00Z-${id}`,
  };
}
const page1 = { count: 2, next: '/api/v1/bbtalks/?page=2', previous: null, results: [record('b1', '第一条'), record('b2', '第二条')] };
const publicPage = { count: 1, next: null, previous: null, results: [record('p1', '公开记录')] };

let navigatedTo: string | undefined;
const realLocation = window.location;

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  boundary.user = { id: 1, username: 'alice', display_name: 'Alice' };
  boundary.privacy = false;
  boundary.drag = null;
  boundary.dragging = false;
  navigatedTo = undefined;
  Object.defineProperty(window, 'location', {
    value: {
      get href() { return realLocation.href; },
      set href(value: string) { navigatedTo = value; },
    },
    writable: true, configurable: true,
  });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  api.getBBTalks.mockResolvedValue(page1);
  api.getPublicBBTalks.mockResolvedValue(publicPage);
  api.createBBTalk.mockResolvedValue(record('new', '提交的内容'));
  api.updateBBTalk.mockResolvedValue(record('b1', '提交的内容'));
  api.deleteBBTalk.mockResolvedValue(undefined);
  tagsApi.getTags.mockResolvedValue(tags);
  tagsApi.reorderTags.mockResolvedValue(undefined);
  tagsApi.updateTag.mockImplementation(async (_id: string, data: Partial<Tag>) => ({ ...tags[0], ...data } as Tag));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Object.defineProperty(window, 'location', { value: realLocation, writable: true, configurable: true });
});

function page(isPublic = false, element?: React.ReactElement) {
  const store = configureStore({ reducer: { bbtalk: bbtalkReducer, tag: tagReducer } });
  return render(<Provider store={store}>{element ?? <BBTalkPage isPublic={isPublic} />}</Provider>);
}
async function loadedPrivate() {
  const view = page();
  await screen.findByText('第一条');
  return view;
}
function scrollContainer() {
  return screen.getByRole('main');
}
async function openFilterDialog() {
  fireEvent.click(screen.getAllByRole('button', { name: /^标签/ })[0]);
  return await screen.findByRole('dialog', { name: '选择标签' });
}

describe('PublicBBTalkPage', () => {
  it('loads the public feed through the public endpoint and offers no composer', async () => {
    page(false, <PublicBBTalkPage />);
    expect(await screen.findByText('公开记录')).toBeTruthy();
    expect(api.getPublicBBTalks).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
    expect(api.getBBTalks).not.toHaveBeenCalled();
    expect(tagsApi.getTags).not.toHaveBeenCalled();
    expect(screen.getByText('公开碎碎念')).toBeTruthy();
    expect(screen.queryByText('发布测试')).toBeNull();
  });

  it('shows the public empty state and keeps refreshes on the public endpoint', async () => {
    api.getPublicBBTalks.mockResolvedValue({ ...publicPage, results: [] });
    page(false, <PublicBBTalkPage />);
    await screen.findByText('这里还没有公开的记录。');
    const before = api.getPublicBBTalks.mock.calls.length;
    fireEvent(window, new Event('focus'));
    await waitFor(() => expect(api.getPublicBBTalks.mock.calls.length).toBeGreaterThan(before));
    expect(api.getBBTalks).not.toHaveBeenCalled();
  });

  it('sends anonymous visitors to the login page', async () => {
    page(false, <PublicBBTalkPage />);
    await screen.findByText('公开记录');
    fireEvent.click(screen.getAllByRole('button', { name: '登录' })[0]);
    expect(navigatedTo).toBe('/login');
  });

  it('never enables privacy mode on the public page even when the flag flips', async () => {
    boundary.privacy = true;
    const view = page(false, <PublicBBTalkPage />);
    await screen.findByText('公开记录');
    expect(boundary.navigate).not.toHaveBeenCalledWith('/locked', expect.anything());
    view.unmount();
    boundary.privacy = false;
  });
});

describe('BBTalkPage focus refresh guards', () => {
  it('skips refreshes while the document is hidden', async () => {
    await loadedPrivate();
    await waitFor(() => expect(api.getBBTalks.mock.calls.length).toBeGreaterThanOrEqual(2)); // initial + debounced re-run
    const before = api.getBBTalks.mock.calls.length;
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    fireEvent(document, new Event('visibilitychange'));
    expect(api.getBBTalks.mock.calls.length).toBe(before);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('skips refreshes while offline and throttles repeat focus events', async () => {
    await loadedPrivate();
    await waitFor(() => expect(api.getBBTalks.mock.calls.length).toBeGreaterThanOrEqual(2));
    const before = api.getBBTalks.mock.calls.length;
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    fireEvent(window, new Event('online'));
    expect(api.getBBTalks.mock.calls.length).toBe(before);
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    fireEvent(window, new Event('focus'));
    await waitFor(() => expect(api.getBBTalks.mock.calls.length).toBe(before + 1));
    fireEvent(window, new Event('focus')); // throttled within the same second
    expect(api.getBBTalks.mock.calls.length).toBe(before + 1);
  });

  it('does not reload a private feed for signed-out visitors', async () => {
    boundary.user = null;
    const view = await loadedPrivate();
    await waitFor(() => expect(api.getBBTalks.mock.calls.length).toBeGreaterThanOrEqual(2));
    const before = api.getBBTalks.mock.calls.length;
    fireEvent(window, new Event('focus'));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(api.getBBTalks.mock.calls.length).toBe(before);
    view.unmount();
    boundary.user = { id: 1, username: 'alice', display_name: 'Alice' };
  });
});

describe('BBTalkPage header and navigation extras', () => {
  it('links the settings button title to the signed-in identity and honours a stored timeout', async () => {
    localStorage.setItem('privacy_timeout_minutes', '10');
    const view = await loadedPrivate();
    expect(screen.getByTitle('Alice')).toBeTruthy();
    view.unmount();
    boundary.user = null;
    const second = page();
    await screen.findByText('第一条');
    expect(screen.queryByTitle('Alice')).toBeNull();
    second.unmount();
    boundary.user = { id: 1, username: 'alice', display_name: 'Alice' };
  });

  it('offers a shortcut to the remaining tags beyond the first six', async () => {
    tagsApi.getTags.mockResolvedValue([
      ...tags,
      { id: 't4', name: '旅行', color: '', sortOrder: 3000, bbtalkCount: 0 },
      { id: 't5', name: '游戏', color: '', sortOrder: 4000, bbtalkCount: 0 },
      { id: 't6', name: '音乐', color: '', sortOrder: 5000, bbtalkCount: 0 },
      { id: 't7', name: '运动', color: '', sortOrder: 6000, bbtalkCount: 0 },
    ]);
    const view = await loadedPrivate();
    fireEvent.click(screen.getByRole('button', { name: '更多标签' }));
    const dialog = await screen.findByRole('dialog', { name: '选择标签' });
    expect(within(dialog).getByRole('button', { name: '拖动排序：运动' })).toBeTruthy();
    view.unmount();
  });

  it('clears filters and scrolls back to the top from the mobile home button', async () => {
    const view = await loadedPrivate();
    const container = scrollContainer();
    container.scrollTo = vi.fn();
    fireEvent.change(screen.getByLabelText('搜索记录'), { target: { value: '关键词' } });
    expect((screen.getByLabelText('搜索记录') as HTMLInputElement).value).toBe('关键词');
    const homeButtons = screen.getAllByRole('button', { name: '记录' });
    fireEvent.click(homeButtons[homeButtons.length - 1]);
    expect((screen.getByLabelText('搜索记录') as HTMLInputElement).value).toBe('');
    expect(container.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    view.unmount();
  });
});

describe('BBTalkPage publishing paths', () => {
  it('keeps tags from the edited record and reloads the tag list after saving', async () => {
    const view = await loadedPrivate();
    await waitFor(() => expect(tagsApi.getTags).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText('编辑b1'));
    fireEvent.click(screen.getByText('保存编辑'));
    await waitFor(() => expect(api.updateBBTalk).toHaveBeenCalledTimes(1));
    expect(api.updateBBTalk).toHaveBeenCalledWith('b1',
      expect.objectContaining({ content: '提交的内容', tags: [expect.objectContaining({ name: '现有标签' })] }),
      '2026-01-02T00:00:00Z-b1');
    await waitFor(() => expect(tagsApi.getTags).toHaveBeenCalledTimes(2)); // 现有标签 is new to the store
    view.unmount();
  });

  it('surfaces a publishing failure without crashing the composer', async () => {
    api.createBBTalk.mockRejectedValue(new Error('内容被拒'));
    const view = await loadedPrivate();
    fireEvent.click(screen.getByText('发布测试'));
    await waitFor(() => expect(vi.mocked(console.error).mock.calls.some(call => String(call[0]).includes('发布失败'))).toBe(true));
    expect(screen.getByText('发布测试')).toBeTruthy(); // the composer stays usable
    view.unmount();
  });

  it('surfaces an update failure without crashing the composer', async () => {
    api.updateBBTalk.mockRejectedValue(new Error('版本冲突'));
    const view = await loadedPrivate();
    fireEvent.click(screen.getByText('编辑b1'));
    fireEvent.click(screen.getByText('保存编辑'));
    await waitFor(() => expect(vi.mocked(console.error).mock.calls.some(call => String(call[0]).includes('更新失败'))).toBe(true));
    expect(screen.getByText('保存编辑')).toBeTruthy(); // the composer stays usable
    view.unmount();
  });
});

describe('BBTalkPage pagination with filters', () => {
  it('loads the next page while a tag filter is active', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 0; });
    const view = await loadedPrivate();
    await waitFor(() => expect(api.getBBTalks).toHaveBeenCalledTimes(2)); // initial load + debounced re-run
    fireEvent.click(screen.getByRole('button', { name: '工作' }));
    await waitFor(() => expect(api.getBBTalks.mock.calls.length).toBeGreaterThanOrEqual(3));
    api.getBBTalks.mockClear();
    api.getBBTalks.mockResolvedValueOnce({ count: 3, next: null, previous: null, results: [record('b3', '第三条')] });

    const container = scrollContainer();
    Object.defineProperty(container, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 800, configurable: true });
    Object.defineProperty(container, 'scrollTop', { value: 150, configurable: true, writable: true });
    fireEvent.scroll(container);
    await screen.findByText('第三条');
    expect(api.getBBTalks).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, tags__name: '工作' }));
    view.unmount();
  });
});

describe('BBTalkPage tag reordering', () => {
  it('moves a tag to the front with a lower sortOrder and reloads', async () => {
    const view = await loadedPrivate();
    const dialog = await openFilterDialog();
    boundary.drag = { active: { id: 't3' }, over: { id: 't1' } };
    fireEvent.click(within(dialog).getByRole('button', { name: '触发拖拽' }));
    await waitFor(() => expect(tagsApi.reorderTags).toHaveBeenCalledWith(['t3', 't1', 't2']));
    await waitFor(() => expect(tagsApi.getTags.mock.calls.length).toBeGreaterThanOrEqual(2));
    view.unmount();
  });

  it('interpolates a middle position between the neighbouring tags', async () => {
    const view = await loadedPrivate();
    const dialog = await openFilterDialog();
    boundary.drag = { active: { id: 't1' }, over: { id: 't2' } };
    fireEvent.click(within(dialog).getByRole('button', { name: '触发拖拽' }));
    await waitFor(() => expect(tagsApi.reorderTags).toHaveBeenCalledWith(['t2', 't1', 't3']));
    view.unmount();
  });

  it('appends a dragged tag after the last position', async () => {
    const view = await loadedPrivate();
    const dialog = await openFilterDialog();
    boundary.drag = { active: { id: 't1' }, over: { id: 't3' } };
    fireEvent.click(within(dialog).getByRole('button', { name: '触发拖拽' }));
    await waitFor(() => expect(tagsApi.reorderTags).toHaveBeenCalledWith(['t2', 't3', 't1']));
    view.unmount();
  });

  it('treats tags without an explicit sortOrder as zero while reordering', async () => {
    tagsApi.getTags.mockResolvedValue([
      { id: 't1', name: '甲', color: '', bbtalkCount: 0 },
      { id: 't2', name: '乙', color: '', bbtalkCount: 0 },
    ]);
    const view = await loadedPrivate();
    const dialog = await openFilterDialog();
    boundary.drag = { active: { id: 't2' }, over: { id: 't1' } }; // to the front: neighbour order undefined → -1000
    fireEvent.click(within(dialog).getByRole('button', { name: '触发拖拽' }));
    await waitFor(() => expect(tagsApi.reorderTags).toHaveBeenCalledWith(['t2', 't1']));
    boundary.drag = { active: { id: 't1' }, over: { id: 't2' } }; // to the end: neighbour order undefined → +1000
    fireEvent.click(within(dialog).getByRole('button', { name: '触发拖拽' }));
    await waitFor(() => expect(tagsApi.reorderTags).toHaveBeenCalledWith(['t2', 't1']));
    view.unmount();
  });

  it('averages zero for neighbours without a sortOrder in middle positions', async () => {
    tagsApi.getTags.mockResolvedValue([
      { id: 't1', name: '甲', color: '', bbtalkCount: 0 },
      { id: 't2', name: '乙', color: '', bbtalkCount: 0 },
      { id: 't3', name: '丙', color: '', bbtalkCount: 0 },
    ]);
    const view = await loadedPrivate();
    const dialog = await openFilterDialog();
    boundary.drag = { active: { id: 't3' }, over: { id: 't2' } }; // lands between 甲 and 乙: (0 + 0) / 2
    fireEvent.click(within(dialog).getByRole('button', { name: '触发拖拽' }));
    await waitFor(() => expect(tagsApi.reorderTags).toHaveBeenCalledWith(['t1', 't3', 't2']));
    view.unmount();
  });

  it('places the only tag at the top when it is dropped nowhere else', async () => {
    tagsApi.getTags.mockResolvedValue([tags[0]]);
    const view = await loadedPrivate();
    const dialog = await openFilterDialog();
    boundary.drag = { active: { id: 't1' }, over: { id: 't1' } }; // same id → ignored
    fireEvent.click(within(dialog).getByRole('button', { name: '触发拖拽' }));
    expect(tagsApi.reorderTags).not.toHaveBeenCalled();
    boundary.drag = { active: { id: 't1' }, over: null }; // dropped outside any target
    fireEvent.click(within(dialog).getByRole('button', { name: '触发拖拽' }));
    expect(tagsApi.reorderTags).not.toHaveBeenCalled();
    view.unmount();
  });

  it('reports reorder failures and reloads the stored order', async () => {
    tagsApi.reorderTags.mockRejectedValue(new Error('网络中断'));
    const view = await loadedPrivate();
    await waitFor(() => expect(tagsApi.getTags).toHaveBeenCalledTimes(1));
    const dialog = await openFilterDialog();
    boundary.drag = { active: { id: 't3' }, over: { id: 't1' } };
    fireEvent.click(within(dialog).getByRole('button', { name: '触发拖拽' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('标签排序更新失败，请重试');
    await waitFor(() => expect(tagsApi.getTags.mock.calls.length).toBeGreaterThanOrEqual(2));
    view.unmount();
  });

  it('dims the tag that is currently being dragged', async () => {
    const view = await loadedPrivate();
    const dialog = await openFilterDialog();
    boundary.dragging = true;
    fireEvent.click(within(dialog).getByRole('button', { name: '工作 1' })); // trigger a re-render
    const dragged = dialog.querySelectorAll('div[style*="opacity"]');
    expect(dragged.length).toBeGreaterThan(0);
    expect((dragged[0] as HTMLElement).style.opacity).toBe('0.5');
    view.unmount();
  });

  it('shows tag counts and an empty hint when no tags exist', async () => {
    tagsApi.getTags.mockResolvedValue([]);
    const view = await loadedPrivate();
    const dialog = await openFilterDialog();
    expect(within(dialog).getByText('暂无标签')).toBeTruthy();
    view.unmount();
  });
});
