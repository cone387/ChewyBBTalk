import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DraftNotice from '../src/components/DraftNotice';
import { getSession, setSession } from '../src/services/session';
import { writeDraft } from '../src/services/drafts';

const mockNavigation = { navigate: jest.fn(), addListener: jest.fn(() => () => {}) };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNavigation }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  setSession('https://draft-notice.example', 'owner');
});
afterEach(cleanup);

test('an edit draft is identified as an edit and stays accessible for recovery', async () => {
  const session = getSession();
  await writeDraft(`compose_draft:${session.scope}:edit:record-1`, { content: '尚未提交的修改' }, session);
  const screen = render(<DraftNotice />);
  const notice = await screen.findByText('有 1 条编辑草稿 · 继续编辑');
  expect(screen.queryByText(/未完成记录/)).toBeNull();
  fireEvent.press(notice);
  expect(mockNavigation.navigate).toHaveBeenCalledWith('Drafts');
});

test('new unfinished records and edit drafts are counted separately and refresh after clearing', async () => {
  const session = getSession();
  const key = `compose_draft:${session.scope}`;
  await writeDraft(key, { content: '新记录' }, session);
  await writeDraft(`${key}:edit:record-1`, { content: '记录修改' }, session);
  const screen = render(<DraftNotice />);
  await screen.findByText('有 1 条未完成记录、1 条编辑草稿 · 继续编辑');
  await act(async () => { await writeDraft(`${key}:edit:record-1`, null, session); });
  await screen.findByText('有 1 条未完成记录 · 继续编辑');
  await act(async () => { await writeDraft(key, null, session); });
  expect(screen.queryByRole('button')).toBeNull();
});
