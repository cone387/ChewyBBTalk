import { act, renderHook } from '@testing-library/react-native';
import { Animated, Platform, type LayoutChangeEvent } from 'react-native';
import { useStickySearchHeader } from '../src/hooks/useStickySearchHeader';

const layout = (height: number) => ({
  nativeEvent: { layout: { x: 0, y: 0, width: 360, height } },
}) as LayoutChangeEvent;

const translation = (value: Animated.AnimatedInterpolation<number>) =>
  (value as unknown as { __getValue(): number }).__getValue();

afterEach(() => jest.restoreAllMocks());

it('collapses only the search row, clamps bounce, and keeps navigation pinned', () => {
  const { result } = renderHook(useStickySearchHeader);
  expect(result.current.searchHeight).toBe(60);
  expect(result.current.navigationHeight).toBe(48);

  for (const [offset, expected] of [[-30, 0], [0, 0], [24, -24], [60, -60], [400, -60]]) {
    act(() => result.current.scrollY.setValue(offset));
    expect(translation(result.current.translateY)).toBeCloseTo(expected);
  }
});

it('uses measured heights when text or the screen size changes', () => {
  const { result } = renderHook(useStickySearchHeader);
  const scrollY = result.current.scrollY;
  act(() => {
    result.current.onSearchLayout(layout(84));
    result.current.onNavigationLayout(layout(64));
    scrollY.setValue(75);
  });
  expect(result.current.searchHeight).toBe(84);
  expect(result.current.navigationHeight).toBe(64);
  expect(result.current.scrollY).toBe(scrollY);
  expect(translation(result.current.translateY)).toBe(-75);

  act(() => result.current.onSearchLayout(layout(50)));
  expect(translation(result.current.translateY)).toBe(-50);
  act(() => result.current.onSearchLayout(layout(0)));
  expect(result.current.searchHeight).toBe(1);
  expect(translation(result.current.translateY)).toBe(-1);
});

it('does not rerender React while the scroll offset changes', () => {
  const render = jest.fn();
  const { result } = renderHook(() => {
    render();
    return useStickySearchHeader();
  });
  const initialRenders = render.mock.calls.length;
  act(() => {
    result.current.scrollY.setValue(10);
    result.current.scrollY.setValue(25);
    result.current.scrollY.setValue(80);
  });
  expect(render).toHaveBeenCalledTimes(initialRenders);
  act(() => result.current.onSearchLayout(layout(60)));
  expect(render).toHaveBeenCalledTimes(initialRenders);
});

it.each(['ios', 'android', 'web'] as const)('uses the appropriate scroll driver on %s', os => {
  jest.replaceProperty(Platform, 'OS', os);
  const event = jest.spyOn(Animated, 'event');
  const { result, rerender } = renderHook(useStickySearchHeader);
  expect(event).toHaveBeenCalledWith(
    [{ nativeEvent: { contentOffset: { y: result.current.scrollY } } }],
    { useNativeDriver: os !== 'web' },
  );
  const onScroll = result.current.onScroll;
  rerender({});
  expect(result.current.onScroll).toBe(onScroll);
});
