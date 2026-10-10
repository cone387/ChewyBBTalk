import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { tagApi } from '../../services/api';
import type { Tag } from '../../types';

interface TagState {
  activeRequestId?: string;
  tags: Tag[];
  isLoading: boolean;
  error: string | null;
}

const initialState: TagState = {
  tags: [],
  isLoading: false,
  error: null,
};

export const loadTags = createAsyncThunk('tag/loadTags', async (_, { rejectWithValue }) => {
  try {
    return await tagApi.getTags();
  } catch (error: any) {
    return rejectWithValue(error.message || '加载标签失败');
  }
}, { condition: (_, { getState }) => !(getState() as { tag?: TagState }).tag?.isLoading });

export const updateTagAsync = createAsyncThunk(
  'tag/updateTag',
  async ({ id, data }: { id: string; data: Partial<Tag> }, { rejectWithValue }) => {
    try {
      return await tagApi.updateTag(id, data);
    } catch (error: any) {
      return rejectWithValue(error.message || '更新标签失败');
    }
  }
);

const tagSlice = createSlice({
  name: 'tag',
  initialState,
  reducers: {
    setTags: (state, action: PayloadAction<Tag[]>) => { state.tags = action.payload; state.error = null; state.isLoading = false; state.activeRequestId = undefined; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadTags.pending, (state, action) => { state.isLoading = true; state.activeRequestId = action.meta.requestId; })
      .addCase(loadTags.fulfilled, (state, action) => {
        if (action.meta?.requestId && state.activeRequestId !== action.meta.requestId) return;
        state.activeRequestId = undefined;
        state.isLoading = false;
        state.tags = action.payload;
      })
      .addCase(loadTags.rejected, (state, action) => {
        if (action.meta?.requestId && state.activeRequestId !== action.meta.requestId) return;
        state.activeRequestId = undefined;
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(updateTagAsync.fulfilled, (state, action) => {
        const idx = state.tags.findIndex(t => t.id === action.payload.id);
        if (idx !== -1) state.tags[idx] = action.payload;
        state.tags.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      });
  },
});

export const { setTags } = tagSlice.actions;
export default tagSlice.reducer;
