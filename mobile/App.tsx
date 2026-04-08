import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ActivityIndicator, View, Animated, Dimensions, TouchableOpacity, StyleSheet, PanResponder } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider } from 'react-redux';
import { store } from './src/store';
import { initAuth } from './src/services/auth';
import { loadApiBaseUrl } from './src/config';

import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import ComposeScreen from './src/screens/ComposeScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import PrivacySettingsScreen from './src/screens/PrivacySettingsScreen';
import StorageSettingsScreen from './src/screens/StorageSettingsScreen';
import DataManagementScreen from './src/screens/DataManagementScreen';
import DrawerContent from './src/screens/DrawerContent';

const Stack = createNativeStackNavigator();
const SCREEN_WIDTH = Dimensions.get('window').width;
const DRAWER_WIDTH = SCREEN_WIDTH * 0.78;

function HomeWithDrawer({ onLogout }: { onLogout: () => void }) {
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  const openDrawer = useCallback(() => {
    setDrawerVisible(true);
    Animated.parallel([
      Animated.timing(translateX, { toValue: 0, duration: 250, useNativeDriver: true }),
      Animated.timing(overlayOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  }, []);

  const closeDrawer = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateX, { toValue: -DRAWER_WIDTH, duration: 200, useNativeDriver: true }),
      Animated.timing(overlayOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setDrawerVisible(false));
  }, []);

  // Edge swipe to open drawer
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt) => {
        // Only capture touches starting from the left 20px edge
        return evt.nativeEvent.pageX < 20;
      },
      onMoveShouldSetPanResponder: (evt, gesture) => {
        // From left edge, horizontal swipe right
        return evt.nativeEvent.pageX < 40 && gesture.dx > 15 && Math.abs(gesture.dy) < 30;
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

  return (
    <View style={{ flex: 1 }} {...panResponder.panHandlers}>
      <HomeScreen selectedTag={selectedTag} onOpenDrawer={openDrawer} />
      {drawerVisible && (
        <>
          <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeDrawer} />
          </Animated.View>
          <Animated.View style={[styles.drawer, { transform: [{ translateX }] }]}>
            <DrawerContent selectedTag={selectedTag} onSelectTag={setSelectedTag} onClose={closeDrawer} />
          </Animated.View>
        </>
      )}
    </View>
  );
}

function AuthenticatedStack({ onLogout }: { onLogout: () => void }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Home" options={{ headerShown: false }}>
        {() => <HomeWithDrawer onLogout={onLogout} />}
      </Stack.Screen>
      <Stack.Screen name="Compose" component={ComposeScreen}
        options={{ headerShown: false, presentation: 'containedModal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="Settings" options={{
        title: '设置', headerStyle: { backgroundColor: '#F0F4FF' },
        headerShadowVisible: false, headerTitleStyle: { fontSize: 18, fontWeight: '600' }, headerBackTitle: '返回',
      }}>
        {() => <SettingsScreen onLogout={onLogout} />}
      </Stack.Screen>
      <Stack.Screen name="PrivacySettings" component={PrivacySettingsScreen}
        options={{ title: '防窥设置', headerStyle: { backgroundColor: '#F0F4FF' }, headerShadowVisible: false, headerBackTitle: '返回' }} />
      <Stack.Screen name="StorageSettings" component={StorageSettingsScreen}
        options={{ title: '存储设置', headerStyle: { backgroundColor: '#F0F4FF' }, headerShadowVisible: false, headerBackTitle: '返回' }} />
      <Stack.Screen name="DataManagement" component={DataManagementScreen}
        options={{ title: '数据管理', headerStyle: { backgroundColor: '#F0F4FF' }, headerShadowVisible: false, headerBackTitle: '返回' }} />
    </Stack.Navigator>
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
        <NavigationContainer>
          {isAuthenticated ? <AuthenticatedStack onLogout={handleLogout} /> : (
            <Stack.Navigator><Stack.Screen name="Login" options={{ headerShown: false }}>{() => <LoginScreen onLoginSuccess={handleLoginSuccess} />}</Stack.Screen></Stack.Navigator>
          )}
        </NavigationContainer>
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
