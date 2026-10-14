import { onSessionChange } from './session';

let locked = true;
let ready = false;
let suspended = false;
let resumePending = false;
let revision = 0;
const listeners = new Set<() => void>();
const activityListeners = new Set<() => void>();
export const historyIsLocked = () => locked;
export const historyPrivacyIsReady = () => ready;
export const historyPrivacyIsSuspended = () => suspended;
export const historyPrivacyResumePending = () => resumePending;
export const getHistoryPrivacyRevision = () => revision;
export function setHistoryPrivacyReady(value: boolean) {
  if (ready === value) return;
  ready = value; revision += 1; listeners.forEach(listener => listener());
}
// Invalidate pending external deliveries without destroying the current page/form.
export function setHistoryPrivacySuspended(value: boolean) {
  if (suspended === value) return;
  suspended = value; revision += 1; listeners.forEach(listener => listener());
}
// Only gate the curtain: a transient inactive check must not cancel picker/media work.
export function setHistoryPrivacyResumePending(value: boolean) {
  if (resumePending === value) return;
  resumePending = value; listeners.forEach(listener => listener());
}
export function subscribeHistoryPrivacy(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function setHistoryLocked(value: boolean) {
  if (locked === value) return;
  locked = value; revision += 1; listeners.forEach(listener => listener());
}
export function recordHistoryActivity() { activityListeners.forEach(listener => listener()); }
export function onHistoryActivity(listener: () => void) { activityListeners.add(listener); return () => { activityListeners.delete(listener); }; }
onSessionChange(() => { setHistoryPrivacyReady(false); setHistoryLocked(true); setHistoryPrivacySuspended(false); setHistoryPrivacyResumePending(false); });
