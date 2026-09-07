import { it, expect, vi } from 'vitest';
vi.mock('../src/services/api', () => ({ bbtalkApi: {} }));
import reducer, { loadBBTalks, loadMoreBBTalks, optimisticDelete, undoDelete } from '../src/store/slices/bbtalkSlice';
const result = (id: string) => ({
  bbtalks: [{ id, content: id, tags: [], attachments: [], visibility: 'private' as const, createdAt: '', updatedAt: '' }],
  page: 1, hasMore: true, totalCount: 1, isFullLoad: true,
});
it('rejects stale filter results and errors after a newer request', () => {
  let state = reducer(undefined, loadBBTalks.pending('old', { search: 'old' }));
  state = reducer(state, loadBBTalks.pending('new', { search: 'new' }));
  state = reducer(state, loadBBTalks.fulfilled(result('old'), 'old', { search: 'old' }));
  expect(state.isLoading).toBe(true);
  expect(state.bbtalks).toEqual([]);
  state = reducer(state, loadBBTalks.fulfilled(result('new'), 'new', { search: 'new' }));
  state = reducer(state, loadBBTalks.rejected(new Error('late'), 'old', { search: 'old' }, 'late'));
  expect(state.bbtalks.map(item => item.id)).toEqual(['new']);
  expect(state.error).toBeNull();
});
it('does not append an old page after foreground refresh starts', () => {
  let state = reducer(undefined, loadMoreBBTalks.pending('page', {}));
  state = reducer(state, loadBBTalks.pending('refresh', {}));
  state = reducer(state, loadBBTalks.fulfilled(result('fresh'), 'refresh', {}));
  state = reducer(state, loadMoreBBTalks.fulfilled({ ...result('old-page'), page: 2 }, 'page', {}));
  expect(state.bbtalks.map(item => item.id)).toEqual(['fresh']);
  expect(state.currentPage).toBe(1);
});

it('keeps optimistic deletion hidden during refresh and restores it on undo', () => {
  let state = reducer(undefined, loadBBTalks.pending('first', {}));
  state = reducer(state, loadBBTalks.fulfilled(result('deleted'), 'first', {}));
  const item = state.bbtalks[0];
  state = reducer(state, optimisticDelete(item.id));
  state = reducer(state, loadBBTalks.pending('refresh', {}));
  state = reducer(state, loadBBTalks.fulfilled(result('deleted'), 'refresh', {}));
  expect(state.bbtalks).toEqual([]);
  state = reducer(state, undoDelete({ bbtalk: item, index: 0 }));
  expect(state.bbtalks.map(item => item.id)).toEqual(['deleted']);
});
