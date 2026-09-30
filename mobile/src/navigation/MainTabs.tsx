import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { BottomTabBar, createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HomeScreen from '../screens/HomeScreen';
import CalendarScreen from '../screens/CalendarScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { useTheme } from '../theme/ThemeContext';
import { historyIsLocked, historyPrivacyIsReady, subscribeHistoryPrivacy, recordHistoryActivity } from '../services/historyPrivacy';
import { setWidgetAuthState, clearWidget, syncWidget } from '../services/widget';

const Tabs = createBottomTabNavigator();

function PrivacyTabBar(props: BottomTabBarProps) {
  const locked = useSyncExternalStore(subscribeHistoryPrivacy, historyIsLocked, historyIsLocked);
  const ready = useSyncExternalStore(subscribeHistoryPrivacy, historyPrivacyIsReady, historyPrivacyIsReady);
  useEffect(() => {
    if (ready && locked) props.navigation.navigate('Records');
  }, [ready, locked, props.navigation]);
  return locked ? null : <BottomTabBar {...props} />;
}

export default function MainTabs({ onLogout }: { onLogout: () => void }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  const locked = useSyncExternalStore(subscribeHistoryPrivacy, historyIsLocked, historyIsLocked);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const selectTag = useCallback((id: string | null) => {
    setSelectedTag(id);
    setSelectedDate(null);
  }, []);
  const selectDate = useCallback((date: string) => {
    setSelectedDate(date);
    setSelectedTag(null);
  }, []);
  const handleLockChange = useCallback((value: boolean) => {
    setWidgetAuthState({ locked: value });
    if (value) void clearWidget('locked');
    else void syncWidget({ authenticated: true, locked: false });
  }, []);

  return (
    <Tabs.Navigator initialRouteName="Records" tabBar={props => <PrivacyTabBar {...props} />}
      screenListeners={{ tabPress: event => {
        if (historyIsLocked()) event.preventDefault();
        else recordHistoryActivity();
      } }}
      screenOptions={({ route }) => ({
        // Keep the records screen mounted: it owns the privacy timer and unlock UI.
        lazy: false,
        freezeOnBlur: false,
        headerShown: !locked && route.name !== 'Records',
        headerStyle: { backgroundColor: c.background },
        headerTintColor: c.text,
        headerShadowVisible: false,
        headerTitleStyle: { fontSize: 22, fontWeight: '700' },
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textSecondary,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.borderLight, display: locked ? 'none' : 'flex',
          height: 64 + insets.bottom, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 6) },
        tabBarItemStyle: { minHeight: 48 },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarHideOnKeyboard: true,
        tabBarIcon: ({ color, size, focused }) => {
          const icons = {
            Records: focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline',
            Calendar: focused ? 'calendar' : 'calendar-outline',
            Mine: focused ? 'person' : 'person-outline',
          } as const;
          return <Ionicons name={icons[route.name as keyof typeof icons]} size={size} color={color} />;
        },
      })}>
      <Tabs.Screen name="Records" options={{ title: '记录' }}>
        {() => <HomeScreen selectedTag={selectedTag} selectedDate={selectedDate}
          onSelectTag={selectTag} onLockChange={handleLockChange} />}
      </Tabs.Screen>
      <Tabs.Screen name="Calendar" options={{ title: '日历' }}>
        {() => locked ? <View style={{ flex: 1, backgroundColor: c.background }} /> :
          <CalendarScreen selectedDate={selectedDate} onSelectDate={selectDate} />}
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
