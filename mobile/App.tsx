import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ActivityIndicator, View, Animated, Dimensions, TouchableOpacity, StyleSheet, PanResponder } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider } from 'react-redux';
import { store } from './src/store';
import { initAuth } from './src/services/auth';
import { loadApiBaseUrl } from './src/config';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { checkForUpdates } from './src/utils/versionChecker';

import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import ComposeScreen from './src/screens/ComposeScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import PrivacySettingsScreen from './src/screens/PrivacySettingsScreen';
import StorageSettingsScreen from './src/screens/StorageSettingsScreen';
import DataManagementScreen from './src/screens/DataManagementScreen';
import ProfileEditScreen from './src/screens/ProfileEditScreen';
import ThemeSettingsScreen from './src/screens/ThemeSettingsScreen';
import AudioPlayScreen from './src/screens/AudioPlayScreen';
import CacheManagementScreen from './src/screens/CacheManagementScreen';
import TagManagementScreen from './src/screens/TagManagementScreen';
import AboutScreen from './src/screens/AboutScreen';
import AccountSecurityScreen from './src/screens/AccountSecurityScreen';
import DrawerContent from './src/screens/DrawerContent';

const Stack = createNativeStackNavigator();
const SCREEN_WIDTH = Dimensions.get('window').width;
const DRAWER_WIDTH = SCREEN_WIDTH * 0.78;

function HomeWithDrawer({ onLogout }: { onLogout: () => void }) {
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const isLockedRef = useRef(false);
  const isOpen = useRef(false);
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  const openDrawer = useCallback(() => {
    if (isOpen.current || isLockedRef.current) return;
    isOpen.current = true;
    setDrawerVisible(true);
    Animated.parallel([
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 0 }),
      Animated.spring(overlayOpacity, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 0 }),
    ]).start();
  }, []);

  const closeDrawer = useCallback(() => {
    if (!isOpen.current) return;
    isOpen.current = false;
    Animated.parallel([
      Animated.spring(translateX, { toValue: -DRAWER_WIDTH, useNativeDriver: true, speed: 20, bounciness: 0 }),
      Animated.spring(overlayOpacity, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 0 }),
    ]).start(() => setDrawerVisible(false));
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt) => {
        return !isOpen.current && !isLockedRef.current && evt.nativeEvent.pageX < 20;
      },
      onMoveShouldSetPanResponder: (evt, gesture) => {
        return !isOpen.current && !isLockedRef.current && evt.nativeEvent.pageX < 40 && gesture.dx > 15 && Math.abs(gesture.dy) < 30;
      },
      onPanResponderMove: (_, gesture) => {
        const x = Math.min(0, Math.max(-DRAWER_WIDTH, -DRAWER_WIDTH + gesture.dx));
        translateX.setValue(x);
        overlayOpacity.setValue(Math.max(0, (DRAWER_WIDTH + x) / DRAWER_WIDTH));
        if (x > -DRAWER_WIDTH + 10) setDrawerVisible(true);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > DRAWER_WIDTH * 0.3 || gesture.vx > 0.3) {
          openDrawer();
        } else {
          closeDrawer();
        }
      },
    })
  ).current;

  const handleLockChange = useCallback((v: boolean) => {
    setIsLocked(v);
    isLockedRef.current = v;
    if (v && isOpen.current) closeDrawer();
  }, [closeDrawer]);

  const handleSelectTag = useCallback((id: string | null) => {
    setSelectedTag(id);
    setSelectedDate(null);
  }, []);

  const handleSelectDate = useCallback((date: string | null) => {
    setSelectedDate(date);
    setSelectedTag(null);
  }, []);

  return (
    <View style={{ flex: 1 }} {...panResponder.panHandlers}>
      <HomeScreen selectedTag={selectedTag} selectedDate={selectedDate} onOpenDrawer={openDrawer} onLockChange={handleLockChange} onSelectTag={handleSelectTag} />
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} pointerEvents={drawerVisible ? 'auto' : 'none'}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeDrawer} />
      </Animated.View>
      <Animated.View style={[styles.drawer, { transform: [{ translateX }] }]} pointerEvents={drawerVisible ? 'auto' : 'none'}>
        <DrawerContent
          selectedTag={selectedTag}
          selectedDate={selectedDate}
          onSelectTag={handleSelectTag}
          onSelectDate={handleSelectDate}
          onClose={closeDrawer}
        />
      </Animated.View>
    </View>
  );
}

function ThemedNavigator({ isAuthenticated, onLoginSuccess, onLogout }: {
  isAuthenticated: boolean; onLoginSuccess: () => void; onLogout: () => void;
}) {
  const { theme } = useTheme();
  const c = theme.colors;

  // 认证成功后检测版本更新
  useEffect(() => {
    if (isAuthenticated) {
      checkForUpdates();
    }
  }, [isAuthenticated]);

  const headerOptions = {
    headerStyle: { backgroundColor: c.surfaceSecondary },
    headerShadowVisible: false,
    headerTintColor: c.text,
    headerTitleStyle: { fontSize: 18, fontWeight: '600' as const },
    headerBackTitle: '返回',
  };

  return (
    <NavigationContainer>
      {isAuthenticated ? (
        <Stack.Navigator>
          <Stack.Screen name="Home" options={{ headerShown: false }}>
            {() => <HomeWithDrawer onLogout={onLogout} />}
          </Stack.Screen>
          <Stack.Screen name="Compose" component={ComposeScreen}
            options={{ headerShown: false, presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: true }} />
          <Stack.Screen name="Settings" options={{ title: '设置', ...headerOptions }}>
            {() => <SettingsScreen onLogout={onLogout} />}
          </Stack.Screen>
          <Stack.Screen name="AccountSecurity" options={{ title: '账号与安全', ...headerOptions }}>
            {() => <AccountSecurityScreen onLogout={onLogout} />}
          </Stack.Screen>
          <Stack.Screen name="ProfileEdit" component={ProfileEditScreen}
            options={{ title: '编辑个人信息', ...headerOptions }} />
          <Stack.Screen name="ThemeSettings" component={ThemeSettingsScreen}
            options={{ title: '主题设置', ...headerOptions }} />
          <Stack.Screen name="PrivacySettings" component={PrivacySettingsScreen}
            options={{ title: '防窥设置', ...headerOptions }} />
          <Stack.Screen name="StorageSettings" component={StorageSettingsScreen}
            options={{ title: '存储设置', ...headerOptions }} />
          <Stack.Screen name="DataManagement" component={DataManagementScreen}
            options={{ title: '数据管理', ...headerOptions }} />
          <Stack.Screen name="AudioPlay" component={AudioPlayScreen}
            options={{ title: '播放音频', ...headerOptions }} />
          <Stack.Screen name="CacheManagement" component={CacheManagementScreen}
            options={{ title: '缓存管理', ...headerOptions }} />
          <Stack.Screen name="TagManagement" component={TagManagementScreen}
            options={{ title: '标签管理', ...headerOptions }} />
          <Stack.Screen name="About" component={AboutScreen}
            options={{ title: '关于', ...headerOptions }} />
        </Stack.Navigator>
      ) : (
        <Stack.Navigator>
          <Stack.Screen name="Login" options={{ headerShown: false }}>
            {() => <LoginScreen onLoginSuccess={onLoginSuccess} />}
          </Stack.Screen>
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  useEffect(() => { (async () => { await loadApiBaseUrl(); setIsAuthenticated(await initAuth()); setIsReady(true); })(); }, []);
  const handleLoginSuccess = useCallback(() => setIsAuthenticated(true), []);
  const handleLogout = useCallback(() => setIsAuthenticated(false), []);

  if (!isReady) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9FAFB' }}><ActivityIndicator size="large" color="#7C3AED" /></View>;

  return (
    <SafeAreaProvider>
      <Provider store={store}>
        <ThemeProvider>
          <ThemedNavigator isAuthenticated={isAuthenticated} onLoginSuccess={handleLoginSuccess} onLogout={handleLogout} />
        </ThemeProvider>
      </Provider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 100 },
  drawer: {
    position: 'absolute', top: 0, bottom: 0, left: 0, width: DRAWER_WIDTH, zIndex: 101,
    shadowColor: '#000', shadowOffset: { width: 4, height: 0 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 10,
  },
});
