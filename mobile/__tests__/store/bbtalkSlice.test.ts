jest.mock('../../src/services/api', () => ({
  bbtalkApi: {
    getBBTalks: jest.fn(),
    createBBTalk: jest.fn(),
    updateBBTalk: jest.fn(),
    deleteBBTalk: jest.fn(),
    togglePin: jest.fn(),
  },
}));

import { configureStore } from '@reduxjs/toolkit';
import reducer, {
  loadBBTalks, loadMoreBBTalks, createBBTalkAsync, updateBBTalkAsync, deleteBBTalkAsync, togglePinAsync,
  setBBTalksFromCache, optimisticDelete, undoDelete, incrementCommentCount, decrementCommentCount, clearError,
} from '../../src/store/slices/bbtalkSlice';
import { bbtalkApi } from '../../src/services/api';
import type { BBTalk } from '../../src/types';
import { clearSession, setSession } from '../../src/services/session';

const api = bbtalkApi as jest.Mocked<typeof bbtalkApi>;

function makeTalk(id: string, content: string): BBTalk {
  return {
    id,
    content,
    visibility: 'private',
    tags: [],
    attachments: [],
    context: {},
    isPinned: false,
    commentCount: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

describe('bbtalkSlice cache startup', () => {
  it('does not resurrect cached records after a successful empty server response', () => {
    let state = reducer(reducer(undefined, loadBBTalks.pending('empty', {})), loadBBTalks.fulfilled({
      bbtalks: [], page: 1, hasMore: false, totalCount: 0, isFullLoad: true,
    }, 'empty', {}));
    state = reducer(state, setBBTalksFromCache([makeTalk('deleted', 'old')]));
    expect(state.bbtalks).toEqual([]);
  });
  it('shows cached talks during startup load and lets network replace them later', () => {
    let state = reducer(undefined, loadBBTalks.pending('', {}));
    expect(state.isLoading).toBe(true);

    state = reducer(state, setBBTalksFromCache([makeTalk('cached-1', 'cached')]));

    expect(state.bbtalks.map((item: any) => item.id)).toEqual(['cached-1']);
    expect(state.isLoading).toBe(false);
    expect(state.hasMore).toBe(false);

    state = reducer(
      state,
      loadBBTalks.fulfilled({
        bbtalks: [makeTalk('network-1', 'network')],
        page: 1,
        hasMore: true,
        totalCount: 12,
        isFullLoad: true,
      }, '', {}),
    );

    expect(state.bbtalks.map((item: any) => item.id)).toEqual(['network-1']);
    expect(state.isLoading).toBe(false);
    expect(state.hasMore).toBe(true);
    expect(state.totalCount).toBe(12);
  });
});

describe('bbtalkSlice thunks', () => {
  function makeStore() {
    const store = configureStore({ reducer: { bbtalk: reducer } });
    return { store, state: () => (store.getState() as any).bbtalk };
  }
  const listResult = (items: BBTalk[], next: string | null = null, count = items.length) =>
    Promise.resolve({ results: items, next, previous: null, count });

  beforeEach(() => jest.clearAllMocks());

  it('loads a full page with filter params translated for the API', async () => {
    api.getBBTalks.mockReturnValue(listResult([makeTalk('a', 'hello')], 'next-page', 42));
    const { store, state } = makeStore();
    await store.dispatch(loadBBTalks({ search: 'x', tags: ['t1', 't2'], date: '2026-10-08' }));
    expect(api.getBBTalks).toHaveBeenCalledWith({ page: 1, search: 'x', tags: ['t1', 't2'], created_on: '2026-10-08' }, { signal: expect.any(AbortSignal) });
    expect(state().bbtalks.map((item: any) => item.id)).toEqual(['a']);
    expect(state().isFiltered).toBe(true);
    expect(state().hasMore).toBe(true);
    expect(state().hasLoadedFromNetwork).toBe(true);
    // Filtered loads keep the unfiltered total.
    expect(state().totalCount).toBe(0);
  });
  it('keeps the server total on unfiltered loads', async () => {
    api.getBBTalks.mockReturnValue(listResult([makeTalk('a', 'hello')], null, 42));
    const { store, state } = makeStore();
    await store.dispatch(loadBBTalks({}));
    expect(state().isFiltered).toBe(false);
    expect(state().totalCount).toBe(42);
    expect(state().hasMore).toBe(false);
  });
  it('treats an empty tag array as an unfiltered full load', async () => {
    api.getBBTalks.mockReturnValue(listResult([makeTalk('a', 'hello')], null, 9));
    const { store, state } = makeStore();
    await store.dispatch(loadBBTalks({ tags: [] }));
    expect(api.getBBTalks).toHaveBeenCalledWith({ page: 1, search: undefined, tags: [], created_on: undefined }, { signal: expect.any(AbortSignal) });
    expect(state().isFiltered).toBe(false);
    expect(state().totalCount).toBe(9);
  });
  it('defaults both thunks to an unfiltered request when called without arguments', async () => {
    api.getBBTalks.mockReturnValue(listResult([makeTalk('a', 'hello')], 'page-2', 5));
    // The declared thunk signature requires an argument; omitting one exercises the default.
    const loadFirstPage = loadBBTalks as unknown as () => any;
    const loadNextPage = loadMoreBBTalks as unknown as () => any;
    const { store, state } = makeStore();
    await store.dispatch(loadFirstPage());
    expect(api.getBBTalks).toHaveBeenLastCalledWith({ page: 1, search: undefined, tags: undefined, created_on: undefined }, { signal: expect.any(AbortSignal) });
    await store.dispatch(loadNextPage());
    expect(api.getBBTalks).toHaveBeenLastCalledWith({ page: 2, search: undefined, tags: undefined, created_on: undefined }, { signal: expect.any(AbortSignal) });
    expect(state().currentPage).toBe(2);
  });
  it('reports load failures and allows clearing the error', async () => {
    api.getBBTalks.mockRejectedValueOnce(new Error('服务不可用'));
    api.getBBTalks.mockRejectedValueOnce({});
    const { store, state } = makeStore();
    await store.dispatch(loadBBTalks({}));
    expect(state().error).toBe('服务不可用');
    expect(state().isLoading).toBe(false);
    store.dispatch(clearError());
    expect(state().error).toBeNull();
    await store.dispatch(loadBBTalks({}));
    expect(state().error).toBe('加载失败');
  });
  it('ignores a slow first response after a newer load finished', async () => {
    let resolveSlow!: (value: any) => void;
    api.getBBTalks.mockImplementationOnce(() => new Promise<any>(resolve => { resolveSlow = resolve; }));
    api.getBBTalks.mockImplementationOnce(() => listResult([makeTalk('fresh', 'x')]));
    const { store, state } = makeStore();
    const slow = store.dispatch(loadBBTalks({ search: 'old' }));
    await store.dispatch(loadBBTalks({ search: 'new' }));
    resolveSlow({ results: [makeTalk('stale', 'y')], next: null, previous: null, count: 1 });
    await slow;
    expect(state().bbtalks.map((item: any) => item.id)).toEqual(['fresh']);
  });
  it('appends the next page, skipping records hidden by an optimistic delete', async () => {
    api.getBBTalks.mockReturnValueOnce(listResult([makeTalk('a', '1')], 'page-2', 2));
    api.getBBTalks.mockReturnValueOnce(listResult([makeTalk('a2', '1'), makeTalk('b', '2')], null, 2));
    const { store, state } = makeStore();
    await store.dispatch(loadBBTalks({}));
    store.dispatch(optimisticDelete('a2'));
    expect(state().hiddenRecordIds).toEqual(['a2']);
    // A repeated optimistic delete must not duplicate the hidden id.
    store.dispatch(optimisticDelete('a2'));
    expect(state().hiddenRecordIds).toEqual(['a2']);
    await store.dispatch(loadMoreBBTalks({}));
    expect(api.getBBTalks).toHaveBeenLastCalledWith({ page: 2, search: undefined, tags: undefined, created_on: undefined }, { signal: expect.any(AbortSignal) });
    expect(state().bbtalks.map((item: any) => item.id)).toEqual(['a', 'b']);
    expect(state().currentPage).toBe(2);
    expect(state().hasMore).toBe(false);
  });
  it('stops paging after a load-more failure', async () => {
    api.getBBTalks.mockReturnValueOnce(listResult([makeTalk('a', '1')], 'page-2'));
    api.getBBTalks.mockRejectedValueOnce(new Error('断网'));
    const { store, state } = makeStore();
    await store.dispatch(loadBBTalks({}));
    await store.dispatch(loadMoreBBTalks({}));
    expect(state().error).toBe('断网');
    expect(state().hasMore).toBe(false);
    expect(state().isLoading).toBe(false);
  });
  it('ignores a stale load-more rejection after a newer load finished', async () => {
    api.getBBTalks.mockReturnValueOnce(listResult([makeTalk('a', '1')], 'page-2', 1));
    let rejectSlow!: (reason: unknown) => void;
    api.getBBTalks.mockImplementationOnce(() => new Promise<any>((_resolve, reject) => { rejectSlow = reject; }));
    api.getBBTalks.mockReturnValueOnce(listResult([makeTalk('b', '2')], null, 2));
    const { store, state } = makeStore();
    await store.dispatch(loadBBTalks({}));
    const slow = store.dispatch(loadMoreBBTalks({ search: 'old' }));
    await store.dispatch(loadMoreBBTalks({ search: 'new' }));
    rejectSlow(new Error('过期的失败'));
    await slow;
    expect(state().error).toBeNull();
    expect(state().bbtalks.map((item: any) => item.id)).toEqual(['a', 'b']);
    expect(state().currentPage).toBe(2);
  });
  it('undoes an optimistic delete back at the original position', () => {
    let state = reducer(undefined, loadBBTalks.pending('', {}));
    state = reducer(state, loadBBTalks.fulfilled({
      bbtalks: [makeTalk('a', '1'), makeTalk('b', '2'), makeTalk('c', '3')], page: 1, hasMore: false, totalCount: 3, isFullLoad: true,
    }, '', {}));
    state = reducer(state, optimisticDelete('b'));
    expect(state.bbtalks.map((item: any) => item.id)).toEqual(['a', 'c']);
    expect(state.totalCount).toBe(2);
    state = reducer(state, undoDelete({ bbtalk: makeTalk('b', '2'), index: 1 }));
    expect(state.bbtalks.map((item: any) => item.id)).toEqual(['a', 'b', 'c']);
    expect(state.totalCount).toBe(3);
    expect(state.hiddenRecordIds).toEqual([]);
  });
  it('adds a created talk once and keeps update payloads', async () => {
    const created = makeTalk('new', 'hello');
    api.createBBTalk.mockResolvedValue(created);
    const { store, state } = makeStore();
    await store.dispatch(createBBTalkAsync({ content: 'hello' }));
    expect(state().bbtalks.map((item: any) => item.id)).toEqual(['new']);
    expect(state().totalCount).toBe(1);
    await store.dispatch(createBBTalkAsync({ content: 'hello' }));
    expect(state().bbtalks).toHaveLength(1);
    const updated = { ...created, content: 'changed' };
    api.updateBBTalk.mockResolvedValueOnce(updated);
    await store.dispatch(updateBBTalkAsync({ id: 'new', data: { content: 'changed' } }));
    expect(state().bbtalks[0].content).toBe('changed');
  });
  it('rejects create/update/delete/toggle failures with structured payloads', async () => {
    const { store } = makeStore();
    api.createBBTalk.mockRejectedValueOnce(Object.assign(new Error('冲突'), { status: 409, code: 'dup' }));
    const created = await store.dispatch(createBBTalkAsync({ content: 'x' })) as any;
    expect(created.payload).toEqual({ message: '冲突', status: 409, code: 'dup' });
    api.updateBBTalk.mockRejectedValueOnce(Object.assign(new Error('过期'), { code: 'stale', current: { id: 'old' } }));
    const updated = await store.dispatch(updateBBTalkAsync({ id: 'a', data: {} })) as any;
    expect(updated.payload).toEqual({ message: '过期', code: 'stale', current: { id: 'old' } });
    api.deleteBBTalk.mockRejectedValueOnce(new Error('无权限'));
    const deleted = await store.dispatch(deleteBBTalkAsync('a')) as any;
    expect(deleted.payload).toBe('无权限');
    api.togglePin.mockRejectedValueOnce({});
    const pinned = await store.dispatch(togglePinAsync('a')) as any;
    expect(pinned.payload).toBe('置顶操作失败');
  });
  it('falls back to default messages for message-less failures', async () => {
    const { store } = makeStore();
    api.createBBTalk.mockRejectedValueOnce({});
    const created = await store.dispatch(createBBTalkAsync({ content: 'x' })) as any;
    expect(created.payload).toEqual({ message: '创建失败', status: undefined, code: undefined });
    api.updateBBTalk.mockRejectedValueOnce({});
    const updated = await store.dispatch(updateBBTalkAsync({ id: 'a', data: {} })) as any;
    expect(updated.payload).toEqual({ message: '更新失败', code: undefined, current: undefined });
    api.deleteBBTalk.mockRejectedValueOnce({});
    const deleted = await store.dispatch(deleteBBTalkAsync('a')) as any;
    expect(deleted.payload).toBe('删除失败');
    api.getBBTalks.mockReturnValueOnce(listResult([makeTalk('a', '1')], 'page-2'));
    api.getBBTalks.mockRejectedValueOnce({});
    await store.dispatch(loadBBTalks({}));
    await store.dispatch(loadMoreBBTalks({}));
    const state = (store.getState() as any).bbtalk;
    expect(state.error).toBe('加载更多失败');
  });
  it('keeps the list unchanged when an update returns an unknown record', async () => {
    api.getBBTalks.mockReturnValueOnce(listResult([makeTalk('a', '1')]));
    api.updateBBTalk.mockResolvedValueOnce(makeTalk('ghost', 'changed'));
    const { store, state } = makeStore();
    await store.dispatch(loadBBTalks({}));
    await store.dispatch(updateBBTalkAsync({ id: 'ghost', data: { content: 'changed' } }));
    expect(state().bbtalks.map((item: any) => item.id)).toEqual(['a']);
    expect(state().bbtalks[0].content).toBe('1');
  });
  it('re-sorts pinned items even when the pin toggle returns an unknown record', async () => {
    const pinnedOld = { ...makeTalk('old', '1'), isPinned: true, updatedAt: '2026-01-01T00:00:00Z' };
    const fresh = { ...makeTalk('fresh', '2'), isPinned: false, updatedAt: '2026-03-01T00:00:00Z' };
    api.getBBTalks.mockReturnValueOnce(listResult([fresh, pinnedOld], null, 2));
    api.togglePin.mockResolvedValueOnce({ ...makeTalk('ghost', 'x'), isPinned: true });
    const { store, state } = makeStore();
    await store.dispatch(loadBBTalks({}));
    await store.dispatch(togglePinAsync('ghost'));
    expect(state().bbtalks.map((item: any) => item.id)).toEqual(['old', 'fresh']);
  });
  it('removes a deleted talk from the list', async () => {
    api.getBBTalks.mockReturnValueOnce(listResult([makeTalk('a', '1'), makeTalk('b', '2')], null, 2));
    api.deleteBBTalk.mockResolvedValueOnce(undefined as never);
    const { store, state } = makeStore();
    await store.dispatch(loadBBTalks({}));
    await store.dispatch(deleteBBTalkAsync('a'));
    expect(state().bbtalks.map((item: any) => item.id)).toEqual(['b']);
    expect(state().totalCount).toBe(1);
  });
  it('re-sorts with pinned talks first, newest update winning ties', async () => {
    const older = { ...makeTalk('older', '1'), updatedAt: '2026-01-01T00:00:00Z', isPinned: true };
    const newer = { ...makeTalk('newer', '2'), updatedAt: '2026-02-01T00:00:00Z', isPinned: false };
    api.getBBTalks.mockReturnValueOnce(listResult([newer, older], null, 2));
    api.togglePin.mockResolvedValueOnce({ ...newer, isPinned: true } as never);
    const { store, state } = makeStore();
    await store.dispatch(loadBBTalks({}));
    await store.dispatch(togglePinAsync('newer'));
    expect(state().bbtalks.map((item: any) => item.id)).toEqual(['newer', 'older']);
    api.togglePin.mockResolvedValueOnce({ ...older, isPinned: false } as never);
    await store.dispatch(togglePinAsync('older'));
    expect(state().bbtalks.map((item: any) => item.id)).toEqual(['newer', 'older']);
  });
});

describe('bbtalkSlice comment counters', () => {
  function loadedWith(talk: BBTalk) {
    let state = reducer(undefined, loadBBTalks.pending('', {}));
    return reducer(state, loadBBTalks.fulfilled({ bbtalks: [talk], page: 1, hasMore: false, totalCount: 1, isFullLoad: true }, '', {}));
  }
  it('increments and decrements with a floor at zero, ignoring unknown ids', () => {
    let state = loadedWith({ ...makeTalk('a', 'x'), commentCount: 1 });
    state = reducer(state, incrementCommentCount('a'));
    expect(state.bbtalks[0].commentCount).toBe(2);
    state = reducer(state, decrementCommentCount('a'));
    state = reducer(state, decrementCommentCount('a'));
    state = reducer(state, decrementCommentCount('a'));
    expect(state.bbtalks[0].commentCount).toBe(0);
    state = reducer(state, incrementCommentCount('missing'));
    state = reducer(state, decrementCommentCount('missing'));
    expect(state.bbtalks[0].commentCount).toBe(0);
  });
  it('counts comments on a talk that never had any', () => {
    const state = loadedWith(makeTalk('a', 'x'));
    expect(state.bbtalks[0].commentCount).toBe(0);
    expect(reducer(state, incrementCommentCount('a')).bbtalks[0].commentCount).toBe(1);
  });
  it('treats a missing comment count as zero when adjusting counters', () => {
    const talk = { ...makeTalk('a', 'x'), commentCount: undefined };
    let state = loadedWith(talk);
    // Decrementing from an absent count cannot go below zero and stays unset.
    state = reducer(state, decrementCommentCount('a'));
    expect(state.bbtalks[0].commentCount).toBeUndefined();
    state = reducer(state, incrementCommentCount('a'));
    expect(state.bbtalks[0].commentCount).toBe(1);
  });
});

describe('feed request budgets', () => {
  it('inserts a newly created unpinned record after the existing pinned records', () => {
    const pinned = { ...makeTalk('pinned', 'pinned'), isPinned: true };
    let state = reducer(undefined, setBBTalksFromCache([pinned, makeTalk('old', 'old')]));
    state = reducer(state, createBBTalkAsync.fulfilled(makeTalk('new', 'new'), 'create', { content: 'new' }));
    expect(state.bbtalks.map(b => b.id)).toEqual(['pinned', 'new', 'old']);
  });
  it('cancels old account reads and refuses their response even outside the root middleware', async () => {
    setSession('https://server.example', 'alice');
    let finish!: (value: any) => void;
    api.getBBTalks.mockClear().mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const store = configureStore({ reducer: { bbtalk: reducer } });
    const first = store.dispatch(loadBBTalks({}));
    const signal = (api.getBBTalks.mock.calls[0] as any)[1].signal;
    clearSession();
    expect(signal.aborted).toBe(true);
    finish({ count: 1, next: null, previous: null, results: [makeTalk('private', 'secret')] });
    await first;
    expect(store.getState().bbtalk.bbtalks).toEqual([]);
  });
  it('updates the persisted preview with comment mutations without a feed reload', () => {
    const comment = { uid: 'c1', content: 'comment', user: 1, userDisplayName: '', userAvatar: '', userUsername: '', createdAt: '', updatedAt: '' };
    let state = reducer(undefined, setBBTalksFromCache([{ ...makeTalk('a', 'hello'), commentPreview: [] }]));
    state = reducer(state, incrementCommentCount({ id: 'a', comment }));
    expect(state.bbtalks[0]).toMatchObject({ commentCount: 1, commentPreview: [comment] });
    state = reducer(state, decrementCommentCount({ id: 'a', commentId: 'c1' }));
    expect(state.bbtalks[0]).toMatchObject({ commentCount: 0, commentPreview: [] });
  });
  it('coalesces concurrent identical queries and applies the result to the latest dispatch', async () => {
    api.getBBTalks.mockClear();
    let finish!: (value: any) => void;
    api.getBBTalks.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const store = configureStore({ reducer: { bbtalk: reducer } });
    const first = store.dispatch(loadBBTalks({ tags: ['work'] }));
    const second = store.dispatch(loadBBTalks({ tags: ['work'] }));
    expect(api.getBBTalks).toHaveBeenCalledTimes(1);
    finish({ count: 1, next: null, previous: null, results: [makeTalk('latest', 'result')] });
    await Promise.all([first, second]);
    expect(store.getState().bbtalk.bbtalks[0].id).toBe('latest');
  });
  it('aborts obsolete filters and ignores late old responses', async () => {
    api.getBBTalks.mockClear();
    let finish!: (value: any) => void;
    api.getBBTalks.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }))
      .mockResolvedValueOnce({ count: 1, next: null, previous: null, results: [makeTalk('new', 'new')] });
    const store = configureStore({ reducer: { bbtalk: reducer } });
    const first = store.dispatch(loadBBTalks({ tags: ['old'] }));
    const signal = (api.getBBTalks.mock.calls[0] as any)[1]?.signal;
    await store.dispatch(loadBBTalks({ tags: ['new'] }));
    expect(signal?.aborted).toBe(true);
    finish({ count: 1, next: null, previous: null, results: [makeTalk('old', 'old')] });
    await first;
    expect(store.getState().bbtalk.bbtalks[0].id).toBe('new');
  });
});
