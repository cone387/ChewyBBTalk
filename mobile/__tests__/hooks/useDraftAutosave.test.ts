jest.mock('react-native', () => ({ AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) } }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(), removeItem: jest.fn(), getItem: jest.fn(),
}));
import { act, cleanup, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDraftAutosave } from '../../src/hooks/useDraftAutosave';
import { setSession, getSession, clearSession } from '../../src/services/session';

beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks();
  (AsyncStorage.setItem as jest.Mock).mockReset().mockResolvedValue(undefined);
  (AsyncStorage.removeItem as jest.Mock).mockReset().mockResolvedValue(undefined);
  setSession('https://example.com', 'alice');
});
afterEach(async () => { cleanup(); await act(async () => {}); jest.clearAllTimers(); jest.useRealTimers(); });
function editor(value: unknown = { content: 'first' }, ready = true) {
  const session = getSession();
  const key = `compose_draft:${session.scope}:new`;
  const hook = renderHook((props: { value: unknown; ready: boolean }) => useDraftAutosave(key, props.value, props.ready, session), { initialProps: { value, ready } });
  return { ...hook, key };
}
async function advance(ms = 400) { await act(async () => { await jest.advanceTimersByTimeAsync(ms); }); }

it('debounces rapid edits and persists only the latest value', async () => {
  const { result, rerender, key } = editor();
  await advance(300);
  rerender({ value: { content: 'second' }, ready: true });
  await advance(399);
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  await advance(1);
  expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
  expect(AsyncStorage.setItem).toHaveBeenCalledWith(key, '{"content":"second"}');
  expect(result.current.status).toBe('草稿已保存到本机');
});

it('never overwrites a draft before initial loading is ready', async () => {
  const { rerender } = editor(null, false);
  await advance(1000);
  expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
  rerender({ value: { content: 'restored' }, ready: true });
  await advance();
  expect(AsyncStorage.setItem).toHaveBeenCalled();
});

it('flushes unsaved changes on background and removes the listener on unmount', async () => {
  const { unmount, key } = editor();
  const change = (AppState.addEventListener as jest.Mock).mock.calls[0][1];
  await act(async () => { change('background'); });
  expect(AsyncStorage.setItem).toHaveBeenCalledWith(key, '{"content":"first"}');
  const remove = (AppState.addEventListener as jest.Mock).mock.results[0].value.remove;
  unmount();
  expect(remove).toHaveBeenCalledTimes(1);
  await act(async () => {});
});

it('flushes on unmount even before the debounce expires', async () => {
  const { unmount } = editor();
  unmount();
  await act(async () => {});
  expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
});

it('does not write into a different account after session change', async () => {
  const { result } = editor();
  clearSession();
  await advance();
  await act(async () => { await result.current.save(); });
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});

it('reports failed local writes and supports an explicit retry', async () => {
  (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
  const { result } = editor();
  await advance();
  expect(result.current.status).toBe('本机保存失败，请重试');
  await act(async () => { await result.current.save(); });
  expect(result.current.status).toBe('草稿已保存到本机');
});

it('does not let an older completed save mark newer edits as saved', async () => {
  let finish!: () => void;
  (AsyncStorage.setItem as jest.Mock).mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  const { result, rerender } = editor();
  await advance();
  rerender({ value: { content: 'newer' }, ready: true });
  await act(async () => { finish(); });
  expect(result.current.status).toBe('尚有修改未保存');
  await advance();
  expect(result.current.status).toBe('草稿已保存到本机');
});

it('clears the persisted draft and stops pending autosaves until resumed', async () => {
  const { result, key } = editor();
  await act(async () => { await result.current.clear(); });
  expect(AsyncStorage.removeItem).toHaveBeenCalledWith(key);
  await advance();
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  act(() => result.current.resume());
  await act(async () => { await result.current.save(); });
  expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
});

it('allows saving again if draft deletion fails', async () => {
  (AsyncStorage.removeItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
  const { result } = editor();
  await act(async () => { await expect(result.current.clear()).rejects.toThrow('disk full'); });
  await advance();
  expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
});

it('removes an empty draft and clears the save status', async () => {
  const { result, key } = editor(null);
  await advance();
  expect(AsyncStorage.removeItem).toHaveBeenCalledWith(key);
  expect(result.current.status).toBe('');
});
