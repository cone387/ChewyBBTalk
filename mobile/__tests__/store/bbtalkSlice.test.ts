jest.mock('../../src/services/api', () => ({
  bbtalkApi: {},
}));

import reducer, { loadBBTalks, setBBTalksFromCache } from '../../src/store/slices/bbtalkSlice';
import type { BBTalk } from '../../src/types';

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
  it('shows cached talks during startup load and lets network replace them later', () => {
    let state = reducer(undefined, loadBBTalks.pending('', {}));
    expect(state.isLoading).toBe(true);

    state = reducer(state, setBBTalksFromCache([makeTalk('cached-1', 'cached')]));

    expect(state.bbtalks.map(item => item.id)).toEqual(['cached-1']);
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

    expect(state.bbtalks.map(item => item.id)).toEqual(['network-1']);
    expect(state.isLoading).toBe(false);
    expect(state.hasMore).toBe(true);
    expect(state.totalCount).toBe(12);
  });
});