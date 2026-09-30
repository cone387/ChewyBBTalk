import AdvancedSettingsScreen from './src/screens/AdvancedSettingsScreen';
import RecordDetailScreen from './src/screens/RecordDetailScreen';
import PasswordRecoveryScreen from './src/screens/PasswordRecoveryScreen';
import { getSession, onSessionChange } from './src/services/session';
import React, { useState, useEffect, useCallback } from 'react';
import { ActivityIndicator, View, Platform, AppState } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider } from 'react-redux';
import { store } from './src/store';
import { initAuth, refreshAccessToken } from './src/services/auth';
import { loadApiBaseUrl } from './src/config';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { checkForUpdates } from './src/utils/versionChecker';
import { WEB_FOCUS_CSS } from './src/utils/webFocusStyle';

// Web: 保留键盘用户可见的焦点指示
if (Platform.OS === 'web') {
  const style = document.createElement('style');
  style.textContent = WEB_FOCUS_CSS;
  document.head.appendChild(style);
}

import LoginScreen from './src/screens/LoginScreen';
import MainTabs from './src/navigation/MainTabs';
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
import LandingScreen from './src/screens/LandingScreen';
import {
  startWidgetAutoSync,
  stopWidgetAutoSync,
  setWidgetAuthState,
  clearWidget,
} from './src/services/widget';
import ErrorBoundary from './src/components/ErrorBoundary';
import AppBackgroundBlur from './src/components/AppBackgroundBlur';
import ScreenCaptureProtection from './src/components/ScreenCaptureProtection';

const Stack = createNativeStackNavigator();
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

  // Web 端启用 URL 路由：/ → Landing（公开），/login → Login，/app → Home
  const linking = Platform.OS === 'web' ? {
    prefixes: [typeof window !== 'undefined' ? window.location.origin : ''],
    config: {
      initialRouteName: isAuthenticated ? 'Home' : 'Login',
      screens: {
        Landing: '',
        Login: 'login',
        Home: { path: 'app', screens: { Records: '', Calendar: 'calendar', Mine: 'me' } },
        Compose: 'compose',
        RecordDetail: 'record',
        PasswordRecovery: 'password-recovery',
        Settings: 'settings',
        AdvancedSettings: 'settings/advanced',
        AccountSecurity: 'settings/account',
        ProfileEdit: 'settings/profile',
        ThemeSettings: 'settings/theme',
        PrivacySettings: 'settings/privacy',
        StorageSettings: 'settings/storage',
        DataManagement: 'settings/data',
        AudioPlay: 'audio',
        CacheManagement: 'settings/cache',
        TagManagement: 'settings/tags',
        About: 'about',
      },
    },
  } as any : undefined;

  return (
    <NavigationContainer linking={linking}>
      {isAuthenticated ? (
        <Stack.Navigator>
          <Stack.Screen name="Home" options={{ headerShown: false }}>
            {() => <MainTabs onLogout={onLogout} />}
          </Stack.Screen>
          <Stack.Screen name="RecordDetail" component={RecordDetailScreen} options={{ title: '记录', ...headerOptions }} />
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
          <Stack.Screen name="AdvancedSettings" component={AdvancedSettingsScreen} options={{ title: '高级设置', ...headerOptions }} />
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
        <Stack.Navigator initialRouteName={Platform.OS === 'web' ? 'Landing' : 'Login'}>
          {Platform.OS === 'web' && (
            <Stack.Screen name="Landing" options={{ headerShown: false, title: 'BBTalk · 你的私人碎碎念空间' }}>
              {(props) => <LandingScreen {...props} />}
            </Stack.Screen>
          )}
          <Stack.Screen name="PasswordRecovery" component={PasswordRecoveryScreen} options={{ title: '找回密码', ...headerOptions }} />
          <Stack.Screen name="Login" options={{ headerShown: false }}>
            {() => <LoginScreen onLoginSuccess={onLoginSuccess} />}
          </Stack.Screen>
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}

export default function App() {
  useEffect(() => onSessionChange(() => {
    if (!getSession().scope) { setIsAuthenticated(false); void clearWidget('logout'); }
  }), []);
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  useEffect(() => { (async () => { await loadApiBaseUrl(); setIsAuthenticated(await initAuth()); setIsReady(true); })(); }, []);

  // 小组件自动同步：登录态变化时启停
  useEffect(() => {
    if (isAuthenticated) {
      setWidgetAuthState({ authenticated: true, locked: false });
      startWidgetAutoSync();
    } else {
      stopWidgetAutoSync();
    }
    return () => stopWidgetAutoSync();
  }, [isAuthenticated]);

  // 从后台恢复时主动刷新 token，保持登录态
  useEffect(() => {
    if (!isAuthenticated) return;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        refreshAccessToken();
      }
    });
    return () => subscription.remove();
  }, [isAuthenticated]);

  const handleLoginSuccess = useCallback(() => setIsAuthenticated(true), []);
  const handleLogout = useCallback(() => {
    setIsAuthenticated(false);
    void clearWidget('logout');
  }, []);

  if (!isReady) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9FAFB' }}><ActivityIndicator size="large" color="#7C3AED" /></View>;

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <Provider store={store}>
          <ThemeProvider>
            <ThemedNavigator isAuthenticated={isAuthenticated} onLoginSuccess={handleLoginSuccess} onLogout={handleLogout} />
            <AppBackgroundBlur />
            <ScreenCaptureProtection />
          </ThemeProvider>
        </Provider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
