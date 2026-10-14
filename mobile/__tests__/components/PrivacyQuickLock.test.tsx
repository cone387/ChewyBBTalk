import React from 'react';
const { create, act } = require('react-test-renderer');
import PrivacyQuickLock from '../../src/components/PrivacyQuickLock';
const mockController = { settingsReady: true, locked: false, privacyEnabled: true, showCountdown: false, setLocked: jest.fn() };
jest.mock('../../src/hooks/privacyContext', () => ({ usePrivacyController: () => mockController }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('react-native', () => ({ TouchableOpacity: 'TouchableOpacity', Keyboard: { dismiss: jest.fn() } }));
jest.mock('../../src/theme/ThemeContext', () => ({ useTheme: () => ({ theme: { colors: { textSecondary: '#555' } } }) }));
beforeEach(() => { mockController.locked = false; mockController.privacyEnabled = true; mockController.setLocked.mockClear(); });
test('manual lock remains available when the countdown is disabled', () => {
  let screen: any;
  act(() => { screen = create(<PrivacyQuickLock />); });
  act(() => screen.root.findByProps({ accessibilityLabel: '立即锁定私人内容' }).props.onPress());
  expect(mockController.setLocked).toHaveBeenCalledWith(true);
  act(() => screen.unmount());
});
test('does not show a redundant lock button on an already locked screen', () => {
  mockController.locked = true;
  let screen: any;
  act(() => { screen = create(<PrivacyQuickLock />); });
  expect(screen.toJSON()).toBeNull();
  act(() => screen.unmount());
});
