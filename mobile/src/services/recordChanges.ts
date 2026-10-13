const listeners = new Set<() => void>();
export function onRecordsChanged(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function notifyRecordsChanged() { listeners.forEach(listener => listener()); }
