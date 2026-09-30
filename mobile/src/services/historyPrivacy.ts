import { onSessionChange } from './session';

let locked = true;
let ready = false;
const listeners = new Set<() => void>();
const activityListeners = new Set<() => void>();
export const historyIsLocked = () => locked;
export const historyPrivacyIsReady = () => ready;
export function setHistoryPrivacyReady(value: boolean) {
  if (ready === value) return;
  ready = value; listeners.forEach(listener => listener());
}
export function subscribeHistoryPrivacy(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function setHistoryLocked(value: boolean) {
  if (locked === value) return;
  locked = value; listeners.forEach(listener => listener());
}
export function recordHistoryActivity() { activityListeners.forEach(listener => listener()); }
export function onHistoryActivity(listener: () => void) { activityListeners.add(listener); return () => { activityListeners.delete(listener); }; }
onSessionChange(() => { setHistoryPrivacyReady(false); setHistoryLocked(true); });
