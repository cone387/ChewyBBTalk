import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import { tagApi } from '../../services/api'
import type { Tag } from '../../types'

interface TagState {
  tags: Tag[]
  selectedTagId: string | null
  isLoading: boolean
  error: string | null
}

const initialState: TagState = {
  tags: [],
  selectedTagId: null,
  isLoading: false,
  error: null,
}

// 异步Actions
export const loadTags = createAsyncThunk(
  'tag/loadTags',
  async (params: { app?: 'bbtalk' | 'todo' } = {}, { rejectWithValue }) => {
    try {
      const tags = await tagApi.getTags(params)
      return tags
    } catch (error: any) {
      return rejectWithValue(error.message || '加载标签失败')
    }
  }
)

export const createTagAsync = createAsyncThunk(
  'tag/createTag',
  async (data: Partial<Tag>, { rejectWithValue }) => {
    try {
      const tag = await tagApi.createTag(data)
      return tag
    } catch (error: any) {
      return rejectWithValue(error.message || '创建标签失败')
    }
  }
)

export const updateTagAsync = createAsyncThunk(
  'tag/updateTag',
  async ({ id, data }: { id: string; data: Partial<Tag> }, { rejectWithValue }) => {
    try {
      const tag = await tagApi.updateTag(id, data)
      return tag
    } catch (error: any) {
      return rejectWithValue(error.message || '更新标签失败')
    }
  }
)

export const deleteTagAsync = createAsyncThunk(
  'tag/deleteTag',
  async (id: string, { rejectWithValue }) => {
    try {
      await tagApi.deleteTag(id)
      return id
    } catch (error: any) {
      return rejectWithValue(error.message || '删除标签失败')
    }
  }
)

const tagSlice = createSlice({
  name: 'tag',
  initialState,
  reducers: {
    selectTag: (state, action: PayloadAction<string>) => {
      state.selectedTagId = action.payload
    },
    clearError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      // loadTags
      .addCase(loadTags.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(loadTags.fulfilled, (state, action) => {
        state.isLoading = false
        state.tags = action.payload
      })
      .addCase(loadTags.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })
      // createTagAsync
      .addCase(createTagAsync.fulfilled, (state, action) => {
        state.tags.push(action.payload)
      })
      .addCase(createTagAsync.rejected, (state, action) => {
        state.error = action.payload as string
      })
      // updateTagAsync
      .addCase(updateTagAsync.pending, (state, action) => {
        // 乐观更新：立即更新本地状态
        const { id, data } = action.meta.arg
        const index = state.tags.findIndex((t) => t.id === id)
        if (index !== -1 && data.sortOrder !== undefined) {
          state.tags[index] = {
            ...state.tags[index],
            sortOrder: data.sortOrder
          }
          // 按 sortOrder 重新排序
          state.tags.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        }
      })
      .addCase(updateTagAsync.fulfilled, (state, action) => {
        const index = state.tags.findIndex((t) => t.id === action.payload.id)
        if (index !== -1) {
          state.tags[index] = action.payload
        }
        // 按 sortOrder 重新排序
        state.tags.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      })
      .addCase(updateTagAsync.rejected, (state, action) => {
        state.error = action.payload as string
        // 拒绝时不回滚，由 handleDragEnd 中的 loadTags 来恢复
      })
      // deleteTagAsync
      .addCase(deleteTagAsync.fulfilled, (state, action) => {
        state.tags = state.tags.filter((t) => t.id !== action.payload)
      })
      .addCase(deleteTagAsync.rejected, (state, action) => {
        state.error = action.payload as string
      })
  },
})

export const {
  selectTag,
  clearError,
} = tagSlice.actions

export default tagSlice.reducer
