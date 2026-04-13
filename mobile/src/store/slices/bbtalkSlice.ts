import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { bbtalkApi } from '../../services/api';
import type { BBTalk, Attachment } from '../../types';

interface BBTalkState {
  bbtalks: BBTalk[];
  currentPage: number;
  hasMore: boolean;
  isLoading: boolean;
  error: string | null;
  totalCount: number;
}

const initialState: BBTalkState = {
  bbtalks: [],
  currentPage: 1,
  hasMore: true,
  isLoading: false,
  error: null,
  totalCount: 0,
};

export const loadBBTalks = createAsyncThunk(
  'bbtalk/loadBBTalks',
  async (params: { page?: number; search?: string; tags?: string[]; date?: string } = {}, { rejectWithValue }) => {
    try {
      const { page = 1, search, tags, date } = params;
      const result = await bbtalkApi.getBBTalks({
        page, search, tags__name: tags?.join(','),
        create_time__date: date,
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
      const result = await bbtalkApi.getBBTalks({
        page: nextPage, search: params.search, tags__name: params.tags?.join(','),
        create_time__date: params.date,
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
    content: string; tags?: string[]; attachments?: Attachment[];
    visibility?: 'public' | 'private' | 'friends'; context?: Record<string, any>;
  }, { rejectWithValue }) => {
    try {
      return await bbtalkApi.createBBTalk(data);
    } catch (error: any) {
      return rejectWithValue(error.message || '创建失败');
    }
  }
);

export const updateBBTalkAsync = createAsyncThunk(
  'bbtalk/updateBBTalk',
  async ({ id, data }: { id: string; data: Partial<BBTalk> }, { rejectWithValue }) => {
    try {
      return await bbtalkApi.updateBBTalk(id, data);
    } catch (error: any) {
      return rejectWithValue(error.message || '更新失败');
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
    optimisticDelete: (state, action: PayloadAction<string>) => {
      state.bbtalks = state.bbtalks.filter(b => b.id !== action.payload);
      state.totalCount -= 1;
    },
    undoDelete: (state, action: PayloadAction<{ bbtalk: BBTalk; index: number }>) => {
      state.bbtalks.splice(action.payload.index, 0, action.payload.bbtalk);
      state.totalCount += 1;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadBBTalks.pending, (state) => { state.isLoading = true; state.error = null; })
      .addCase(loadBBTalks.fulfilled, (state, action) => {
        state.isLoading = false;
        state.bbtalks = action.payload.bbtalks;
        state.currentPage = action.payload.page;
        state.hasMore = action.payload.hasMore;
        if (action.payload.isFullLoad) state.totalCount = action.payload.totalCount;
      })
      .addCase(loadBBTalks.rejected, (state, action) => {
        state.isLoading = false; state.error = action.payload as string;
      })
      .addCase(loadMoreBBTalks.pending, (state) => { state.isLoading = true; })
      .addCase(loadMoreBBTalks.fulfilled, (state, action) => {
        state.isLoading = false;
        state.bbtalks = [...state.bbtalks, ...action.payload.bbtalks];
        state.currentPage = action.payload.page;
        state.hasMore = action.payload.hasMore;
      })
      .addCase(loadMoreBBTalks.rejected, (state, action) => {
        state.isLoading = false; state.error = action.payload as string;
        state.hasMore = false; // Stop retrying on error
      })
      .addCase(createBBTalkAsync.fulfilled, (state, action) => {
        state.bbtalks.unshift(action.payload);
        state.totalCount += 1;
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

export const { clearError, optimisticDelete, undoDelete } = bbtalkSlice.actions;
export default bbtalkSlice.reducer;
