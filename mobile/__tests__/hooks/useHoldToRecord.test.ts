jest.mock('react-native', () => ({ AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) } }));
import { act, cleanup, renderHook } from '@testing-library/react-native';
import { AppState, type GestureResponderEvent } from 'react-native';
import { useHoldToRecord } from '../../src/hooks/useHoldToRecord';
const event = (x = 100, y = 100) => ({ nativeEvent: { pageX: x, pageY: y } } as GestureResponderEvent);
beforeEach(() => { jest.clearAllMocks(); jest.useFakeTimers(); });
afterEach(() => { cleanup(); jest.clearAllTimers(); jest.useRealTimers(); });
function recorder(accepted = true) {
  const start = jest.fn(() => accepted), tap = jest.fn();
  const hook = renderHook((busy: boolean) => useHoldToRecord(start, busy, tap), { initialProps: false });
  return { ...hook, start, tap };
}
it('distinguishes a short tap from holding and finishes recording on release', () => {
  const { result, start, tap } = recorder();
  act(() => { result.current.handlers.onResponderGrant(event()); jest.advanceTimersByTime(299); result.current.handlers.onResponderRelease(); });
  expect(tap).toHaveBeenCalledTimes(1); expect(start).not.toHaveBeenCalled();
  act(() => { result.current.handlers.onResponderGrant(event()); jest.advanceTimersByTime(300); });
  expect(start).toHaveBeenCalledTimes(1); expect(result.current.holdMode).toBe(true);
  expect(result.current.handlers.onResponderTerminationRequest()).toBe(false);
  act(() => result.current.handlers.onResponderRelease());
  expect(result.current.stopAction).toBe('finish'); expect(tap).toHaveBeenCalledTimes(1);
});
it('does not treat a rejected recording start as a tap', () => {
  const { result, start, tap } = recorder(false);
  act(() => { result.current.handlers.onResponderGrant(event()); jest.advanceTimersByTime(300); result.current.handlers.onResponderRelease(); });
  expect(start).toHaveBeenCalledTimes(1); expect(tap).not.toHaveBeenCalled(); expect(result.current.holdMode).toBe(false);
});
it.each(['horizontal', 'vertical'])('cancels the long-press timer on %s scrolling before recording', direction => {
  const { result, start, tap } = recorder();
  act(() => { result.current.handlers.onResponderGrant(event()); result.current.handlers.onResponderMove(direction === 'horizontal' ? event(111, 100) : event(100, 111)); jest.advanceTimersByTime(300); result.current.handlers.onResponderRelease(); });
  expect(start).not.toHaveBeenCalled(); expect(tap).not.toHaveBeenCalled();
});
it('supports sliding up to cancel and sliding back to finish', () => {
  const { result } = recorder();
  act(() => { result.current.handlers.onResponderGrant(event()); jest.advanceTimersByTime(300); result.current.handlers.onResponderMove(event(100, 35)); });
  expect(result.current.cancelHint).toBe(true);
  act(() => result.current.handlers.onResponderMove(event(100, 40)));
  expect(result.current.cancelHint).toBe(false);
  act(() => result.current.handlers.onResponderMove(event(100, 0)));
  act(() => result.current.handlers.onResponderRelease());
  expect(result.current.stopAction).toBe('cancel');
});
it.each(['background', 'terminate'])('cancels recording when interrupted by %s', interruption => {
  const { result, tap } = recorder();
  act(() => { result.current.handlers.onResponderGrant(event()); jest.advanceTimersByTime(300); });
  act(() => interruption === 'background' ? (AppState.addEventListener as jest.Mock).mock.calls[0][1]('background') : result.current.handlers.onResponderTerminate());
  expect(result.current.stopAction).toBe('cancel'); expect(result.current.pressed).toBe(false); expect(tap).not.toHaveBeenCalled();
});
it('does not start if the recorder becomes busy while the user is holding', () => {
  const { result, rerender, start, tap } = recorder();
  act(() => result.current.handlers.onResponderGrant(event()));
  rerender(true);
  act(() => { jest.advanceTimersByTime(300); result.current.handlers.onResponderRelease(); });
  expect(result.current.handlers.onStartShouldSetResponder()).toBe(false);
  expect(start).not.toHaveBeenCalled(); expect(tap).not.toHaveBeenCalled();
});
it('cleans up a pending hold and the background listener on unmount', () => {
  const { result, unmount, start } = recorder();
  act(() => result.current.handlers.onResponderGrant(event()));
  unmount(); act(() => jest.advanceTimersByTime(300));
  expect(start).not.toHaveBeenCalled();
  expect((AppState.addEventListener as jest.Mock).mock.results[0].value.remove).toHaveBeenCalledTimes(1);
});
it('keeps accessibility tap and recording actions available', () => {
  const { result, start, tap, rerender } = recorder();
  act(() => result.current.handlers.onAccessibilityTap());
  act(() => result.current.handlers.onAccessibilityAction({ nativeEvent: { actionName: 'longpress' } } as any));
  expect(tap).toHaveBeenCalledTimes(1); expect(start).toHaveBeenCalledTimes(1);
  rerender(true);
  act(() => result.current.handlers.onAccessibilityTap());
  expect(tap).toHaveBeenCalledTimes(1);
});
