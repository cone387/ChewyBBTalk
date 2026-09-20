import React from 'react';
import { render, act, cleanup } from '@testing-library/react-native';
import { setHistoryLocked } from '../src/services/historyPrivacy';
import RecordDetailScreen from '../src/screens/RecordDetailScreen';

const mockItem = { id: 'record', content: '必须受保护的正文', createdAt: new Date().toISOString(), tags: [], attachments: [], visibility: 'private' };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: jest.fn(), popToTop: jest.fn() }), useRoute: () => ({ params: { item: mockItem } }) }));
jest.mock('../src/store/hooks', () => ({ useAppSelector: () => undefined }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('react-native-markdown-display', () => ({ children }: any) => { const { Text } = require('react-native'); return <Text>{children}</Text>; });
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
jest.mock('../src/components/AudioPlayerButton', () => () => null);
jest.mock('../src/components/VideoPlayerButton', () => () => null);
jest.mock('../src/components/ImageViewer', () => () => null);
jest.mock('../src/utils/imageSource', () => ({ buildImageSource: () => ({}) }));
afterEach(cleanup);

test('detail is hidden while locked and removes plaintext when privacy lock activates', () => {
  setHistoryLocked(true);
  const screen = render(<RecordDetailScreen />);
  expect(screen.queryByText('必须受保护的正文')).toBeNull();
  act(() => setHistoryLocked(false));
  expect(screen.getByText('必须受保护的正文')).toBeTruthy();
  act(() => setHistoryLocked(true));
  expect(screen.queryByText('必须受保护的正文')).toBeNull();
  expect(screen.getByText('返回首页解锁')).toBeTruthy();
});
