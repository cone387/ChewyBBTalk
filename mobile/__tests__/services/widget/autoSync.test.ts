const mockSyncWidget = jest.fn((..._args: any[]) => Promise.resolve());
const mockClearWidget = jest.fn((..._args: any[]) => Promise.resolve());

jest.mock('../../../src/store', () => {
  const listeners: Array<() => void> = [];
  const state = { bbtalk: { bbtalks: [] as unknown[] } };
  return {
    __esModule: true,
    store: {
      subscribe: (fn: () => void) => {
        listeners.push(fn);
        return () => {
          const idx = listeners.indexOf(fn);
          if (idx >= 0) listeners.splice(idx, 1);
        };
      },
      getState: () => state,
    },
    __listeners: listeners,
    __state: state,
  };
});
jest.mock('../../../src/services/widget/index', () => ({
  __esModule: true,
  syncWidget: (...args: any[]) => mockSyncWidget(...args),
  clearWidget: (...args: any[]) => mockClearWidget(...args),
}));

import {
  startWidgetAutoSync,
  stopWidgetAutoSync,
  setWidgetAuthState,
} from '../../../src/services/widget/autoSync';
import { setSession, clearSession } from '../../../src/services/session';
import { setHistoryLocked, setHistoryPrivacyReady, setHistoryPrivacySuspended } from '../../../src/services/historyPrivacy';

const Store: any = require('../../../src/store');
const notify = () => { Store.__listeners.slice().forEach((l: () => void) => l()); };

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  Store.__state.bbtalk.bbtalks = [];
  Store.__listeners.length = 0;
  mockSyncWidget.mockImplementation((..._args: any[]) => Promise.resolve());
  setSession('https://test.example', 'widget-user');
  setHistoryPrivacyReady(true);
  setHistoryPrivacySuspended(false);
  setHistoryLocked(false);
  setWidgetAuthState({ authenticated: true, locked: false });
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  stopWidgetAutoSync();
  jest.useRealTimers();
  warnSpy.mockRestore();
});

describe('startWidgetAutoSync', () => {
  it('schedules one initial sync after the debounce window', async () => {
    startWidgetAutoSync();
    expect(mockSyncWidget).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(499);
    expect(mockSyncWidget).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(mockSyncWidget).toHaveBeenCalledTimes(1);
    expect(mockSyncWidget).toHaveBeenCalledWith({ authenticated: true, locked: false });
  });

  it('subscribes only once for repeated starts', async () => {
    startWidgetAutoSync();
    startWidgetAutoSync();
    expect(Store.__listeners).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(500);
    expect(mockSyncWidget).toHaveBeenCalledTimes(1);
  });

  it('immediately clears for unauthenticated callers instead of scheduling content', async () => {
    setWidgetAuthState({ authenticated: false, locked: true });
    startWidgetAutoSync();
    await jest.advanceTimersByTimeAsync(500);
    expect(mockClearWidget).toHaveBeenCalledWith('logout');
    expect(mockSyncWidget).not.toHaveBeenCalled();
  });

  it('clears synchronously on a global lock and cancels the pending debounce', async () => {
    startWidgetAutoSync();
    setHistoryLocked(true);
    expect(mockClearWidget).toHaveBeenCalledWith('locked');
    await jest.advanceTimersByTimeAsync(1000);
    expect(mockSyncWidget).not.toHaveBeenCalled();
  });

  it('clears on background and resumes normal synchronization on return', async () => {
    startWidgetAutoSync();
    setHistoryPrivacySuspended(true);
    expect(mockClearWidget).toHaveBeenCalledWith('locked');
    await jest.advanceTimersByTimeAsync(1000);
    expect(mockSyncWidget).not.toHaveBeenCalled();
    setHistoryPrivacySuspended(false);
    await jest.advanceTimersByTimeAsync(500);
    expect(mockSyncWidget).toHaveBeenCalledTimes(1);
  });

  it('cannot use caller flags to bypass a global not-ready state', () => {
    setHistoryPrivacyReady(false);
    setWidgetAuthState({ authenticated: true, locked: false });
    startWidgetAutoSync();
    expect(mockClearWidget).toHaveBeenCalledWith('locked');
  });

  it('clears and cancels old scheduled work after logout or account changes', async () => {
    startWidgetAutoSync();
    clearSession();
    expect(mockClearWidget).toHaveBeenCalledWith('logout');
    setSession('https://test.example', 'other-user');
    expect(mockClearWidget).toHaveBeenCalledWith('locked');
    await jest.advanceTimersByTimeAsync(1000);
    expect(mockSyncWidget).not.toHaveBeenCalled();
  });
});

describe('store subscription', () => {
  it('syncs when the bbtalks reference changes', async () => {
    startWidgetAutoSync();
    await jest.advanceTimersByTimeAsync(500);
    expect(mockSyncWidget).toHaveBeenCalledTimes(1);

    Store.__state.bbtalk.bbtalks = [{ id: 'new' }];
    notify();
    await jest.advanceTimersByTimeAsync(500);
    expect(mockSyncWidget).toHaveBeenCalledTimes(2);
  });

  it('ignores notifications that keep the same reference', async () => {
    startWidgetAutoSync();
    // Prime lastBBTalksRef with the current list; it starts out undefined.
    notify();
    await jest.advanceTimersByTimeAsync(500);
    expect(mockSyncWidget).toHaveBeenCalledTimes(1);
    notify();
    notify();
    await jest.advanceTimersByTimeAsync(1000);
    expect(mockSyncWidget).toHaveBeenCalledTimes(1);
  });

  it('collapses rapid changes into a single debounced sync', async () => {
    startWidgetAutoSync();
    await jest.advanceTimersByTimeAsync(500);

    for (let i = 0; i < 3; i += 1) {
      Store.__state.bbtalk.bbtalks = [{ i }];
      notify();
      await jest.advanceTimersByTimeAsync(200);
    }
    await jest.advanceTimersByTimeAsync(600);
    expect(mockSyncWidget).toHaveBeenCalledTimes(2);
  });
});

describe('stopWidgetAutoSync', () => {
  it('cancels pending timers and unsubscribes', async () => {
    startWidgetAutoSync();
    stopWidgetAutoSync();
    await jest.advanceTimersByTimeAsync(5000);
    expect(mockSyncWidget).not.toHaveBeenCalled();
    expect(Store.__listeners).toHaveLength(0);

    Store.__state.bbtalk.bbtalks = [{ id: 'x' }];
    notify();
    await jest.advanceTimersByTimeAsync(5000);
    expect(mockSyncWidget).not.toHaveBeenCalled();
  });

  it('allows a clean restart after stopping', async () => {
    startWidgetAutoSync();
    await jest.advanceTimersByTimeAsync(500);
    stopWidgetAutoSync();

    startWidgetAutoSync();
    await jest.advanceTimersByTimeAsync(500);
    expect(mockSyncWidget).toHaveBeenCalledTimes(2);
  });
});

describe('sync failure handling', () => {
  it('warns instead of throwing when syncWidget rejects', async () => {
    mockSyncWidget.mockImplementationOnce(() => Promise.reject(new Error('widget 不可用')));
    startWidgetAutoSync();
    await jest.advanceTimersByTimeAsync(500);
    await Promise.resolve();
    expect(warnSpy).toHaveBeenCalledWith('[HomeWidget] auto sync failed:', expect.any(Error));
  });
});
