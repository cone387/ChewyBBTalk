import { useLayoutEffect } from 'react';

/** Keep native-stack in charge of controller-based iOS status-bar appearance. */
export function useMediaStatusBar(navigation: { setOptions?: (options: { statusBarStyle: 'light' | 'dark' }) => void } | undefined, visible: boolean, themeKey: string) {
  useLayoutEffect(() => {
    if (!visible) return;
    navigation?.setOptions?.({ statusBarStyle: 'light' });
    return () => navigation?.setOptions?.({ statusBarStyle: themeKey === 'dark' ? 'light' : 'dark' });
  }, [navigation, visible, themeKey]);
}
