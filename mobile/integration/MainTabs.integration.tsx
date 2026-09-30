import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import MainTabs from '../src/navigation/MainTabs';
import { setHistoryLocked, setHistoryPrivacyReady } from '../src/services/historyPrivacy';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../src/services/session', () => ({ onSessionChange: () => () => {} }));
jest.mock('../src/services/widget', () => ({ setWidgetAuthState: jest.fn(), clearWidget: jest.fn(), syncWidget: jest.fn() }));
jest.mock('../src/screens/HomeScreen', () => () => {
  const React = require('react');
  const { Text, TouchableOpacity } = require('react-native');
  const [text, setText] = React.useState('记录内容');
  return <TouchableOpacity onPress={() => setText('记录位置已保留')}><Text>{text}</Text></TouchableOpacity>;
});
jest.mock('../src/screens/CalendarScreen', () => () => {
  const { Text } = require('react-native');
  return <Text>日历内容</Text>;
});
jest.mock('../src/screens/SettingsScreen', () => () => {
  const { Text } = require('react-native');
  return <Text>账号内容</Text>;
});

beforeEach(() => { setHistoryPrivacyReady(true); setHistoryLocked(false); });

test('tabs preserve records state and a privacy lock closes every other destination', async () => {
  const screen = render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 44, bottom: 34, left: 0, right: 0 } }}>
      <NavigationContainer><MainTabs onLogout={jest.fn()} /></NavigationContainer>
    </SafeAreaProvider>,
  );
  fireEvent.press(await screen.findByText('记录内容'));
  fireEvent.press(screen.getByLabelText('日历, tab, 2 of 3'));
  await screen.findByText('日历内容');
  fireEvent.press(screen.getByLabelText('我的, tab, 3 of 3'));
  await screen.findByText('账号内容');
  fireEvent.press(screen.getByLabelText('记录, tab, 1 of 3'));
  await screen.findByText('记录位置已保留');
  fireEvent.press(screen.getByLabelText('日历, tab, 2 of 3'));
  await act(async () => setHistoryLocked(true));
  await waitFor(() => expect(screen.queryByText('日历内容')).toBeNull());
  expect(screen.queryByText('账号内容')).toBeNull();
  expect(screen.queryByLabelText('我的, tab, 3 of 3')).toBeNull();
  await screen.findByText('记录位置已保留');
  await act(async () => setHistoryLocked(false));
  expect(await screen.findByLabelText('我的, tab, 3 of 3')).toBeTruthy();
});

test('opening the calendar during privacy initialization preserves its destination', async () => {
  setHistoryPrivacyReady(false); setHistoryLocked(true);
  const screen = render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 0, bottom: 0, left: 0, right: 0 } }}>
      <NavigationContainer initialState={{ index: 0, routes: [{ name: 'Calendar' }] }}><MainTabs onLogout={jest.fn()} /></NavigationContainer>
    </SafeAreaProvider>,
  );
  expect(screen.queryByText('日历内容')).toBeNull();
  await act(async () => { setHistoryLocked(false); setHistoryPrivacyReady(true); });
  await screen.findByText('日历内容');
});
