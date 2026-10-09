import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import bbtalkReducer, {
  invalidateFeed, selectBBTalk, setSelectedTags, setSearchKeyword, clearError,
  optimisticDelete, undoDelete,
  loadBBTalks, loadMoreBBTalks, loadPublicBBTalks, loadMorePublicBBTalks,
  createBBTalkAsync, updateBBTalkAsync, deleteBBTalkAsync,
} from '../src/store/slices/bbtalkSlice';
import type { BBTalk } from '../src/types';

const api = vi.hoisted(() => ({
  getBBTalks: vi.fn(), getPublicBBTalks: vi.fn(), createBBTalk: vi.fn(),
  updateBBTalk: vi.fn(), deleteBBTalk: vi.fn(),
}));
vi.mock('../src/services/api', () => ({ bbtalkApi: api }));

function record(id: string, content = `内容${id}`): BBTalk {
  return { id, content, visibility: 'private', tags: [], attachments: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: `v-${id}` };
}
function paged(results: BBTalk[], next: string | null = null, count = results.length) {
  return { count, next, previous: null, results };
}
function store() {
  return configureStore({ reducer: { bbtalk: bbtalkReducer } });
}
type Store = ReturnType<typeof store>;
const state = (s: Store) => s.getState().bbtalk;

beforeEach(() => {
  vi.resetAllMocks();
  api.getBBTalks.mockResolvedValue(paged([record('b1'), record('b2')]));
});

describe('loadBBTalks', () => {
  it('maps filters to query parameters and stores the first page', async () => {
    const s = store();
    await s.dispatch(loadBBTalks({
      page: 2, search: '关键', tags: ['工作', '生活'], hasAttachments: true, dateFrom: '2026-01-01', dateTo: '2026-01-31',
    }));
    expect(api.getBBTalks).toHaveBeenCalledWith({
      page: 2, search: '关键', tags__name: '工作,生活', has_attachments: true,
      create_date__gte: '2026-01-01', create_date__lte: '2026-01-31',
    });
    expect(state(s)).toMatchObject({
      bbtalks: [record('b1'), record('b2')], currentPage: 2, hasMore: false, isLoading: false,
      totalCount: 0, // filtered loads never refresh the total
    });
  });

  it('keeps the previous total when the load is filtered', async () => {
    const s = store();
    await s.dispatch(loadBBTalks()); // full load, totalCount 2
    api.getBBTalks.mockResolvedValue(paged([record('b3')], null, 99));
    await s.dispatch(loadBBTalks({ search: '关键' }));
    expect(state(s).bbtalks).toHaveLength(1);
    expect(state(s).totalCount).toBe(2);
  });

  it('excludes records hidden by an optimistic delete', async () => {
    const s = store();
    s.dispatch(optimisticDelete('b1'));
    await s.dispatch(loadBBTalks());
    expect(state(s).bbtalks.map(item => item.id)).toEqual(['b2']);
  });

  it('records the failure message', async () => {
    api.getBBTalks.mockRejectedValue(new Error('服务不可用'));
    const s = store();
    await s.dispatch(loadBBTalks());
    expect(state(s)).toMatchObject({ error: '服务不可用', isLoading: false, bbtalks: [] });
    s.dispatch(clearError());
    expect(state(s).error).toBeNull();
  });

  it('ignores responses from superseded requests', async () => {
    const slow = { count: 1, next: null, previous: null, results: [record('slow')] };
    const fast = { count: 1, next: null, previous: null, results: [record('fast')] };
    let resolveSlow!: (value: typeof slow) => void;
    let resolveFast!: (value: typeof fast) => void;
    api.getBBTalks.mockImplementationOnce(() => new Promise(resolve => { resolveSlow = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { resolveFast = resolve; }));
    const s = store();
    const slowAction = s.dispatch(loadBBTalks());
    const fastAction = s.dispatch(loadBBTalks());
    resolveFast(fast);
    await fastAction;
    expect(state(s).bbtalks.map(item => item.id)).toEqual(['fast']);
    resolveSlow(slow);
    await slowAction;
    expect(state(s).bbtalks.map(item => item.id)).toEqual(['fast']);
    expect(state(s).activeRequestId).toBeUndefined();
  });
});

describe('loadMoreBBTalks', () => {
  it('appends the next page computed from current state', async () => {
    const s = store();
    await s.dispatch(loadBBTalks({ page: 1 }));
    api.getBBTalks.mockResolvedValue(paged([record('b3')], '/?page=3'));
    await s.dispatch(loadMoreBBTalks({ search: 'x', tags: ['t'] }));
    expect(api.getBBTalks).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, search: 'x', tags__name: 't' }));
    expect(state(s).bbtalks.map(item => item.id)).toEqual(['b1', 'b2', 'b3']);
    expect(state(s)).toMatchObject({ currentPage: 2, hasMore: true });
  });

  it('reports failures', async () => {
    const s = store();
    api.getBBTalks.mockRejectedValue(new Error('网关超时'));
    await s.dispatch(loadMoreBBTalks());
    expect(state(s)).toMatchObject({ error: '网关超时', isLoading: false });
  });
});

describe('public feed', () => {
  it('loads and paginates public records', async () => {
    const s = store();
    api.getPublicBBTalks.mockResolvedValueOnce(paged([record('p1')], '/?page=2', 5))
      .mockResolvedValueOnce(paged([record('p2')], null, 5));
    await s.dispatch(loadPublicBBTalks({ page: 1 }));
    expect(state(s)).toMatchObject({ bbtalks: [record('p1')], currentPage: 1, hasMore: true, totalCount: 5 });
    await s.dispatch(loadMorePublicBBTalks());
    expect(api.getPublicBBTalks).toHaveBeenLastCalledWith({ page: 2 });
    expect(state(s).bbtalks.map(item => item.id)).toEqual(['p1', 'p2']);
    expect(state(s).hasMore).toBe(false);
  });

  it('records public feed failures', async () => {
    api.getPublicBBTalks.mockRejectedValue(new Error('匿名被拒'));
    const s = store();
    await s.dispatch(loadPublicBBTalks());
    expect(state(s).error).toBe('匿名被拒');
  });

  it('ignores superseded public responses and reports load-more failures', async () => {
    const slow = { count: 1, next: null, previous: null, results: [record('slow')] };
    const fast = { count: 1, next: null, previous: null, results: [record('fast')] };
    let resolveSlow!: (value: typeof slow) => void;
    let resolveFast!: (value: typeof fast) => void;
    api.getPublicBBTalks.mockImplementationOnce(() => new Promise(resolve => { resolveSlow = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { resolveFast = resolve; }));
    const s = store();
    const slowAction = s.dispatch(loadPublicBBTalks());
    const fastAction = s.dispatch(loadPublicBBTalks());
    resolveFast(fast);
    await fastAction;
    resolveSlow(slow);
    await slowAction;
    expect(state(s).bbtalks.map(item => item.id)).toEqual(['fast']);

    api.getPublicBBTalks.mockRejectedValue(new Error('翻页失败'));
    await s.dispatch(loadMorePublicBBTalks());
    expect(state(s).error).toBe('翻页失败');
  });
});

describe('record mutations', () => {
  it('keeps newly created records when an earlier refresh completes afterwards', async () => {
    const s = store();
    await s.dispatch(loadBBTalks());
    let finishRefresh!: (value: ReturnType<typeof paged>) => void;
    api.getBBTalks.mockImplementationOnce(() => new Promise(resolve => { finishRefresh = resolve; }));
    const refresh = s.dispatch(loadBBTalks());
    api.createBBTalk.mockResolvedValue(record('new'));
    await s.dispatch(createBBTalkAsync({ content: 'new' }));
    finishRefresh(paged([record('b1'), record('b2')]));
    await refresh;
    expect(state(s).bbtalks.map(item => item.id)).toEqual(['new', 'b1', 'b2']);
    expect(state(s).totalCount).toBe(3);
    expect(state(s).isLoading).toBe(false);
  });

  it('prepends new records once and reports create failures', async () => {
    const s = store();
    api.createBBTalk.mockResolvedValue(record('n1'));
    await s.dispatch(createBBTalkAsync({ content: '新' }));
    expect(state(s).bbtalks.map(item => item.id)).toEqual(['n1']);
    await s.dispatch(createBBTalkAsync({ content: '重复' }));
    expect(state(s).bbtalks.map(item => item.id)).toEqual(['n1']);
    api.createBBTalk.mockRejectedValue(new Error('内容过长'));
    await s.dispatch(createBBTalkAsync({ content: 'x' }));
    expect(state(s).error).toBe('内容过长');
  });

  it('replaces updated records in place and surfaces conflict payloads', async () => {
    const s = store();
    await s.dispatch(loadBBTalks());
    api.updateBBTalk.mockResolvedValue(record('b1', '改后的内容'));
    await s.dispatch(updateBBTalkAsync({ id: 'b1', data: { content: '改后的内容' }, expectedUpdatedAt: 'v-b1' }));
    expect(api.updateBBTalk).toHaveBeenCalledWith('b1', { content: '改后的内容' }, 'v-b1');
    expect(state(s).bbtalks[0].content).toBe('改后的内容');
    expect(state(s).bbtalks).toHaveLength(2);
    const conflict = Object.assign(new Error('冲突'), { code: 'edit_conflict', current: { uid: 'b1' } });
    api.updateBBTalk.mockRejectedValue(conflict);
    await s.dispatch(updateBBTalkAsync({ id: 'b1', data: {} }));
    expect(state(s).error).toBe('冲突');
  });

  it('removes deleted records and reports delete failures', async () => {
    const s = store();
    await s.dispatch(loadBBTalks());
    api.deleteBBTalk.mockResolvedValue(undefined);
    await s.dispatch(deleteBBTalkAsync('b1'));
    expect(state(s).bbtalks.map(item => item.id)).toEqual(['b2']);
    api.deleteBBTalk.mockRejectedValue(new Error('删除被拒'));
    await s.dispatch(deleteBBTalkAsync('b2'));
    expect(state(s).error).toBe('删除被拒');
  });
});

describe('synchronous reducers', () => {
  it('invalidates the feed state', () => {
    const s = store();
    s.dispatch(invalidateFeed());
    expect(state(s)).toMatchObject({ isLoading: false, hasMore: false, activeRequestId: undefined });
  });

  it('optimistic delete and undo restore position and count', async () => {
    const s = store();
    await s.dispatch(loadBBTalks());
    s.dispatch(optimisticDelete('b1'));
    expect(state(s)).toMatchObject({
      bbtalks: [record('b2')], hiddenRecordIds: ['b1'], totalCount: 1,
    });
    s.dispatch(undoDelete({ bbtalk: record('b1'), index: 0 }));
    expect(state(s)).toMatchObject({
      bbtalks: [record('b1'), record('b2')], hiddenRecordIds: [], totalCount: 2,
    });
    s.dispatch(setSelectedTags(['t1', 't2']));
    s.dispatch(setSearchKeyword('词'));
    s.dispatch(selectBBTalk('b2'));
    expect(state(s)).toMatchObject({ selectedTagIds: ['t1', 't2'], searchKeyword: '词', selectedBBTalkId: 'b2' });
  });
});
