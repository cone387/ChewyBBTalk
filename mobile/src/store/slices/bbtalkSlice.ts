import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { bbtalkApi } from '../../services/api';
import { getSession, isCurrentSession, onSessionChange } from '../../services/session';
import type { BBTalk, Attachment, Comment } from '../../types';

// One active feed read per store. Equal queries share the network request; a new
// filter/page cancels its predecessor without letting stale results reach Redux.
type FeedParams = Parameters<typeof bbtalkApi.getBBTalks>[0];
type FeedResult = Awaited<ReturnType<typeof bbtalkApi.getBBTalks>>;
const reads = new Map<unknown, { key: string; controller: AbortController; promise: Promise<FeedResult> }>();
onSessionChange(() => { reads.forEach(read => read.controller.abort()); reads.clear(); });
function readFeed(owner: unknown, params: FeedParams): Promise<FeedResult> {
  const session = getSession();
  const key = JSON.stringify([session.generation, params?.page ?? 1, params?.search || '',
    [...new Set(params?.tags ?? [])].sort(), params?.created_on || '']);
  const previous = reads.get(owner);
  if (previous?.key === key) return previous.promise;
  previous?.controller.abort();
  const controller = new AbortController();
  const promise = bbtalkApi.getBBTalks(params, { signal: controller.signal }).then(result => {
    if (controller.signal.aborted || !isCurrentSession(session)) throw Object.assign(new Error('请求已取消'), { name: 'AbortError' });
    return result;
  }).finally(() => { if (reads.get(owner)?.promise === promise) reads.delete(owner); });
  reads.set(owner, { key, controller, promise });
  return promise;
}

interface BBTalkState {
  activeRequestId?: string;
  hiddenRecordIds: string[];
  bbtalks: BBTalk[];
  currentPage: number;
  hasMore: boolean;
  isLoading: boolean;
  error: string | null;
  totalCount: number;
  hasLoadedFromNetwork: boolean;
  isFiltered: boolean;
}

const initialState: BBTalkState = {
  hiddenRecordIds: [],
  bbtalks: [],
  currentPage: 1,
  hasMore: true,
  isLoading: false,
  error: null,
  totalCount: 0,
  hasLoadedFromNetwork: false,
  isFiltered: false,
};

export const loadBBTalks = createAsyncThunk(
  'bbtalk/loadBBTalks',
  async (params: { page?: number; search?: string; tags?: string[]; date?: string } = {}, { getState, rejectWithValue }) => {
    try {
      const { page = 1, search, tags, date } = params;
      const result = await readFeed(getState, {
        page, search, tags: tags,
        created_on: date,
      });
      return {
        bbtalks: result.results, page, hasMore: !!result.next,
        totalCount: result.count,
        isFullLoad: !search && (!tags || tags.length === 0) && !date,
      };
    } catch (error: any) {
      return rejectWithValue(error.message || '加载失败');
    }
  }
);

export const loadMoreBBTalks = createAsyncThunk(
  'bbtalk/loadMoreBBTalks',
  async (params: { search?: string; tags?: string[]; date?: string } = {}, { getState, rejectWithValue }) => {
    try {
      const state = getState() as any;
      const nextPage = state.bbtalk.currentPage + 1;
      const result = await readFeed(getState, {
        page: nextPage, search: params.search, tags: params.tags,
        created_on: params.date,
      });
      return { bbtalks: result.results, page: nextPage, hasMore: !!result.next };
    } catch (error: any) {
      return rejectWithValue(error.message || '加载更多失败');
    }
  }
);

export const createBBTalkAsync = createAsyncThunk(
  'bbtalk/createBBTalk',
  async (data: {
    content: string; submissionKey?: string; tags?: string[]; attachments?: Attachment[];
    visibility?: 'public' | 'private' | 'friends'; context?: Record<string, any>;
  }, { rejectWithValue }) => {
    try {
      return await bbtalkApi.createBBTalk(data);
    } catch (error: any) {
      return rejectWithValue({ message: error.message || '创建失败', status: error.status, code: error.code });
    }
  }
);

export const updateBBTalkAsync = createAsyncThunk(
  'bbtalk/updateBBTalk',
  async ({ id, data, expectedUpdatedAt }: { id: string; data: Partial<BBTalk>; expectedUpdatedAt?: string }, { rejectWithValue }) => {
    try {
      return await bbtalkApi.updateBBTalk(id, data, expectedUpdatedAt);
    } catch (error: any) {
      return rejectWithValue({ message: error.message || '更新失败', code: error.code, current: error.current });
    }
  }
);

export const deleteBBTalkAsync = createAsyncThunk(
  'bbtalk/deleteBBTalk',
  async (id: string, { rejectWithValue }) => {
    try {
      await bbtalkApi.deleteBBTalk(id);
      return id;
    } catch (error: any) {
      return rejectWithValue(error.message || '删除失败');
    }
  }
);

export const togglePinAsync = createAsyncThunk(
  'bbtalk/togglePin',
  async (id: string, { rejectWithValue }) => {
    try {
      return await bbtalkApi.togglePin(id);
    } catch (error: any) {
      return rejectWithValue(error.message || '置顶操作失败');
    }
  }
);

const bbtalkSlice = createSlice({
  name: 'bbtalk',
  initialState,
  reducers: {
    clearError: (state) => { state.error = null; },
    setBBTalksFromCache: (state, action: PayloadAction<BBTalk[]>) => {
      // Only populate from cache if store is empty (avoid overwriting fresh API data)
      if (!state.hasLoadedFromNetwork && state.bbtalks.length === 0) {
        state.bbtalks = action.payload.filter(item => !state.hiddenRecordIds.includes(item.id));
        state.totalCount = action.payload.length;
        state.hasMore = false; // Cache doesn't have pagination info
        state.isLoading = false;
      }
    },
    optimisticDelete: (state, action: PayloadAction<string>) => {
      if (!state.hiddenRecordIds.includes(action.payload)) state.hiddenRecordIds.push(action.payload);
      state.bbtalks = state.bbtalks.filter(b => b.id !== action.payload);
      state.totalCount -= 1;
    },
    undoDelete: (state, action: PayloadAction<{ bbtalk: BBTalk; index: number }>) => {
      state.hiddenRecordIds = state.hiddenRecordIds.filter(id => id !== action.payload.bbtalk.id);
      state.bbtalks.splice(action.payload.index, 0, action.payload.bbtalk);
      state.totalCount += 1;
    },
    incrementCommentCount: (state, action: PayloadAction<string | { id: string; comment: Comment }>) => {
      const payload = action.payload;
      const item = state.bbtalks.find(b => b.id === (typeof payload === 'string' ? payload : payload.id));
      if (item) {
        item.commentCount = (item.commentCount ?? 0) + 1;
        if (typeof payload !== 'string' && item.commentPreview && item.commentPreview.length < 3 && !item.commentPreview.some(c => c.uid === payload.comment.uid)) {
          item.commentPreview.push(payload.comment);
        }
      }
    },
    decrementCommentCount: (state, action: PayloadAction<string | { id: string; commentId: string }>) => {
      const payload = action.payload;
      const item = state.bbtalks.find(b => b.id === (typeof payload === 'string' ? payload : payload.id));
      if (item) {
        if ((item.commentCount ?? 0) > 0) item.commentCount = (item.commentCount ?? 0) - 1;
        if (typeof payload !== 'string' && item.commentPreview) item.commentPreview = item.commentPreview.filter(c => c.uid !== payload.commentId);
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadBBTalks.pending, (state, action) => {
        state.activeRequestId = action.meta.requestId; state.isLoading = true; state.error = null; })
      .addCase(loadBBTalks.fulfilled, (state, action) => {
        if (state.activeRequestId !== action.meta.requestId) return;
        state.activeRequestId = undefined;
        state.isLoading = false;
        state.bbtalks = action.payload.bbtalks.filter(item => !state.hiddenRecordIds.includes(item.id));
        state.hasLoadedFromNetwork = true;
        state.isFiltered = !action.payload.isFullLoad;
        state.currentPage = action.payload.page;
        state.hasMore = action.payload.hasMore;
        if (action.payload.isFullLoad) state.totalCount = action.payload.totalCount;
      })
      .addCase(loadBBTalks.rejected, (state, action) => {
        if (state.activeRequestId !== action.meta.requestId) return;
        state.activeRequestId = undefined;
        state.isLoading = false; state.error = action.payload as string;
      })
      .addCase(loadMoreBBTalks.pending, (state, action) => {
        state.activeRequestId = action.meta.requestId; state.isLoading = true; })
      .addCase(loadMoreBBTalks.fulfilled, (state, action) => {
        if (state.activeRequestId !== action.meta.requestId) return;
        state.activeRequestId = undefined;
        state.isLoading = false;
        state.bbtalks = [...state.bbtalks, ...action.payload.bbtalks.filter(item => !state.hiddenRecordIds.includes(item.id))];
        state.currentPage = action.payload.page;
        state.hasMore = action.payload.hasMore;
      })
      .addCase(loadMoreBBTalks.rejected, (state, action) => {
        if (state.activeRequestId !== action.meta.requestId) return;
        state.activeRequestId = undefined;
        state.isLoading = false; state.error = action.payload as string;
        state.hasMore = false; // Stop retrying on error
      })
      .addCase(createBBTalkAsync.fulfilled, (state, action) => {
        if (!state.bbtalks.some(item => item.id === action.payload.id)) {
          const firstUnpinned = state.bbtalks.findIndex(item => !item.isPinned);
          const index = action.payload.isPinned ? 0 : firstUnpinned < 0 ? state.bbtalks.length : firstUnpinned;
          state.bbtalks.splice(index, 0, action.payload);
          state.totalCount += 1;
        }
      })
      .addCase(updateBBTalkAsync.fulfilled, (state, action) => {
        const idx = state.bbtalks.findIndex(b => b.id === action.payload.id);
        if (idx !== -1) state.bbtalks[idx] = action.payload;
      })
      .addCase(deleteBBTalkAsync.fulfilled, (state, action) => {
        state.bbtalks = state.bbtalks.filter(b => b.id !== action.payload);
        state.totalCount -= 1;
      })
      .addCase(togglePinAsync.fulfilled, (state, action) => {
        const idx = state.bbtalks.findIndex(b => b.id === action.payload.id);
        if (idx !== -1) state.bbtalks[idx] = action.payload;
        // Re-sort: pinned first, then by updatedAt
        state.bbtalks.sort((a, b) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });
      });
  },
});

export const { clearError, setBBTalksFromCache, optimisticDelete, undoDelete, incrementCommentCount, decrementCommentCount } = bbtalkSlice.actions;
export default bbtalkSlice.reducer;
