jest.mock('../../src/services/api/welcomeApi', () => ({ welcomeApi: { next: jest.fn() } }));
import { welcomeApi } from '../../src/services/api/welcomeApi';
import { getWelcomeOpening, dismissWelcomeOpening } from '../../src/services/welcomeOpening';
import { clearSession, getSession, setSession } from '../../src/services/session';

beforeEach(() => { clearSession(); setSession('https://example.test', 1); jest.clearAllMocks(); });
afterEach(() => jest.useRealTimers());

test('one opening request survives remounts and dismissal for the current session', async () => {
  const quote = { id: 'q', text: 'My own words', source: '' };
  (welcomeApi.next as jest.Mock).mockResolvedValue({ quote });
  const session = getSession();
  const first = getWelcomeOpening(session);
  expect(getWelcomeOpening(session)).toBe(first);
  expect(await first.quote).toEqual(quote);
  dismissWelcomeOpening(session);
  expect(getWelcomeOpening(session).dismissed).toBe(true);
  expect(welcomeApi.next).toHaveBeenCalledTimes(1);
});

test('a different account gets its own request and cannot be dismissed by an old response', async () => {
  (welcomeApi.next as jest.Mock).mockResolvedValue({ quote: null });
  const previous = getSession();
  const old = getWelcomeOpening(previous);
  setSession('https://example.test', 2);
  const current = getWelcomeOpening(getSession());
  dismissWelcomeOpening(previous);
  expect(current).not.toBe(old);
  expect(current.dismissed).toBe(false);
  expect(welcomeApi.next).toHaveBeenCalledTimes(2);
});

test('a failed request and a stalled request both let the app continue', async () => {
  (welcomeApi.next as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  expect(await getWelcomeOpening(getSession()).quote).toBeNull();
  clearSession(); setSession('https://example.test', 1);
  jest.useFakeTimers();
  (welcomeApi.next as jest.Mock).mockImplementationOnce(() => new Promise(() => {}));
  const opening = getWelcomeOpening(getSession());
  await jest.advanceTimersByTimeAsync(5000);
  expect(await opening.quote).toBeNull();
});
