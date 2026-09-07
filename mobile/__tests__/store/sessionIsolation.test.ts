jest.mock('../../src/services/api', () => ({ bbtalkApi: { getBBTalks: jest.fn() }, tagApi: {} }));
import { bbtalkApi } from '../../src/services/api';
import { store } from '../../src/store';
import { loadBBTalks, setBBTalksFromCache } from '../../src/store/slices/bbtalkSlice';
import { loadTags } from '../../src/store/slices/tagSlice';
import { clearSession, setSession } from '../../src/services/session';

beforeEach(() => { clearSession(); setSession('https://a.test', 1); });
it('clears records and tags on logout and ignores a pending previous-account response', async () => {
  let resolve!: (value: unknown) => void;
  (bbtalkApi.getBBTalks as jest.Mock).mockReturnValue(new Promise(done => { resolve = done; }));
  const request = store.dispatch(loadBBTalks({}));
  store.dispatch(setBBTalksFromCache([{ id: 'private' } as any]));
  store.dispatch(loadTags.pending('tags-1', undefined));
  clearSession();
  setSession('https://a.test', 2);
  expect(store.getState().bbtalk.bbtalks).toEqual([]);
  resolve({ results: [{ id: 'private' }], count: 1, next: null });
  await request;
  store.dispatch(loadTags.fulfilled([{ id: 'secret', name: 'private', color: '#fff' }], 'tags-1', undefined));
  expect(store.getState().bbtalk.bbtalks).toEqual([]);
  expect(store.getState().tag.tags).toEqual([]);
});
