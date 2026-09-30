import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import CalendarScreen from '../src/screens/CalendarScreen';
import { bbtalkApi } from '../src/services/api/bbtalkApi';
import { setHistoryLocked } from '../src/services/historyPrivacy';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useFocusEffect: (callback: () => void) => {
    const React = require('react');
    React.useEffect(callback, [callback]);
  },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../src/services/session', () => ({ onSessionChange: () => () => {} }));
jest.mock('../src/services/api/bbtalkApi', () => ({ bbtalkApi: { getDateCounts: jest.fn() } }));

const today = new Date();
const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
beforeEach(() => {
  jest.clearAllMocks();
  setHistoryLocked(false);
});

test('selecting a recorded day opens the filtered records and empty days are disabled', async () => {
  (bbtalkApi.getDateCounts as jest.Mock).mockResolvedValue([{ date: dateKey, count: 2 }]);
  const onSelectDate = jest.fn();
  const screen = render(<CalendarScreen selectedDate={null} onSelectDate={onSelectDate} />);
  const day = await screen.findByLabelText(`${dateKey}，2条记录`);
  fireEvent.press(day);
  expect(onSelectDate).toHaveBeenCalledWith(dateKey);
  expect(mockNavigate).toHaveBeenCalledWith('Records');
  const emptyDate = dateKey.replace(/01$/, '02');
  fireEvent.press(screen.getByLabelText(`${emptyDate}，0条记录`));
  expect(onSelectDate).toHaveBeenCalledTimes(1);
  setHistoryLocked(true);
  fireEvent.press(day);
  expect(onSelectDate).toHaveBeenCalledTimes(1);
});

test('changing months ignores a late response from the previous month', async () => {
  let finishPrevious!: (value: unknown) => void;
  (bbtalkApi.getDateCounts as jest.Mock)
    .mockImplementationOnce(() => new Promise(resolve => { finishPrevious = resolve; }))
    .mockResolvedValueOnce([]);
  const screen = render(<CalendarScreen selectedDate={null} onSelectDate={jest.fn()} />);
  fireEvent.press(screen.getByLabelText('下个月'));
  await screen.findByText('这个月还没有记录，试试其他月份。');
  await act(async () => finishPrevious([{ date: dateKey, count: 99 }]));
  expect(screen.queryByText(/99 条碎碎念/)).toBeNull();
  expect(screen.getByText('这个月还没有记录，试试其他月份。')).toBeTruthy();
});

test('a failed month load offers a working retry', async () => {
  (bbtalkApi.getDateCounts as jest.Mock).mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce([{ date: dateKey, count: 1 }]);
  const screen = render(<CalendarScreen selectedDate={null} onSelectDate={jest.fn()} />);
  fireEvent.press(await screen.findByText('加载失败，点击重试'));
  await waitFor(() => expect(screen.getByLabelText(`${dateKey}，1条记录`)).toBeTruthy());
});
