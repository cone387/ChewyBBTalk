import { useLayoutEffect } from 'react';

/** Keep native-stack in charge of controller-based iOS status-bar appearance. */
export function useMediaStatusBar(navigation: { setOptions?: (options: { statusBarStyle: 'light' | 'dark' }) => void } | undefined, visible: boolean, themeKey: string) {
  useLayoutEffect(() => {
    // setOptions persists a screen-level override after dismissal. Keep that
    // override in sync when the user changes theme with no preview open.
    navigation?.setOptions?.({ statusBarStyle: visible || themeKey === 'dark' ? 'light' : 'dark' });
    if (!visible) return;
    return () => navigation?.setOptions?.({ statusBarStyle: themeKey === 'dark' ? 'light' : 'dark' });
  }, [navigation, visible, themeKey]);
}
