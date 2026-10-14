import { createPrivacyOperation } from '../../src/services/privacyOperation';
import { setSession } from '../../src/services/session';
import { setHistoryLocked, setHistoryPrivacyReady, setHistoryPrivacySuspended, historyPrivacyIsReady, historyIsLocked } from '../../src/services/historyPrivacy';

beforeEach(() => { setSession('https://privacy.test', 'one'); setHistoryPrivacySuspended(false); setHistoryPrivacyReady(true); setHistoryLocked(false); });

test('background suspension invalidates external delivery without hiding an unlocked page', () => {
  const operation = createPrivacyOperation();
  setHistoryPrivacySuspended(true);
  expect(historyPrivacyIsReady()).toBe(true);
  expect(historyIsLocked()).toBe(false);
  expect(operation.isCurrent()).toBe(false);
  expect(createPrivacyOperation().isCurrent()).toBe(false);
  setHistoryPrivacySuspended(false);
  expect(operation.isCurrent()).toBe(false);
  expect(createPrivacyOperation().isCurrent()).toBe(true);
});
test('lock followed by unlock invalidates a pending share permanently', () => {
  const operation = createPrivacyOperation();
  expect(operation.isCurrent()).toBe(true);
  setHistoryLocked(true); setHistoryLocked(false);
  expect(operation.isCurrent()).toBe(false);
  expect(operation.assertCurrent).toThrow('内容已锁定');
});
test('background checks and account changes invalidate sensitive operations', () => {
  const operation = createPrivacyOperation();
  setHistoryPrivacyReady(false); setHistoryPrivacyReady(true);
  expect(operation.isCurrent()).toBe(false);
  const second = createPrivacyOperation();
  setSession('https://privacy.test', 'two');
  expect(second.isCurrent()).toBe(false);
});
test('an action started while locked or before settings are ready cannot expose content', () => {
  setHistoryLocked(true);
  expect(createPrivacyOperation().isCurrent()).toBe(false);
  setHistoryLocked(false); setHistoryPrivacyReady(false);
  expect(createPrivacyOperation().isCurrent()).toBe(false);
});
