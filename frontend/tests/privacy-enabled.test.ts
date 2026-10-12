import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { usePrivacyEnabled } from '../src/hooks/usePrivacyEnabled';
import { usePrivacyMode } from '../src/hooks/usePrivacyMode';

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); });

function useAutomaticPrivacy() {
  const [enabled, setEnabled] = usePrivacyEnabled();
  const privacy = usePrivacyMode({ enabled, timeout: 3000 });
  return { ...privacy, enabled, setEnabled };
}

it('cancels an active timeout immediately and starts a fresh one after enabling', () => {
  const { result } = renderHook(useAutomaticPrivacy);
  act(() => vi.advanceTimersByTime(2000));
  act(() => result.current.setEnabled(false));
  act(() => vi.advanceTimersByTime(10000));
  expect(result.current.isPrivacyMode).toBe(false);
  expect(localStorage.getItem('bbtalk_privacy_mode')).toBeNull();
  act(() => result.current.setEnabled(true));
  act(() => vi.advanceTimersByTime(2999));
  expect(result.current.isPrivacyMode).toBe(false);
  act(() => vi.advanceTimersByTime(1));
  expect(result.current.isPrivacyMode).toBe(true);
});

it('restores a disabled preference on mount and responds to changes in another tab', () => {
  localStorage.setItem('privacy_enabled', 'false');
  const { result } = renderHook(useAutomaticPrivacy);
  act(() => vi.advanceTimersByTime(10000));
  expect(result.current.isPrivacyMode).toBe(false);
  act(() => {
    localStorage.setItem('privacy_enabled', 'true');
    window.dispatchEvent(new StorageEvent('storage', { key: 'privacy_enabled' }));
  });
  act(() => vi.advanceTimersByTime(3000));
  expect(result.current.isPrivacyMode).toBe(true);
});

it('keeps existing locked state until explicit unlocking, and does not rewrite other preferences', () => {
  localStorage.setItem('bbtalk_privacy_mode', 'true');
  localStorage.setItem('privacy_timeout_minutes', '17');
  localStorage.setItem('show_privacy_countdown', 'true');
  const { result } = renderHook(usePrivacyEnabled);
  act(() => result.current[1](false));
  expect(localStorage.getItem('bbtalk_privacy_mode')).toBe('true');
  expect(localStorage.getItem('privacy_timeout_minutes')).toBe('17');
  expect(localStorage.getItem('show_privacy_countdown')).toBe('true');
});
