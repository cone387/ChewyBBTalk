import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  delete window.__POWERED_BY_WUJIE__;
  delete window.__WUJIE;
});

it('notifies mounted caches after detecting an embedded host account change', async () => {
  vi.resetModules();
  let token = 'host-account-a';
  window.__POWERED_BY_WUJIE__ = true;
  window.__WUJIE = { props: { getToken: () => token } } as typeof window.__WUJIE;
  const scope = await import('../src/services/authSessionScope');
  const first = scope.getAuthSessionScope();
  await Promise.resolve();
  const invalidate = vi.fn();
  const unsubscribe = scope.subscribeAuthSession(invalidate);
  token = 'host-account-b';
  const next = scope.getAuthSessionScope();
  expect(next).not.toBe(first);
  expect(invalidate).not.toHaveBeenCalled();
  await Promise.resolve();
  expect(invalidate).toHaveBeenCalledTimes(1);
  expect(scope.getAuthSessionScope()).toBe(next);
  unsubscribe();
});
