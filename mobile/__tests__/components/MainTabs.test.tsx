jest.mock('react-native', () => ({ View: 'View' }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('@react-navigation/bottom-tabs', () => ({
  BottomTabBar: 'BottomTabBar',
  createBottomTabNavigator: () => ({
    Navigator: 'Navigator',
    Screen: ({ name, options, children }: any) => require('react').createElement('Screen', { name, options }, children()),
  }),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: jest.fn(() => ({ bottom: 20 })) }));
jest.mock('../../src/screens/HomeScreen', () => 'HomeScreen');
jest.mock('../../src/screens/CalendarScreen', () => 'CalendarScreen');
jest.mock('../../src/screens/SettingsScreen', () => 'SettingsScreen');
jest.mock('../../src/theme/ThemeContext', () => ({ useTheme: () => ({ theme: jest.requireActual('../../src/theme/themes').THEMES[0] }) }));
jest.mock('../../src/services/widget', () => ({ setWidgetAuthState: jest.fn(), clearWidget: jest.fn(), syncWidget: jest.fn() }));
import React from 'react';
import MainTabs from '../../src/navigation/MainTabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { onHistoryActivity, setHistoryLocked, setHistoryPrivacyReady } from '../../src/services/historyPrivacy';
import { setSession, clearSession } from '../../src/services/session';
import { clearWidget, setWidgetAuthState, syncWidget } from '../../src/services/widget';
const { create, act } = require('react-test-renderer');
let tree: any;
let bar: any;
const nav = () => tree.root.findByType('Navigator');
beforeEach(() => {
  jest.clearAllMocks(); clearSession(); setSession('https://server.example', 'alice');
  setHistoryPrivacyReady(true); setHistoryLocked(false);
  (useSafeAreaInsets as jest.Mock).mockReturnValue({ bottom: 20 });
});
afterEach(() => act(() => { tree?.unmount(); bar?.unmount(); bar = undefined; }));
function mount() { const onLogout = jest.fn(); act(() => { tree = create(<MainTabs onLogout={onLogout} />); }); return onLogout; }
function tabBar() {
  const navigation = { navigate: jest.fn() };
  act(() => { bar = create(nav().props.tabBar({ navigation })); });
  return navigation;
}
it('declares the three bottom destinations with records as the initial screen', () => {
  mount();
  expect(nav().props.initialRouteName).toBe('Records');
  expect(tree.root.findAllByType('Screen').map((screen: any) => [screen.props.name, screen.props.options.title])).toEqual([
    ['Records', '记录'], ['Calendar', '日历'], ['Mine', '我的'],
  ]);
});
it.each([0, 20])('provides touch target and keyboard behavior with bottom inset %s', bottom => {
  (useSafeAreaInsets as jest.Mock).mockReturnValue({ bottom }); mount();
  const options = nav().props.screenOptions({ route: { name: 'Records' } });
  expect(options).toMatchObject({ lazy: false, freezeOnBlur: false, headerShown: false, tabBarHideOnKeyboard: true,
    tabBarStyle: { height: 64 + bottom, paddingBottom: Math.max(bottom, 6) }, tabBarItemStyle: { minHeight: 48 } });
});
it.each([['Records', 'chatbubble-ellipses'], ['Calendar', 'calendar'], ['Mine', 'person']])('uses focused and unfocused icons for %s', (route, icon) => {
  mount(); const options = nav().props.screenOptions({ route: { name: route } });
  expect(options.tabBarIcon({ focused: true, color: 'blue', size: 22 }).props).toMatchObject({ name: icon, color: 'blue', size: 22 });
  expect(options.tabBarIcon({ focused: false, color: 'gray', size: 20 }).props.name).toBe(`${icon}-outline`);
  expect(options.headerShown).toBe(route !== 'Records');
});
it('makes selecting a tag or calendar date mutually exclusive and passes the filter to records', () => {
  mount();
  act(() => tree.root.findByType('HomeScreen').props.onSelectTag('work'));
  expect(tree.root.findByType('HomeScreen').props).toMatchObject({ selectedTag: 'work', selectedDate: null });
  act(() => tree.root.findByType('CalendarScreen').props.onSelectDate('2026-09-30'));
  expect(tree.root.findByType('HomeScreen').props).toMatchObject({ selectedTag: null, selectedDate: '2026-09-30' });
  act(() => tree.root.findByType('HomeScreen').props.onSelectTag(null));
  expect(tree.root.findByType('CalendarScreen').props.selectedDate).toBeNull();
});
it('keeps the records lock UI mounted while hiding calendar, settings, headers and the tab bar', () => {
  mount(); const navigation = tabBar();
  expect(bar.root.findAllByType('BottomTabBar')).toHaveLength(1);
  act(() => setHistoryLocked(true));
  expect(tree.root.findAllByType('HomeScreen')).toHaveLength(1);
  expect(tree.root.findAllByType('CalendarScreen')).toHaveLength(0);
  expect(tree.root.findAllByType('SettingsScreen')).toHaveLength(0);
  expect(bar.toJSON()).toBeNull(); expect(navigation.navigate).toHaveBeenCalledWith('Records');
  expect(nav().props.screenOptions({ route: { name: 'Mine' } })).toMatchObject({ headerShown: false, tabBarStyle: { display: 'none' } });
  act(() => setHistoryLocked(false));
  expect(tree.root.findAllByType('SettingsScreen')).toHaveLength(1);
  expect(bar.root.findAllByType('BottomTabBar')).toHaveLength(1);
});
it('blocks tab presses while locked and records activity for unlocked navigation', () => {
  mount(); const activity = jest.fn(); const unsubscribe = onHistoryActivity(activity); const preventDefault = jest.fn();
  act(() => nav().props.screenListeners.tabPress({ preventDefault }));
  expect(activity).toHaveBeenCalledTimes(1); expect(preventDefault).not.toHaveBeenCalled();
  act(() => setHistoryLocked(true));
  act(() => nav().props.screenListeners.tabPress({ preventDefault }));
  expect(preventDefault).toHaveBeenCalledTimes(1); expect(activity).toHaveBeenCalledTimes(1); unsubscribe();
});
it('relocks on account change and waits for readiness before navigating to records', () => {
  mount(); const navigation = tabBar();
  act(() => setSession('https://server.example', 'bob'));
  expect(bar.toJSON()).toBeNull(); expect(navigation.navigate).not.toHaveBeenCalled();
  act(() => setHistoryPrivacyReady(true)); expect(navigation.navigate).toHaveBeenCalledWith('Records');
});
it('records activity in settings and forwards its logout callback', () => {
  const logout = mount(); const activity = jest.fn(); const unsubscribe = onHistoryActivity(activity);
  const settingsContainer = tree.root.findAllByType('View').find((view: any) => view.props.onTouchStart);
  act(() => settingsContainer.props.onTouchStart()); expect(activity).toHaveBeenCalledTimes(1);
  tree.root.findByType('SettingsScreen').props.onLogout(); expect(logout).toHaveBeenCalledTimes(1); unsubscribe();
});
it('clears the widget on lock and synchronizes it on unlock', () => {
  mount(); const handler = tree.root.findByType('HomeScreen').props.onLockChange;
  handler(true); expect(setWidgetAuthState).toHaveBeenLastCalledWith({ locked: true }); expect(clearWidget).toHaveBeenCalledWith('locked');
  handler(false); expect(syncWidget).toHaveBeenCalledWith({ authenticated: true, locked: false });
});
