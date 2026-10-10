import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CachedImage from '../src/components/CachedImage';
import { imageCacheService } from '../src/services/cache/imageCache';

const boundary = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock('../src/services/api/apiClient', () => ({ apiClient: { download: boundary.download } }));
vi.mock('../src/services/authSessionScope', () => ({
  getAuthSessionScope: () => 'user-1/session-1',
  subscribeAuthSession: () => () => {},
}));

beforeEach(() => {
  imageCacheService.invalidateProtected();
  boundary.download.mockReset().mockImplementation(async () => new Blob(['image'], { type: 'image/png' }));
  URL.createObjectURL = vi.fn(() => `blob:${Math.random()}`);
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

it('shares one download across two mounted images and remounts with independently owned object URLs', async () => {
  const url = '/api/v1/attachments/9/preview';
  const first = render(<CachedImage src={url} alt="first" loading="eager" />);
  const second = render(<CachedImage src={url} alt="second" loading="eager" />);
  const firstImage = await screen.findByAltText('first');
  const secondImage = await screen.findByAltText('second');
  expect(boundary.download).toHaveBeenCalledTimes(1);
  expect(firstImage.getAttribute('src')).not.toBe(secondImage.getAttribute('src'));
  const firstObjectUrl = firstImage.getAttribute('src');
  first.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith(firstObjectUrl);
  expect(URL.revokeObjectURL).not.toHaveBeenCalledWith(secondImage.getAttribute('src'));
  second.unmount();
  render(<CachedImage src={url} alt="remounted" loading="eager" />);
  await screen.findByAltText('remounted');
  expect(boundary.download).toHaveBeenCalledTimes(1);
  expect(URL.createObjectURL).toHaveBeenCalledTimes(3);
});

it('decode failure retry replaces the cached protected blob with a fresh download', async () => {
  const url = '/api/v1/attachments/9/preview';
  render(<CachedImage src={url} alt="retry" loading="eager" />);
  fireEvent.error(await screen.findByAltText('retry'));
  fireEvent.click(screen.getByRole('button', { name: '重试加载图片 retry' }));
  await waitFor(() => expect(boundary.download).toHaveBeenCalledTimes(2));
  expect(boundary.download).toHaveBeenLastCalledWith(url, { cache: 'reload' });
  await screen.findByAltText('retry');
});
