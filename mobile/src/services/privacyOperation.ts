import { getSession, isCurrentSession } from './session';
import { getHistoryPrivacyRevision, historyIsLocked, historyPrivacyIsReady, historyPrivacyIsSuspended } from './historyPrivacy';

/** A sensitive action must not resume after a lock, app suspension or account change. */
export function createPrivacyOperation() {
  const session = getSession();
  const revision = getHistoryPrivacyRevision();
  const isCurrent = () => isCurrentSession(session) && revision === getHistoryPrivacyRevision()
    && historyPrivacyIsReady() && !historyIsLocked() && !historyPrivacyIsSuspended();
  return {
    isCurrent,
    assertCurrent() { if (!isCurrent()) throw new Error('内容已锁定，请解锁后重试'); },
  };
}
