import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { tagApi } from '../../services/api';
import type { Tag } from '../../types';

interface TagState {
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
});

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
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadTags.pending, (state) => { state.isLoading = true; })
      .addCase(loadTags.fulfilled, (state, action) => {
        state.isLoading = false;
        state.tags = action.payload;
      })
      .addCase(loadTags.rejected, (state, action) => {
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

export default tagSlice.reducer;
