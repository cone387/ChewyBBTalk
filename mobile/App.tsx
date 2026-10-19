import AdvancedSettingsScreen from './src/screens/AdvancedSettingsScreen';
import RecordDetailScreen from './src/screens/RecordDetailScreen';
import DraftsScreen from './src/screens/DraftsScreen';
import OutboxSync from './src/components/OutboxSync';
import OutboxScreen from './src/screens/OutboxScreen';
import PasswordRecoveryScreen from './src/screens/PasswordRecoveryScreen';
import { getSession, onSessionChange } from './src/services/session';
import React, { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { ActivityIndicator, View, Platform, AppState } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider } from 'react-redux';
import { store } from './src/store';
import { initAuth, refreshAccessToken } from './src/services/auth';
import { loadApiBaseUrl } from './src/config';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { useGlassPreferences } from './src/theme/GlassPreferences';
import GlassIconButton from './src/components/GlassIconButton';
import GlassSurface from './src/components/GlassSurface';
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
import WelcomeGate from './src/components/WelcomeGate';
import WelcomeSettingsScreen from './src/screens/WelcomeSettingsScreen';
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
import PrivacyBoundary, { protectScreen } from './src/components/PrivacyBoundary';
import { PrivacyProvider } from './src/hooks/usePrivacyMode';
import { historyIsLocked, historyPrivacyIsReady, subscribeHistoryPrivacy } from './src/services/historyPrivacy';
import { xAlert } from './src/utils/crossAlert';

const PrivateRecordDetail = protectScreen(RecordDetailScreen);
const PrivateDrafts = protectScreen(DraftsScreen);
const PrivateOutbox = protectScreen(OutboxScreen);
// Modal insets must be measured in the presented sheet, not inherited from the full screen.
const ComposeRoute = (props: React.ComponentProps<typeof ComposeScreen>) => <SafeAreaProvider><ComposeScreen {...props} /></SafeAreaProvider>;
const PrivateCompose = protectScreen(ComposeRoute, true);
const PrivateProfile = protectScreen(ProfileEditScreen);
const PrivatePrivacySettings = protectScreen(PrivacySettingsScreen);
const PrivateStorage = protectScreen(StorageSettingsScreen);
const PrivateData = protectScreen(DataManagementScreen);
const PrivateAudio = protectScreen(AudioPlayScreen);
const PrivateCache = protectScreen(CacheManagementScreen);
const PrivateTags = protectScreen(TagManagementScreen);
const PrivateWelcomeSettings = protectScreen(WelcomeSettingsScreen, true);

const Stack = createNativeStackNavigator();
function ThemedNavigator({ isAuthenticated, onLoginSuccess, onLogout }: {
  isAuthenticated: boolean; onLoginSuccess: () => void; onLogout: () => void;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const { reduceMotion } = useGlassPreferences();

  // 认证成功后检测版本更新
  useEffect(() => {
    if (isAuthenticated) {
      checkForUpdates();
    }
  }, [isAuthenticated]);

  const navigationTheme = React.useMemo(() => {
    const base = theme.key === 'dark' ? DarkTheme : DefaultTheme;
    return { ...base, colors: { ...base.colors, primary: c.primary, background: c.background,
      card: c.surface, text: c.text, border: c.border } };
  }, [theme]);
  // UIKit owns back-button geometry, typography, gestures and transitions.
  const headerOptions = { headerBackButtonDisplayMode: 'minimal' as const };
  const screenOptions = {
    headerTintColor: c.text,
    headerShadowVisible: false,
    headerTitleStyle: { fontSize: 17, fontWeight: '600' as const },
    // Keep UIKit's native back button/material and interactive pop gesture.
    animation: reduceMotion ? 'none' as const : 'default' as const,
    statusBarStyle: theme.key === 'dark' ? 'light' as const : 'dark' as const,
    contentStyle: { backgroundColor: c.background },
  };
  const stackScreenOptions = ({ navigation }: { navigation: { goBack: () => void } }) => ({
    ...screenOptions,
    ...(Platform.OS !== 'ios' ? {
      // Native-stack mounts custom backgrounds even on headerShown:false screens.
      // Keep Android's native background so Home/Compose/Login don't gain a blank header.
      headerBackground: Platform.OS === 'web'
        ? () => <GlassSurface theme={theme} radius={0} style={{ position: 'absolute', inset: 0 }} /> : undefined,
      headerLeft: ({ canGoBack }: { canGoBack?: boolean }) => canGoBack
        ? <GlassIconButton theme={theme} icon="chevron-back" accessibilityLabel="返回" onPress={navigation.goBack} style={{ marginRight: 8 }} /> : null,
    } : {}),
  });

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
        Drafts: 'drafts',
        Outbox: 'outbox',
        RecordDetail: 'record',
        PasswordRecovery: 'password-recovery',
        Settings: 'settings',
        AdvancedSettings: 'settings/advanced',
        AccountSecurity: 'settings/account',
        ProfileEdit: 'settings/profile',
        ThemeSettings: 'settings/theme',
        WelcomeSettings: 'settings/welcome',
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
    <NavigationContainer linking={linking} theme={navigationTheme}>
      {isAuthenticated && <OutboxSync />}
      {isAuthenticated ? (
        <Stack.Navigator screenOptions={stackScreenOptions}>
          <Stack.Screen name="Home" options={{ headerShown: false, title: '碎碎念' }}>
            {({ navigation }) => <WelcomeGate onSettings={() => navigation.navigate('WelcomeSettings')}><MainTabs onLogout={onLogout} /></WelcomeGate>}
          </Stack.Screen>
          <Stack.Screen name="RecordDetail" component={PrivateRecordDetail} options={{ title: '记录', ...headerOptions }} />
          <Stack.Screen name="Drafts" component={PrivateDrafts} options={{ title: '未完成记录', ...headerOptions }} />
          <Stack.Screen name="Outbox" component={PrivateOutbox} options={{ title: '同步记录', ...headerOptions }} />
          <Stack.Screen name="Compose" component={PrivateCompose}
            options={{ headerShown: false, presentation: 'modal', animation: reduceMotion ? 'none' : 'slide_from_bottom', gestureEnabled: true }} />
          <Stack.Screen name="Settings" options={{ title: '设置', ...headerOptions }}>
            {() => <PrivacyBoundary><SettingsScreen onLogout={onLogout} /></PrivacyBoundary>}
          </Stack.Screen>
          <Stack.Screen name="AccountSecurity" options={{ title: '账号与安全', ...headerOptions }}>
            {() => <PrivacyBoundary><AccountSecurityScreen onLogout={onLogout} /></PrivacyBoundary>}
          </Stack.Screen>
          <Stack.Screen name="ProfileEdit" component={PrivateProfile}
            options={{ title: '编辑个人信息', ...headerOptions }} />
          <Stack.Screen name="ThemeSettings" component={ThemeSettingsScreen}
            options={{ title: '主题设置', ...headerOptions }} />
          <Stack.Screen name="WelcomeSettings" component={PrivateWelcomeSettings}
            options={{ title: '文案欢迎页', ...headerOptions }} />
          <Stack.Screen name="PrivacySettings" component={PrivatePrivacySettings}
            options={{ title: '防窥设置', ...headerOptions }} />
          <Stack.Screen name="AdvancedSettings" component={AdvancedSettingsScreen} options={{ title: '高级设置', ...headerOptions }} />
          <Stack.Screen name="StorageSettings" component={PrivateStorage}
            options={{ title: '存储设置', ...headerOptions }} />
          <Stack.Screen name="DataManagement" component={PrivateData}
            options={{ title: '数据管理', ...headerOptions }} />
          <Stack.Screen name="AudioPlay" component={PrivateAudio}
            options={{ title: '播放音频', ...headerOptions }} />
          <Stack.Screen name="CacheManagement" component={PrivateCache}
            options={{ title: '缓存管理', ...headerOptions }} />
          <Stack.Screen name="TagManagement" component={PrivateTags}
            options={{ title: '标签管理', ...headerOptions }} />
          <Stack.Screen name="About" component={AboutScreen}
            options={{ title: '关于', ...headerOptions }} />
        </Stack.Navigator>
      ) : (
        <Stack.Navigator screenOptions={stackScreenOptions} initialRouteName={Platform.OS === 'web' ? 'Landing' : 'Login'}>
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
    if (!getSession().scope) { setIsAuthenticated(false); setFreshAuthentication(false); void clearWidget('logout'); }
  }), []);
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [freshAuthentication, setFreshAuthentication] = useState(false);
  const activeSession = useSyncExternalStore(onSessionChange, getSession, getSession);
  const privacyLocked = useSyncExternalStore(subscribeHistoryPrivacy, historyIsLocked, historyIsLocked);
  const privacyReady = useSyncExternalStore(subscribeHistoryPrivacy, historyPrivacyIsReady, historyPrivacyIsReady);
  useEffect(() => { (async () => { await loadApiBaseUrl(); setIsAuthenticated(await initAuth()); setIsReady(true); })(); }, []);

  // 小组件自动同步：登录态变化时启停
  useEffect(() => {
    if (isAuthenticated) {
      setWidgetAuthState({ authenticated: true, locked: historyIsLocked() || !historyPrivacyIsReady() });
      startWidgetAutoSync();
    } else {
      stopWidgetAutoSync();
    }
    return () => stopWidgetAutoSync();
  }, [isAuthenticated]);

  useEffect(() => {
    const locked = privacyLocked || !privacyReady;
    setWidgetAuthState({ authenticated: isAuthenticated, locked });
    if (!isAuthenticated) void clearWidget('logout');
    else if (locked) void clearWidget('locked');
  }, [isAuthenticated, privacyLocked, privacyReady]);

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

  const handleLoginSuccess = useCallback(() => { setFreshAuthentication(true); setIsAuthenticated(true); }, []);
  const handleLogout = useCallback(() => {
    setFreshAuthentication(false);
    setIsAuthenticated(false);
    void clearWidget('logout');
  }, []);

  if (!isReady) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9FAFB' }}><ActivityIndicator size="large" color="#7C3AED" /></View>;

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <Provider store={store}>
          <ThemeProvider>
            {isAuthenticated ? <PrivacyProvider key={activeSession.generation} showError={xAlert} authenticatedThisLaunch={freshAuthentication}>
              <ThemedNavigator isAuthenticated onLoginSuccess={handleLoginSuccess} onLogout={handleLogout} />
            </PrivacyProvider> : <ThemedNavigator isAuthenticated={false} onLoginSuccess={handleLoginSuccess} onLogout={handleLogout} />}
            <AppBackgroundBlur />
            <ScreenCaptureProtection />
          </ThemeProvider>
        </Provider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
