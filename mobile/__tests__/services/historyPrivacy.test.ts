describe('history privacy session isolation', () => {
  let privacy: typeof import('../../src/services/historyPrivacy');
  let session: typeof import('../../src/services/session');

  beforeEach(() => {
    jest.resetModules();
    session = require('../../src/services/session');
    privacy = require('../../src/services/historyPrivacy');
    session.setSession('https://example.com', 'alice');
  });

  it.each(['account', 'server', 'logout'])('relocks and clears readiness on %s change', (change) => {
    privacy.setHistoryPrivacyReady(true);
    privacy.setHistoryLocked(false);
    const snapshots: boolean[][] = [];
    const unsubscribe = privacy.subscribeHistoryPrivacy(() => {
      snapshots.push([privacy.historyPrivacyIsReady(), privacy.historyIsLocked()]);
    });
    if (change === 'account') session.setSession('https://example.com', 'bob');
    else if (change === 'server') session.setSession('https://other.example.com', 'alice');
    else session.clearSession();
    expect(privacy.historyPrivacyIsReady()).toBe(false);
    expect(privacy.historyIsLocked()).toBe(true);
    expect(snapshots).toContainEqual([false, true]);
    unsubscribe();
  });

  it('preserves unlocked state for the same normalized session', () => {
    privacy.setHistoryPrivacyReady(true);
    privacy.setHistoryLocked(false);
    const listener = jest.fn();
    const unsubscribe = privacy.subscribeHistoryPrivacy(listener);
    session.setSession('https://example.com/', 'alice');
    expect(listener).not.toHaveBeenCalled();
    expect(privacy.historyPrivacyIsReady()).toBe(true);
    expect(privacy.historyIsLocked()).toBe(false);
    unsubscribe();
  });

  it('stops notifying a destination after it unsubscribes', () => {
    const listener = jest.fn();
    const unsubscribe = privacy.subscribeHistoryPrivacy(listener);
    privacy.setHistoryPrivacyReady(true);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    session.clearSession();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not reset an unmounted screen timer on later activity', () => {
    const listener = jest.fn();
    const unsubscribe = privacy.onHistoryActivity(listener);
    privacy.recordHistoryActivity();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    privacy.recordHistoryActivity();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
