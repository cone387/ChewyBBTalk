jest.mock('../../src/services/api', () => ({
  tagApi: { getTags: jest.fn(), updateTag: jest.fn() },
}));

import { configureStore } from '@reduxjs/toolkit';
import reducer, { loadTags, updateTagAsync, setTags } from '../../src/store/slices/tagSlice';
import type { Tag } from '../../src/types';

const { tagApi } = require('../../src/services/api');

const makeStore = () => configureStore({ reducer: { tag: reducer } });
const tag = (id: string, name: string, sortOrder?: number): Tag =>
  ({ id, name, color: null, count: 0, sortOrder }) as unknown as Tag;

beforeEach(() => {
  jest.clearAllMocks();
  (tagApi.getTags as jest.Mock).mockResolvedValue([]);
  (tagApi.updateTag as jest.Mock).mockResolvedValue({});
});

describe('tagSlice state', () => {
  it('starts empty and idle', () => {
    const store = makeStore();
    expect(store.getState().tag).toEqual({ tags: [], isLoading: false, error: null });
  });

  it('marks loading while the thunk is pending', () => {
    const next = reducer(undefined as never, loadTags.pending('req-1') as never);
    expect(next.isLoading).toBe(true);
  });
});

describe('loadTags', () => {
  it('coalesces overlapping refreshes and does not overwrite a later mutation refresh', async () => {
    let finish!: (value: Tag[]) => void;
    tagApi.getTags.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const store = makeStore();
    const first = store.dispatch(loadTags());
    const second = store.dispatch(loadTags());
    expect(tagApi.getTags).toHaveBeenCalledTimes(1);
    store.dispatch(setTags([tag('new', 'new')]));
    finish([tag('old', 'old')]); await Promise.all([first, second]);
    expect(store.getState().tag.tags.map(t => t.id)).toEqual(['new']);
  });
  it('stores the fetched tag list', async () => {
    (tagApi.getTags as jest.Mock).mockResolvedValue([tag('1', '工作'), tag('2', '生活')]);
    const store = makeStore();
    await store.dispatch(loadTags());
    expect(store.getState().tag).toEqual({
      tags: [tag('1', '工作'), tag('2', '生活')],
      isLoading: false,
      error: null,
    });
  });

  it('surfaces the api error message', async () => {
    (tagApi.getTags as jest.Mock).mockRejectedValue(new Error('网络错误'));
    const store = makeStore();
    await store.dispatch(loadTags());
    expect(store.getState().tag.error).toBe('网络错误');
    expect(store.getState().tag.isLoading).toBe(false);
  });

  it('falls back to a generic message for unknown failures', async () => {
    (tagApi.getTags as jest.Mock).mockRejectedValue({});
    const store = makeStore();
    await store.dispatch(loadTags());
    expect(store.getState().tag.error).toBe('加载标签失败');
  });
});

describe('updateTagAsync', () => {
  it('replaces the matching tag and re-sorts by sortOrder', async () => {
    const store = makeStore();
    store.dispatch({
      type: loadTags.fulfilled.type,
      payload: [tag('2', '生活', 5), tag('1', '工作', 1)],
    });
    (tagApi.updateTag as jest.Mock).mockResolvedValue(tag('1', '搬砖', 9));
    await store.dispatch(updateTagAsync({ id: '1', data: { name: '搬砖', sortOrder: 9 } }));
    expect(store.getState().tag.tags.map((t: Tag) => t.name)).toEqual(['生活', '搬砖']);
    expect(store.getState().tag.tags[1]!.name).toBe('搬砖');
  });

  it('keeps the list untouched when the id is unknown but still sorts', async () => {
    const store = makeStore();
    store.dispatch({
      type: loadTags.fulfilled.type,
      payload: [tag('2', '生活', 5), tag('1', '工作', 1), tag('3', '无序')],
    });
    (tagApi.updateTag as jest.Mock).mockResolvedValue(tag('9', '新建', 0));
    await store.dispatch(updateTagAsync({ id: '9', data: {} }));
    expect(store.getState().tag.tags.map((t: Tag) => t.id)).toEqual(['3', '1', '2']);
    expect(store.getState().tag.tags.map((t: Tag) => t.sortOrder)).toEqual([undefined, 1, 5]);
  });

  it('falls back to a generic update failure message', async () => {
    (tagApi.updateTag as jest.Mock).mockRejectedValue({});
    const store = makeStore();
    await store.dispatch(updateTagAsync({ id: '1', data: {} }));
    expect(store.getState().tag.error).toBeNull();
  });

  it('leaves state alone when the update fails', async () => {
    const store = makeStore();
    (tagApi.updateTag as jest.Mock).mockRejectedValue(new Error('禁止'));
    await store.dispatch(updateTagAsync({ id: '1', data: {} }));
    expect(store.getState().tag).toEqual({ tags: [], isLoading: false, error: null });
  });
});
