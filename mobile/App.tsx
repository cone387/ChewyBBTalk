import React, { useState, useEffect, useCallback } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Provider } from 'react-redux';
import { store } from './src/store';
import { initAuth } from './src/services/auth';

import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import ComposeScreen from './src/screens/ComposeScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function HomeTabs({ onLogout }: { onLogout: () => void }) {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#4F46E5',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          borderTopWidth: 0.5,
          borderTopColor: '#E5E7EB',
          paddingBottom: 4,
          height: 52,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
        headerStyle: { backgroundColor: '#fff' },
        headerShadowVisible: false,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: '碎碎念',
          tabBarLabel: '首页',
          tabBarIcon: ({ color }) => <TabIcon name="home" color={color} />,
          headerTitleStyle: { fontSize: 18, fontWeight: '700' },
        }}
      />
      <Tab.Screen
        name="Settings"
        options={{
          title: '设置',
          tabBarLabel: '设置',
          tabBarIcon: ({ color }) => <TabIcon name="settings" color={color} />,
          headerTitleStyle: { fontSize: 18, fontWeight: '700' },
        }}
      >
        {() => <SettingsScreen onLogout={onLogout} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

// 简单的 emoji 图标（可以后续替换为 @expo/vector-icons）
function TabIcon({ name }: { name: string; color: string }) {
  const { Text } = require('react-native');
  const icons: Record<string, string> = { home: '🏠', settings: '⚙️' };
  return <Text style={{ fontSize: 20 }}>{icons[name] || '•'}</Text>;
}

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    (async () => {
      const authed = await initAuth();
      setIsAuthenticated(authed);
      setIsReady(true);
    })();
  }, []);

  const handleLoginSuccess = useCallback(() => {
    setIsAuthenticated(true);
  }, []);

  const handleLogout = useCallback(() => {
    setIsAuthenticated(false);
  }, []);

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9FAFB' }}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  return (
    <Provider store={store}>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {isAuthenticated ? (
            <>
              <Stack.Screen name="Main">
                {() => <HomeTabs onLogout={handleLogout} />}
              </Stack.Screen>
              <Stack.Screen
                name="Compose"
                component={ComposeScreen}
                options={{
                  headerShown: true,
                  title: '发布',
                  headerStyle: { backgroundColor: '#fff' },
                  headerShadowVisible: false,
                  headerTitleStyle: { fontSize: 17, fontWeight: '600' },
                  presentation: 'modal',
                }}
              />
            </>
          ) : (
            <Stack.Screen name="Login">
              {() => <LoginScreen onLoginSuccess={handleLoginSuccess} />}
            </Stack.Screen>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </Provider>
  );
}
