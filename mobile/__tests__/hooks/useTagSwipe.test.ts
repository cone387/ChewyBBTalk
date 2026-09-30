jest.mock('react-native', () => ({
  Animated: { Value: jest.fn(() => ({ setValue: jest.fn() })), timing: jest.fn(() => ({ start: jest.fn(callback => callback?.()) })), spring: jest.fn(() => ({ start: jest.fn() })) },
  PanResponder: { create: jest.fn(handlers => handlers) },
}));
jest.mock('../../src/hooks/useReducedMotion', () => ({ useReducedMotion: jest.fn() }));
import { act, cleanup, renderHook } from '@testing-library/react-native';
import { Animated } from 'react-native';
import { useReducedMotion } from '../../src/hooks/useReducedMotion';
import { useTagSwipe } from '../../src/hooks/useTagSwipe';
import type { Tag } from '../../src/types';
const tags = [{ id: 'one' }, { id: 'two' }] as Tag[];
beforeEach(() => { jest.clearAllMocks(); (useReducedMotion as jest.Mock).mockReturnValue(false); });
afterEach(cleanup);
function swipe(selectedTag: string | null = null, showTagTabs = true, activeTags = tags) {
  const select = jest.fn();
  const hook = renderHook((props: { tags: Tag[]; selectedTag: string | null; showTagTabs: boolean }) => useTagSwipe({ ...props, onSelectTag: select }), { initialProps: { tags: activeTags, selectedTag, showTagTabs } });
  return { ...hook, select, handlers: hook.result.current.panResponder as any };
}
it('captures only deliberate horizontal gestures when tabs are visible', () => {
  const { handlers } = swipe();
  expect(handlers.onMoveShouldSetPanResponder(null, { dx: 30, dy: 2 })).toBe(true);
  expect(handlers.onMoveShouldSetPanResponder(null, { dx: 30, dy: 30 })).toBe(false);
  expect(handlers.onMoveShouldSetPanResponder(null, { dx: 10, dy: 0 })).toBe(false);
});
it('switches to the next tag after a sufficiently long left swipe', () => {
  const { handlers, select } = swipe();
  act(() => handlers.onPanResponderRelease(null, { dx: -70, vx: 0 }));
  expect(select).toHaveBeenCalledWith('one'); expect(Animated.timing).toHaveBeenCalled();
});
it('switches to all records on a quick right swipe from the first tag', () => {
  const { handlers, select } = swipe('one');
  act(() => handlers.onPanResponderRelease(null, { dx: 20, vx: 1 }));
  expect(select).toHaveBeenCalledWith(null);
});
it.each([null, 'two'])('does not switch beyond the %s boundary', selected => {
  const { handlers, select } = swipe(selected);
  act(() => handlers.onPanResponderRelease(null, { dx: selected ? -70 : 70, vx: 0 }));
  expect(select).not.toHaveBeenCalled();
});
it('dampens overscroll at an edge and restores short gestures', () => {
  const { handlers, result } = swipe();
  act(() => handlers.onPanResponderMove(null, { dx: 100 }));
  expect(result.current.listSlideAnim.setValue).toHaveBeenCalledWith(8);
  act(() => handlers.onPanResponderRelease(null, { dx: 10, vx: 0 }));
  expect(Animated.spring).toHaveBeenCalled();
});
it('respects reduced motion for switching and interrupted gestures', () => {
  (useReducedMotion as jest.Mock).mockReturnValue(true);
  const { handlers, result, select } = swipe();
  act(() => handlers.onPanResponderRelease(null, { dx: -70, vx: 0 }));
  expect(select).toHaveBeenCalledWith('one'); expect(Animated.timing).not.toHaveBeenCalled();
  act(() => handlers.onPanResponderTerminate());
  expect(result.current.listSlideAnim.setValue).toHaveBeenLastCalledWith(0);
});
it('uses updated selection and tab visibility in the retained responder', () => {
  const { handlers, rerender, select } = swipe();
  rerender({ tags, selectedTag: 'one', showTagTabs: true });
  act(() => handlers.onPanResponderRelease(null, { dx: -70, vx: 0 })); expect(select).toHaveBeenCalledWith('two');
  rerender({ tags, selectedTag: 'one', showTagTabs: false });
  expect(handlers.onMoveShouldSetPanResponder(null, { dx: 50, dy: 0 })).toBe(false);
});
it('does not switch when there are no tags', () => {
  const { handlers, select } = swipe(null, true, []);
  act(() => handlers.onPanResponderRelease(null, { dx: -70, vx: 0 })); expect(select).not.toHaveBeenCalled();
});
