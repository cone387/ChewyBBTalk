jest.mock('react-native', () => ({ Platform: { OS: 'ios' }, AccessibilityInfo: { isReduceMotionEnabled: jest.fn(), addEventListener: jest.fn(() => ({ remove: jest.fn() })) } }));
import { act, cleanup, renderHook } from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';
import { useReducedMotion } from '../../src/hooks/useReducedMotion';
const originalWindow = (global as any).window;
beforeEach(() => { jest.clearAllMocks(); (Platform as any).OS = 'ios'; (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(true); });
afterEach(() => { cleanup(); (global as any).window = originalWindow; });
it('reads the native preference, handles live changes and removes the subscription', async () => {
  const { result, unmount } = renderHook(useReducedMotion);
  await act(async () => {}); expect(result.current).toBe(true);
  act(() => (AccessibilityInfo.addEventListener as jest.Mock).mock.calls[0][1](false)); expect(result.current).toBe(false);
  unmount(); expect((AccessibilityInfo.addEventListener as jest.Mock).mock.results[0].value.remove).toHaveBeenCalledTimes(1);
});
it('uses the browser media query and cleans up live listeners', () => {
  (Platform as any).OS = 'web';
  const query = { matches: true, addEventListener: jest.fn(), removeEventListener: jest.fn() };
  (global as any).window = { matchMedia: jest.fn(() => query) };
  const { result, unmount } = renderHook(useReducedMotion); expect(result.current).toBe(true);
  act(() => query.addEventListener.mock.calls[0][1]({ matches: false })); expect(result.current).toBe(false);
  unmount(); expect(query.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  expect(AccessibilityInfo.isReduceMotionEnabled).not.toHaveBeenCalled();
});
it('falls back to normal motion when the browser has no media query support', () => {
  (Platform as any).OS = 'web'; (global as any).window = {};
  expect(renderHook(useReducedMotion).result.current).toBe(false);
});
