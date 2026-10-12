import { useSyncExternalStore } from 'react';

const KEY = 'privacy_enabled';
const CHANGE = 'bbtalk:privacy-enabled-change';
const read = () => localStorage.getItem(KEY) !== 'false';

function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) listener();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(CHANGE, listener);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CHANGE, listener);
  };
}

function setEnabled(enabled: boolean) {
  localStorage.setItem(KEY, String(enabled));
  window.dispatchEvent(new Event(CHANGE));
}

export function usePrivacyEnabled() {
  // Preserve the existing automatic-lock default for users without a preference.
  const enabled = useSyncExternalStore(subscribe, read, () => true);
  return [enabled, setEnabled] as const;
}
