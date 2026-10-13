let online = true;
const listeners = new Set<() => void>();
export function isSyncOnline() { return online; }
export function subscribeSyncConnectivity(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function updateSyncConnectivity(value: boolean) {
  if (online === value) return;
  online = value; listeners.forEach(listener => listener());
}
