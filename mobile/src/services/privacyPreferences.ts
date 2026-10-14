// Notify mounted privacy owners after a preference has actually been saved.
let revision = 0;
const listeners = new Set<() => void>();
export const getPrivacyPreferencesRevision = () => revision;
export function subscribePrivacyPreferences(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function notifyPrivacyPreferencesChanged() {
  revision += 1;
  listeners.forEach(listener => listener());
}
