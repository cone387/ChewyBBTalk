jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
import { renderHook } from '@testing-library/react-native';
import { useMediaStatusBar } from '../../src/hooks/useMediaStatusBar';

test('media presentation restores the current theme when dismissed or unmounted', () => {
  const navigation = { setOptions: jest.fn() };
  const { rerender, unmount } = renderHook<void, { visible: boolean; theme: string }>(
    ({ visible, theme }) => useMediaStatusBar(navigation, visible, theme),
    { initialProps: { visible: false, theme: 'light' } },
  );
  expect(navigation.setOptions).toHaveBeenLastCalledWith({ statusBarStyle: 'dark' });
  rerender({ visible: true, theme: 'light' });
  expect(navigation.setOptions).toHaveBeenLastCalledWith({ statusBarStyle: 'light' });
  rerender({ visible: false, theme: 'light' });
  expect(navigation.setOptions).toHaveBeenLastCalledWith({ statusBarStyle: 'dark' });
  rerender({ visible: true, theme: 'dark' });
  unmount();
  expect(navigation.setOptions).toHaveBeenLastCalledWith({ statusBarStyle: 'light' });
});

test('a dismissed preview follows later theme changes instead of retaining its override', () => {
  const navigation = { setOptions: jest.fn() };
  const { rerender } = renderHook<void, { visible: boolean; theme: string }>(
    ({ visible, theme }) => useMediaStatusBar(navigation, visible, theme),
    { initialProps: { visible: true, theme: 'light' } },
  );
  rerender({ visible: false, theme: 'light' });
  expect(navigation.setOptions).toHaveBeenLastCalledWith({ statusBarStyle: 'dark' });
  rerender({ visible: false, theme: 'dark' });
  expect(navigation.setOptions).toHaveBeenLastCalledWith({ statusBarStyle: 'light' });
  rerender({ visible: false, theme: 'rose' });
  expect(navigation.setOptions).toHaveBeenLastCalledWith({ statusBarStyle: 'dark' });
});
