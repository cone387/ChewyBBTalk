import { configureStore } from '@reduxjs/toolkit'
import bbtalkReducer from './slices/bbtalkSlice'
import tagReducer from './slices/tagSlice'

export const store = configureStore({
  reducer: {
    bbtalk: bbtalkReducer,
    tag: tagReducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
