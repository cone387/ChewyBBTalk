import { configureStore, combineReducers, type Middleware } from '@reduxjs/toolkit';
import { getSession, onSessionChange } from '../services/session';
import bbtalkReducer from './slices/bbtalkSlice';
import tagReducer from './slices/tagSlice';

const rootReducer = combineReducers({ bbtalk: bbtalkReducer, tag: tagReducer });
// Capture the session at dispatch, not when the response eventually arrives.
const sessionGuard: Middleware = () => {
  const requests = new Map<string, number>();
  return next => action => {
    const event = action as { type?: string; meta?: { requestId?: string; requestStatus?: string } };
    const { requestId, requestStatus } = event.meta ?? {};
    if (requestId && requestStatus === 'pending') requests.set(requestId, getSession().generation);
    if (requestId && (requestStatus === 'fulfilled' || requestStatus === 'rejected')) {
      const generation = requests.get(requestId);
      requests.delete(requestId);
      if (generation !== getSession().generation) return action;
    }
    return next(action);
  };
};

export const store = configureStore({
  reducer: (state: ReturnType<typeof rootReducer> | undefined, action) =>
    rootReducer(action.type === 'session/reset' ? undefined : state, action),
  middleware: getDefaultMiddleware => getDefaultMiddleware().concat(sessionGuard),
});
onSessionChange(() => { store.dispatch({ type: 'session/reset' }); });

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
