import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { drainOutbox, onOutboxChange } from '../services/outbox';
import { getSession, onSessionChange } from '../services/session';
import { isSyncOnline, updateSyncConnectivity } from '../services/syncConnectivity';

/** The OS may suspend the app; the durable queue resumes at next foreground/start. */
export default function OutboxSync() {
  useEffect(() => {
    let active = true;
    let running = false;
    let wakeAfterRun = false;
    const canRun = () => active && AppState.currentState === 'active' && isSyncOnline();
    const kick = (wake = false) => {
      if (!canRun()) return;
      if (running) { if (wake) wakeAfterRun = true; return; }
      running = true;
      void drainOutbox(getSession(), canRun).catch(() => {}).finally(() => {
        running = false;
        if (wakeAfterRun) { wakeAfterRun = false; kick(); }
      });
    };
    const connectivityChanged = (connected: boolean) => {
      const previouslyOnline = isSyncOnline();
      // A self-hosted server may be reachable on a LAN even if the public internet probe fails.
      updateSyncConnectivity(connected);
      kick(!previouslyOnline && isSyncOnline());
    };
    const webConnectivity = () => connectivityChanged(navigator.onLine);
    const web = Platform.OS === 'web' && typeof window !== 'undefined';
    // Some browsers expose navigator.connection but emit only window online/offline events.
    if (web) { window.addEventListener('online', webConnectivity); window.addEventListener('offline', webConnectivity); }
    const network = NetInfo.addEventListener(state => {
      connectivityChanged(web ? navigator.onLine : state.isConnected !== false);
    });
    const app = AppState.addEventListener('change', state => { if (state === 'active') kick(true); });
    const queue = onOutboxChange(kick);
    const session = onSessionChange(() => kick(true));
    const timer = setInterval(kick, 30000);
    kick();
    return () => {
      active = false; network(); app.remove(); queue(); session(); clearInterval(timer);
      if (web) { window.removeEventListener('online', webConnectivity); window.removeEventListener('offline', webConnectivity); }
    };
  }, []);
  return null;
}
