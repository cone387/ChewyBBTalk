import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import { bbtalkApi } from '../../services/api'
import type { BBTalk, Attachment } from '../../types'

interface BBTalkState {
  bbtalks: BBTalk[]
  selectedBBTalkId: string | null
  currentPage: number
  hasMore: boolean
  selectedTagIds: string[]
  searchKeyword: string
  isLoading: boolean
  error: string | null
  totalCount: number  // 总的 BBTalk 数量
}

const initialState: BBTalkState = {
  bbtalks: [],
  selectedBBTalkId: null,
  currentPage: 1,
  hasMore: true,
  selectedTagIds: [],
  searchKeyword: '',
  isLoading: false,
  error: null,
  totalCount: 0,
}

// 异步Actions
export const loadBBTalks = createAsyncThunk(
  'bbtalk/loadBBTalks',
  async (params: { page?: number; search?: string; tags?: string[] } = {}, { rejectWithValue }) => {
    try {
      const { page = 1, search, tags } = params
      const result = await bbtalkApi.getBBTalks({ 
        page, 
        search,
        tags__name: tags?.join(',') 
      })
      return { 
        bbtalks: result.results, 
        page, 
        hasMore: !!result.next,
        totalCount: result.count,
        isFullLoad: !search && (!tags || tags.length === 0)  // 标记是否是全量加载
      }
    } catch (error: any) {
      return rejectWithValue(error.message || '加载BBTalk失败')
    }
  }
)

export const loadMoreBBTalks = createAsyncThunk(
  'bbtalk/loadMoreBBTalks',
  async (params: { search?: string; tags?: string[] } = {}, { getState, rejectWithValue }) => {
    try {
      const state = getState() as any
      const currentPage = state.bbtalk.currentPage
      const nextPage = currentPage + 1
      
      const { search, tags } = params
      const result = await bbtalkApi.getBBTalks({ 
        page: nextPage, 
        search,
        tags__name: tags?.join(',') 
      })
      return { 
        bbtalks: result.results, 
        page: nextPage, 
        hasMore: !!result.next 
      }
    } catch (error: any) {
      return rejectWithValue(error.message || '加载更多BBTalk失败')
    }
  }
)

export const createBBTalkAsync = createAsyncThunk(
  'bbtalk/createBBTalk',
  async (data: {
    content: string
    tags?: string[]
    attachments?: Attachment[]
    visibility?: 'public' | 'private' | 'friends'
    context?: Record<string, any>
  }, { rejectWithValue }) => {
    try {
      const bbtalk = await bbtalkApi.createBBTalk(data)
      return bbtalk
    } catch (error: any) {
      return rejectWithValue(error.message || '创建 BBTalk失败')
    }
  }
)

export const updateBBTalkAsync = createAsyncThunk(
  'bbtalk/updateBBTalk',
  async ({ id, data }: { id: string; data: Partial<BBTalk> }, { rejectWithValue }) => {
    try {
      const bbtalk = await bbtalkApi.updateBBTalk(id, data)
      return bbtalk
    } catch (error: any) {
      return rejectWithValue(error.message || '更新BBTalk失败')
    }
  }
)

export const deleteBBTalkAsync = createAsyncThunk(
  'bbtalk/deleteBBTalk',
  async (id: string, { rejectWithValue }) => {
    try {
      await bbtalkApi.deleteBBTalk(id)
      return id
    } catch (error: any) {
      return rejectWithValue(error.message || '删除BBTalk失败')
    }
  }
)

const bbtalkSlice = createSlice({
  name: 'bbtalk',
  initialState,
  reducers: {
    selectBBTalk: (state, action: PayloadAction<string>) => {
      state.selectedBBTalkId = action.payload
    },
    setSelectedTags: (state, action: PayloadAction<string[]>) => {
      state.selectedTagIds = action.payload
    },
    setSearchKeyword: (state, action: PayloadAction<string>) => {
      state.searchKeyword = action.payload
    },
    clearError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      // loadBBTalks
      .addCase(loadBBTalks.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(loadBBTalks.fulfilled, (state, action) => {
        state.isLoading = false
        state.bbtalks = action.payload.bbtalks
        state.currentPage = action.payload.page
        state.hasMore = action.payload.hasMore
        // 只在全量加载时更新总数
        if (action.payload.isFullLoad) {
          state.totalCount = action.payload.totalCount
        }
      })
      .addCase(loadBBTalks.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })
      // loadMoreBBTalks
      .addCase(loadMoreBBTalks.pending, (state) => {
        state.isLoading = true
      })
      .addCase(loadMoreBBTalks.fulfilled, (state, action) => {
        state.isLoading = false
        state.bbtalks = [...state.bbtalks, ...action.payload.bbtalks]
        state.currentPage = action.payload.page
        state.hasMore = action.payload.hasMore
      })
      .addCase(loadMoreBBTalks.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })
      // createBBTalkAsync
      .addCase(createBBTalkAsync.fulfilled, (state, action) => {
        state.bbtalks.unshift(action.payload)
      })
      .addCase(createBBTalkAsync.rejected, (state, action) => {
        state.error = action.payload as string
      })
      // updateBBTalkAsync
      .addCase(updateBBTalkAsync.fulfilled, (state, action) => {
        const index = state.bbtalks.findIndex((b) => b.id === action.payload.id)
        if (index !== -1) {
          state.bbtalks[index] = action.payload
        }
      })
      .addCase(updateBBTalkAsync.rejected, (state, action) => {
        state.error = action.payload as string
      })
      // deleteBBTalkAsync
      .addCase(deleteBBTalkAsync.fulfilled, (state, action) => {
        state.bbtalks = state.bbtalks.filter((b) => b.id !== action.payload)
      })
      .addCase(deleteBBTalkAsync.rejected, (state, action) => {
        state.error = action.payload as string
      })
  },
})

export const {
  selectBBTalk,
  setSelectedTags,
  setSearchKeyword,
  clearError,
} = bbtalkSlice.actions

export default bbtalkSlice.reducer
