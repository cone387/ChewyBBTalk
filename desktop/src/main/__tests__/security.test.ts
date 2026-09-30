import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const register = vi.hoisted(() => vi.fn());
vi.mock('electron', () => ({ session: { defaultSession: { webRequest: { onHeadersReceived: register } } } }));
import { setupCsp } from '../security';
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());
it.each([false, true])('sets a %s development CSP without overwriting other response headers', development => {
  vi.stubEnv('ELECTRON_RENDERER_URL', development ? 'http://localhost:5173' : undefined);
  setupCsp(); const callback = vi.fn();
  register.mock.calls[0][0]({ responseHeaders: { 'X-Existing': ['preserved'] } }, callback);
  const headers = callback.mock.calls[0][0].responseHeaders;
  expect(headers['X-Existing']).toEqual(['preserved']);
  const csp = headers['Content-Security-Policy'][0];
  expect(csp).toContain("default-src 'self'");
  expect(csp.includes('unsafe-eval')).toBe(development);
  expect(csp.includes('ws://localhost:')).toBe(development);
});
