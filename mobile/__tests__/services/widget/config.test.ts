const mockGetItem = jest.fn((..._args: any[]) => Promise.resolve(null as any));
const mockSetItem = jest.fn((..._args: any[]) => Promise.resolve());
const mockRemoveItem = jest.fn((..._args: any[]) => Promise.resolve());

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (...args: any[]) => mockGetItem(...args),
    setItem: (...args: any[]) => mockSetItem(...args),
    removeItem: (...args: any[]) => mockRemoveItem(...args),
  },
}));

import {
  normalizeConfig,
  loadWidgetConfig,
  saveWidgetConfig,
  clearWidgetConfig,
  computeConfigHash,
} from '../../../src/services/widget/config';
import { DEFAULT_CONFIG } from '../../../src/services/widget/types';

const STORAGE_KEY = 'bbtalk.widget.config';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('normalizeConfig', () => {
  it('falls back to the default config for non-object input', () => {
    expect(normalizeConfig(null)).toEqual(DEFAULT_CONFIG);
    expect(normalizeConfig('recent')).toEqual(DEFAULT_CONFIG);
    expect(normalizeConfig(undefined)).toEqual(DEFAULT_CONFIG);
  });

  it('keeps valid fields and repairs invalid ones', () => {
    expect(normalizeConfig({
      strategy: 'pinned', recentCount: 10, tagIds: ['a', 5, 'b'], manualUids: ['u1', null], includePrivate: true,
    })).toEqual({
      strategy: 'pinned', recentCount: 10, tagIds: ['a', 'b'], manualUids: ['u1'], includePrivate: true,
    });

    expect(normalizeConfig({
      strategy: 'bogus', recentCount: 7, tagIds: 'nope', manualUids: 42, includePrivate: 'yes',
    })).toEqual({
      strategy: 'recent', recentCount: 5, tagIds: [], manualUids: [], includePrivate: false,
    });
  });

  it('returns a fresh object per call (arrays are shared with DEFAULT_CONFIG)', () => {
    const a = normalizeConfig(null);
    const b = normalizeConfig(null);
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
    // Shallow spread: the empty tagIds/manualUids arrays alias DEFAULT_CONFIG.
    expect(a.tagIds).toBe(b.tagIds);

    expect(normalizeConfig({ tagIds: ['x'] }).tagIds).not.toBe(DEFAULT_CONFIG.tagIds);
  });
});

describe('loadWidgetConfig', () => {
  it('returns the default config when nothing is stored', async () => {
    mockGetItem.mockImplementation(async () => null);
    expect(await loadWidgetConfig()).toEqual(DEFAULT_CONFIG);
    expect(mockGetItem).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it('normalizes a stored JSON config', async () => {
    mockGetItem.mockImplementation(async () => JSON.stringify({ strategy: 'tags', recentCount: 3, tagIds: ['t1'] }));
    expect(await loadWidgetConfig()).toEqual({
      strategy: 'tags', recentCount: 3, tagIds: ['t1'], manualUids: [], includePrivate: false,
    });
  });

  it('falls back to the default config on corrupt JSON or storage errors', async () => {
    mockGetItem.mockImplementationOnce(async () => '{not json');
    mockGetItem.mockImplementationOnce(() => Promise.reject(new Error('disk error')));
    expect(await loadWidgetConfig()).toEqual(DEFAULT_CONFIG);
    expect(await loadWidgetConfig()).toEqual(DEFAULT_CONFIG);
  });
});

describe('saveWidgetConfig and clearWidgetConfig', () => {
  it('stores a normalized copy', async () => {
    await saveWidgetConfig({
      strategy: 'manual', recentCount: 99 as any, tagIds: [1 as unknown as string], manualUids: ['b', 'a'], includePrivate: false,
    });
    expect(mockSetItem).toHaveBeenCalledWith(STORAGE_KEY, JSON.stringify({
      strategy: 'manual', recentCount: 5, tagIds: [], manualUids: ['b', 'a'], includePrivate: false,
    }));
  });

  it('removes the stored config', async () => {
    await clearWidgetConfig();
    expect(mockRemoveItem).toHaveBeenCalledWith(STORAGE_KEY);
  });
});

describe('computeConfigHash', () => {
  it('returns a stable six-char hex fingerprint', () => {
    const config = { ...DEFAULT_CONFIG, strategy: 'recent' as const, recentCount: 5 as const };
    const hash = computeConfigHash(config);
    expect(hash).toMatch(/^[0-9a-f]{6}$/);
    expect(computeConfigHash(config)).toBe(hash);
  });

  it('ignores tag order but respects manual order, strategy and flags', () => {
    const base = { ...DEFAULT_CONFIG, tagIds: ['a', 'b'], manualUids: ['x', 'y'] };
    expect(computeConfigHash({ ...base, tagIds: ['b', 'a'] })).toBe(computeConfigHash(base));
    expect(computeConfigHash({ ...base, manualUids: ['y', 'x'] })).not.toBe(computeConfigHash(base));
    expect(computeConfigHash({ ...base, strategy: 'pinned' })).not.toBe(computeConfigHash(base));
    expect(computeConfigHash({ ...base, includePrivate: true })).not.toBe(computeConfigHash(base));
  });

  it('hashes invalid input like the default config', () => {
    expect(computeConfigHash({ strategy: 'junk', recentCount: 2 } as any)).toBe(computeConfigHash(DEFAULT_CONFIG));
  });
});
