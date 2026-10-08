interface SetupOpts {
  platform?: string;
  expoConfig?: { extra?: { apiBaseUrl?: string } } | null;
  storage?: Record<string, string>;
  failRead?: boolean;
}

function setupConfig(opts: SetupOpts = {}) {
  const asyncStorage = {
    getItem: jest.fn(async (key: string) => {
      if (opts.failRead) throw new Error('storage locked');
      return opts.storage?.[key] ?? null;
    }),
    setItem: jest.fn(async () => undefined),
  };
  const session = { clearSession: jest.fn() };
  jest.doMock('react-native', () => ({
    Platform: { select: (map: Record<string, string>) => map[opts.platform ?? 'ios'] ?? map.default },
  }));
  jest.doMock('@react-native-async-storage/async-storage', () => asyncStorage);
  jest.doMock('expo-constants', () => ({ __esModule: true, default: { expoConfig: opts.expoConfig ?? null } }));
  jest.doMock('../src/services/session', () => session);
  const config = require('../src/config');
  return { config, asyncStorage, session };
}

// The node test environment does not inject React Native's __DEV__ global.
(global as any).__DEV__ = true;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  (global as any).__DEV__ = true;
});

describe('default API url resolution', () => {
  it.each([
    ['ios', 'http://192.168.175.72:8020'],
    ['android', 'http://10.0.2.2:8020'],
    ['web', 'http://localhost:8020'],
  ])('uses the dev override on %s', (platform, expected) => {
    const { config } = setupConfig({ platform });
    expect(config.getApiBaseUrl()).toBe(expected);
    expect(config.DEFAULT_URL).toBe(expected);
    expect(config.API_BASE_URL).toBe(expected);
  });

  it('falls back to the production host when no expo config exists', () => {
    const { config } = setupConfig({ platform: 'unknown-os' });
    expect(config.getApiBaseUrl()).toBe('https://bbtalk.cone387.top');
  });

  it('uses the production url in release builds', () => {
    (global as any).__DEV__ = false;
    const { config } = setupConfig({ platform: 'android' });
    expect(config.getApiBaseUrl()).toBe('https://bbtalk.cone387.top');
  });

  it('prefers the expo config extra on unknown platforms', () => {
    const { config } = setupConfig({
      platform: 'unknown-os',
      expoConfig: { extra: { apiBaseUrl: 'https://custom.example' } },
    });
    expect(config.getApiBaseUrl()).toBe('https://custom.example');
  });
});

describe('setApiBaseUrl', () => {
  it('trims trailing slashes and persists the new url', async () => {
    const { config, asyncStorage, session } = setupConfig({ platform: 'web' });
    await config.setApiBaseUrl('https://self.example///');
    expect(config.getApiBaseUrl()).toBe('https://self.example');
    expect(asyncStorage.setItem).toHaveBeenCalledWith('bbtalk_api_base_url', 'https://self.example');
    expect(session.clearSession).toHaveBeenCalledTimes(1);
  });

  it('keeps the session when the url is unchanged', async () => {
    const { config, session, asyncStorage } = setupConfig({ platform: 'web' });
    await config.setApiBaseUrl('http://localhost:8020');
    expect(session.clearSession).not.toHaveBeenCalled();
    expect(asyncStorage.setItem).toHaveBeenCalledWith('bbtalk_api_base_url', 'http://localhost:8020');
  });
});

describe('loadApiBaseUrl', () => {
  it('restores a saved url', async () => {
    const { config } = setupConfig({ platform: 'web', storage: { bbtalk_api_base_url: 'https://saved.example' } });
    expect(await config.loadApiBaseUrl()).toBe('https://saved.example');
    expect(config.getApiBaseUrl()).toBe('https://saved.example');
  });

  it('falls back to the default without a saved url', async () => {
    const { config } = setupConfig({ platform: 'web' });
    expect(await config.loadApiBaseUrl()).toBe('http://localhost:8020');
  });

  it('survives storage failures', async () => {
    const { config } = setupConfig({ platform: 'web', failRead: true });
    expect(await config.loadApiBaseUrl()).toBe('http://localhost:8020');
  });
});
