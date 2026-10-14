import { useEffect } from 'react';
import { getHistoryPrivacyRevision, historyPrivacyIsSuspended, subscribeHistoryPrivacy } from '../services/historyPrivacy';

/** A previous play gesture cannot survive a background/foreground cycle. */
export function capturePrivacyPlaybackGuard(): () => boolean {
  const revision = getHistoryPrivacyRevision();
  return () => !historyPrivacyIsSuspended() && getHistoryPrivacyRevision() === revision;
}

/** Preserve media UI on background, but require an explicit play gesture on return. */
export function usePauseOnPrivacySuspension(player: { pause(): void }) {
  useEffect(() => {
    const pauseIfSuspended = () => {
      if (!historyPrivacyIsSuspended()) return;
      try { player.pause(); } catch { /* A native player may already be released. */ }
    };
    pauseIfSuspended();
    return subscribeHistoryPrivacy(pauseIfSuspended);
  }, [player]);
}
