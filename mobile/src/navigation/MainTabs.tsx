import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { BottomTabBar, createBottomTabNavigator, type BottomTabBarProps, type BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HomeScreen from '../screens/HomeScreen';
import CalendarScreen from '../screens/CalendarScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { useTheme } from '../theme/ThemeContext';
import GlassSurface from '../components/GlassSurface';
import { UI } from '../theme/materials';
import { useGlassPreferences } from '../theme/GlassPreferences';
import { historyIsLocked, historyPrivacyIsReady, subscribeHistoryPrivacy, recordHistoryActivity } from '../services/historyPrivacy';
import { setWidgetAuthState, clearWidget, syncWidget } from '../services/widget';

const Tabs = createBottomTabNavigator();

function RoundedTabButton({ style, ...props }: BottomTabBarButtonProps) {
  return <PlatformPressable {...props} style={[style, { borderRadius: 24, overflow: 'hidden', paddingVertical: 0, justifyContent: 'center' }]} />;
}

function PrivacyTabBar(props: BottomTabBarProps) {
  const locked = useSyncExternalStore(subscribeHistoryPrivacy, historyIsLocked, historyIsLocked);
  const ready = useSyncExternalStore(subscribeHistoryPrivacy, historyPrivacyIsReady, historyPrivacyIsReady);
  useEffect(() => {
    if (ready && locked) props.navigation.navigate('Records');
  }, [ready, locked, props.navigation]);
  return !ready || locked ? null : <BottomTabBar {...props} />;
}

export default function MainTabs({ onLogout }: { onLogout: () => void }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const { reduceMotion } = useGlassPreferences();
  const insets = useSafeAreaInsets();
  const privacyLocked = useSyncExternalStore(subscribeHistoryPrivacy, historyIsLocked, historyIsLocked);
  const ready = useSyncExternalStore(subscribeHistoryPrivacy, historyPrivacyIsReady, historyPrivacyIsReady);
  const locked = privacyLocked || !ready;
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const selectTag = useCallback((id: string | null) => {
    setSelectedTag(id);
    setSelectedDate(null);
  }, []);
  const handleLockChange = useCallback((value: boolean) => {
    setWidgetAuthState({ locked: value });
    if (value) void clearWidget('locked');
    else void syncWidget({ authenticated: true, locked: false });
  }, []);

  return (
    <Tabs.Navigator initialRouteName="Records" tabBar={props => <PrivacyTabBar {...props} />}
      screenListeners={{ tabPress: event => {
        if (!historyPrivacyIsReady() || historyIsLocked()) event.preventDefault();
        else recordHistoryActivity();
      } }}
      screenOptions={({ route }) => ({
        // Privacy is owned above the navigator; eagerly mount Records for its feed state.
        lazy: route.name !== 'Records',
        freezeOnBlur: false,
        headerShown: !locked && route.name === 'Mine',
        headerStyle: { backgroundColor: c.background },
        headerTintColor: c.text,
        headerShadowVisible: false,
        headerTitleStyle: { fontSize: 17, fontWeight: '600' },
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textSecondary,
        tabBarBackground: () => <GlassSurface theme={theme} radius={32} elevated style={{ position: 'absolute', inset: 0 }} />,
        tabBarStyle: { position: 'absolute', start: 20, end: 20, bottom: Math.max(insets.bottom, 12),
          backgroundColor: 'transparent', borderTopWidth: 0, borderRadius: 32, elevation: 0,
          display: locked ? 'none' : 'flex', height: UI.tabBarHeight, paddingTop: 6, paddingBottom: 6, paddingHorizontal: 6 },
        tabBarButton: RoundedTabButton,
        tabBarItemStyle: { minHeight: 48, marginHorizontal: 2, borderRadius: 24 },
        tabBarLabelPosition: 'below-icon',
        tabBarActiveBackgroundColor: c.primaryLight,
        tabBarIconStyle: { width: 26, height: 26 },
        tabBarLabelStyle: { fontSize: 11, lineHeight: 14, fontWeight: '600' },
        tabBarHideOnKeyboard: true,
        tabBarVisibilityAnimationConfig: {
          show: { animation: 'timing', config: { duration: reduceMotion ? 0 : 180 } },
          hide: { animation: 'timing', config: { duration: reduceMotion ? 0 : 140 } },
        },
        tabBarIcon: ({ color, focused }) => {
          const icons = {
            Records: focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline',
            Calendar: focused ? 'calendar' : 'calendar-outline',
            Mine: focused ? 'person' : 'person-outline',
          } as const;
          return <Ionicons name={icons[route.name as keyof typeof icons]} size={22} color={color} />;
        },
      })}>
      <Tabs.Screen name="Records" options={{ title: '记录' }}>
        {() => <HomeScreen selectedTag={selectedTag} selectedDate={selectedDate}
          onSelectTag={selectTag} onLockChange={handleLockChange} />}
      </Tabs.Screen>
      <Tabs.Screen name="Calendar" options={{ title: '日历' }}>
        {() => locked ? <View style={{ flex: 1, backgroundColor: c.background }} /> :
          <CalendarScreen />}
      </Tabs.Screen>
      <Tabs.Screen name="Mine" options={{ title: '我的' }}>
        {() => locked ? <View style={{ flex: 1, backgroundColor: c.background }} /> :
          <View style={{ flex: 1 }} onTouchStart={recordHistoryActivity}>
            <SettingsScreen onLogout={onLogout} />
          </View>}
      </Tabs.Screen>
    </Tabs.Navigator>
  );
}
