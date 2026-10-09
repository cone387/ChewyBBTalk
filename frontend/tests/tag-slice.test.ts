import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import tagReducer, { loadTags, createTagAsync, updateTagAsync, deleteTagAsync, selectTag, clearError } from '../src/store/slices/tagSlice';
import type { Tag } from '../src/types';

const api = vi.hoisted(() => ({
  getTags: vi.fn(), createTag: vi.fn(), updateTag: vi.fn(), deleteTag: vi.fn(),
}));
vi.mock('../src/services/api', () => ({ tagApi: api }));

function tag(id: string, sortOrder = 0, name = id): Tag {
  return { id, name, color: '', sortOrder, bbtalkCount: 0 };
}
function store() {
  return configureStore({ reducer: { tag: tagReducer } });
}
type Store = ReturnType<typeof store>;
const state = (s: Store) => s.getState().tag;

beforeEach(() => {
  vi.resetAllMocks();
  api.getTags.mockResolvedValue([tag('t1', 0), tag('t2', 1000), tag('t3', 2000)]);
});

describe('loading tags', () => {
  it('toggles the loading flag while fetching and stores the list', async () => {
    const s = store();
    const action = s.dispatch(loadTags());
    expect(state(s)).toMatchObject({ isLoading: true, error: null });
    await action;
    expect(state(s)).toMatchObject({
      isLoading: false, tags: [tag('t1', 0), tag('t2', 1000), tag('t3', 2000)], error: null,
    });
  });

  it('reports load failures with the server message or a fallback', async () => {
    api.getTags.mockRejectedValueOnce(new Error('会话过期'));
    const first = store();
    await first.dispatch(loadTags());
    expect(state(first)).toMatchObject({ isLoading: false, error: '会话过期' });

    api.getTags.mockRejectedValueOnce(new Error(''));
    const second = store();
    await second.dispatch(loadTags());
    expect(state(second)).toMatchObject({ error: '加载标签失败' });
    second.dispatch(clearError());
    expect(state(second).error).toBeNull();
  });
});

describe('creating tags', () => {
  it('appends the created tag', async () => {
    api.getTags.mockResolvedValue([]);
    api.createTag.mockResolvedValue(tag('new', 500));
    const s = store();
    await s.dispatch(loadTags());
    await s.dispatch(createTagAsync({ name: 'new' }));
    expect(api.createTag).toHaveBeenCalledWith({ name: 'new' });
    expect(state(s).tags.map(item => item.id)).toEqual(['new']);
  });

  it('reports creation failures with a fallback message for non-error rejections', async () => {
    api.createTag.mockRejectedValueOnce(new Error('名称已存在'));
    const s = store();
    await s.dispatch(createTagAsync({ name: 'dup' }));
    expect(state(s).error).toBe('名称已存在');

    api.createTag.mockRejectedValueOnce(new Error(''));
    await s.dispatch(createTagAsync({ name: 'dup' }));
    expect(state(s).error).toBe('创建标签失败');
  });
});

describe('updating tags', () => {
  it('optimistically reorders on pending and refreshes the stored copy on fulfilment', async () => {
    api.updateTag.mockResolvedValue(tag('t3', -500));
    const s = store();
    await s.dispatch(loadTags());
    await s.dispatch(updateTagAsync({ id: 't3', data: { sortOrder: -500 } }));
    expect(api.updateTag).toHaveBeenCalledWith('t3', { sortOrder: -500 });
    expect(state(s).tags.map(item => item.id)).toEqual(['t3', 't1', 't2']);
    expect(state(s).tags[0].sortOrder).toBe(-500);
  });

  it('keeps the pending reorder state when the update is rejected', async () => {
    api.updateTag.mockRejectedValue(new Error('排序被拒'));
    const s = store();
    await s.dispatch(loadTags());
    await s.dispatch(updateTagAsync({ id: 't3', data: { sortOrder: -1 } }));
    expect(state(s)).toMatchObject({ error: '排序被拒' });
    // No rollback: the optimistic order stays until the feed reloads tags.
    expect(state(s).tags.map(item => item.id)).toEqual(['t3', 't1', 't2']);

    api.updateTag.mockRejectedValueOnce(new Error(''));
    await s.dispatch(updateTagAsync({ id: 't1', data: { sortOrder: 5 } }));
    expect(state(s).error).toBe('更新标签失败');
  });

  it('treats tags without a sortOrder as zero while sorting', async () => {
    api.getTags.mockResolvedValue([{ id: 'a', name: 'a', color: '', bbtalkCount: 0 }, tag('b', 1)]);
    api.updateTag.mockResolvedValue({ id: 'b', name: 'b', color: '', bbtalkCount: 0 }); // fulfilment drops the sortOrder
    const s = store();
    await s.dispatch(loadTags());
    await s.dispatch(updateTagAsync({ id: 'b', data: { sortOrder: -1 } }));
    expect(state(s).tags.map(item => item.id)).toEqual(['b', 'a']);
  });

  it('ignores pending updates that do not touch sortOrder', async () => {
    api.updateTag.mockResolvedValue(tag('t1', 0, '改名'));
    const s = store();
    await s.dispatch(loadTags());
    await s.dispatch(updateTagAsync({ id: 't1', data: { name: '改名' } }));
    expect(state(s).tags[0].name).toBe('改名');
    expect(state(s).tags.map(item => item.id)).toEqual(['t1', 't2', 't3']);
  });
});

describe('deleting tags', () => {
  it('removes the tag from the list', async () => {
    const s = store();
    await s.dispatch(loadTags());
    await s.dispatch(deleteTagAsync('t2'));
    expect(api.deleteTag).toHaveBeenCalledWith('t2');
    expect(state(s).tags.map(item => item.id)).toEqual(['t1', 't3']);
  });

  it('reports deletion failures with a fallback message', async () => {
    api.deleteTag.mockRejectedValueOnce(new Error('尚有关联记录'));
    const s = store();
    await s.dispatch(deleteTagAsync('t1'));
    expect(state(s).error).toBe('尚有关联记录');

    api.deleteTag.mockRejectedValueOnce(new Error(''));
    await s.dispatch(deleteTagAsync('t2'));
    expect(state(s).error).toBe('删除标签失败');
  });
});

describe('selection reducers', () => {
  it('selects a tag and keeps the initial state contract', async () => {
    const s = store();
    expect(state(s)).toEqual({ tags: [], selectedTagId: null, isLoading: false, error: null });
    s.dispatch(selectTag('t9'));
    expect(state(s).selectedTagId).toBe('t9');
  });
});
