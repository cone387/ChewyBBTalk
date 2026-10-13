import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import CalendarScreen from '../src/screens/CalendarScreen';
import { bbtalkApi } from '../src/services/api/bbtalkApi';
import { setHistoryLocked } from '../src/services/historyPrivacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSession, setSession } from '../src/services/session';
import CalendarDayRecords from '../src/components/CalendarDayRecords';

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
jest.mock('../src/services/api/bbtalkApi', () => ({ bbtalkApi: { getDateCounts: jest.fn(), getBBTalks: jest.fn() } }));

const today = new Date();
const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  setSession('https://calendar.example', 'owner');
  (bbtalkApi.getBBTalks as jest.Mock).mockResolvedValue({ items: [{ id: 'one', content: '当天的第一条记录', attachments: [], tags: [] }], page: 1, has_more: false, total: 1 });
  setHistoryLocked(false);
});

test('selecting a recorded day reads in place and opens details without leaving the calendar tab', async () => {
  (bbtalkApi.getDateCounts as jest.Mock).mockResolvedValue([{ date: dateKey, count: 2 }]);
  const onSelectDate = jest.fn();
  const screen = render(<CalendarScreen selectedDate={null} onSelectDate={onSelectDate} />);
  const day = await screen.findByLabelText(`${dateKey}，2条记录`);
  fireEvent.press(day);
  expect(onSelectDate).toHaveBeenCalledWith(dateKey);
  await screen.findByText('当天的第一条记录');
  expect(mockNavigate).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('当天的第一条记录'));
  expect(mockNavigate).toHaveBeenCalledWith('RecordDetail', { item: expect.objectContaining({ id: 'one' }) });
  const emptyDate = dateKey.replace(/01$/, '02');
  fireEvent.press(screen.getByLabelText(`${emptyDate}，0条记录`));
  expect(onSelectDate).toHaveBeenCalledTimes(1);
  setHistoryLocked(true);
  fireEvent.press(day);
  expect(onSelectDate).toHaveBeenCalledTimes(1);
});

test('month picker jumps directly to another year and month', async () => {
  (bbtalkApi.getDateCounts as jest.Mock).mockResolvedValue([]);
  const screen = render(<CalendarScreen selectedDate={null} onSelectDate={jest.fn()} />);
  await screen.findByText('这个月还没有记录，试试其他月份。');
  fireEvent.press(screen.getByLabelText('选择年月'));
  fireEvent.changeText(screen.getByLabelText('年份'), '2020');
  fireEvent.press(screen.getByLabelText('选择3月'));
  await waitFor(() => expect(bbtalkApi.getDateCounts).toHaveBeenLastCalledWith({ year: 2020, month: 3 }));
  expect(screen.getByText('2020年3月')).toBeTruthy();
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

test('cached day remains readable offline and retry refreshes the failed first page before pagination', async () => {
  await AsyncStorage.setItem(`calendar:${getSession().scope}:day:${dateKey}`, JSON.stringify({ items: [{ id: 'cached', content: '旧记录', attachments: [] }], page: 1, has_more: true }));
  (bbtalkApi.getBBTalks as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  const screen = render(<CalendarDayRecords date={dateKey} />);
  fireEvent.press(await screen.findByText('重试加载记录'));
  await screen.findByText('当天的第一条记录');
  expect(bbtalkApi.getBBTalks).toHaveBeenLastCalledWith({ created_on: dateKey, page: 1 });
  expect(screen.queryByText('旧记录')).toBeNull();
});

test('day pagination retries the failed second page and appends without duplicates', async () => {
  const one = { id: 'one', content: '第一页', attachments: [] };
  (bbtalkApi.getBBTalks as jest.Mock).mockResolvedValueOnce({ items: [one], has_more: true })
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ items: [one, { id: 'two', content: '第二页', attachments: [] }], has_more: false });
  const screen = render(<CalendarDayRecords date={dateKey} />);
  fireEvent.press(await screen.findByText('加载更多当天记录'));
  fireEvent.press(await screen.findByText('重试加载记录'));
  await screen.findByText('第二页');
  expect(screen.getAllByText('第一页')).toHaveLength(1);
  expect(bbtalkApi.getBBTalks).toHaveBeenLastCalledWith({ created_on: dateKey, page: 2 });
});

test('day cache is never restored by a different account', async () => {
  await AsyncStorage.setItem(`calendar:${getSession().scope}:day:${dateKey}`, JSON.stringify({ items: [{ id: 'private', content: '其他账号内容', attachments: [] }], page: 1, has_more: false }));
  setSession('https://calendar.example', 'different-owner'); setHistoryLocked(false);
  (bbtalkApi.getBBTalks as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  const screen = render(<CalendarDayRecords date={dateKey} />);
  await screen.findByText('重试加载记录');
  expect(screen.queryByText('其他账号内容')).toBeNull();
});
