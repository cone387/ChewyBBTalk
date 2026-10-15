jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
import { renderHook } from '@testing-library/react-native';
import { useMediaStatusBar } from '../../src/hooks/useMediaStatusBar';

test('media presentation restores the current theme when dismissed or unmounted', () => {
  const navigation = { setOptions: jest.fn() };
  const { rerender, unmount } = renderHook<void, { visible: boolean; theme: string }>(
    ({ visible, theme }) => useMediaStatusBar(navigation, visible, theme),
    { initialProps: { visible: false, theme: 'light' } },
  );
  expect(navigation.setOptions).not.toHaveBeenCalled();
  rerender({ visible: true, theme: 'light' });
  expect(navigation.setOptions).toHaveBeenLastCalledWith({ statusBarStyle: 'light' });
  rerender({ visible: false, theme: 'light' });
  expect(navigation.setOptions).toHaveBeenLastCalledWith({ statusBarStyle: 'dark' });
  rerender({ visible: true, theme: 'dark' });
  unmount();
  expect(navigation.setOptions).toHaveBeenLastCalledWith({ statusBarStyle: 'light' });
});
