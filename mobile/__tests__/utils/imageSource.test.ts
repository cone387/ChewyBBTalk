jest.mock('../../src/config', () => ({ getApiBaseUrl: () => 'https://notes.example.test' }));
jest.mock('../../src/services/auth', () => ({ getAccessTokenSync: () => 'private-token' }));

import { buildImageSource } from '../../src/utils/imageSource';

it('adds credentials only to the configured API origin', () => {
  const url = 'https://notes.example.test/api/v1/attachments/files/image/preview/';
  expect(buildImageSource(url)).toEqual({ uri: url, headers: { Authorization: 'Bearer private-token' } });
  for (const external of [
    'https://evil.test/api/v1/attachments/image',
    'https://notes.example.test.evil.test/api/private',
    'file:///cache/image.png',
    'https://cdn.example.test/signed.png?signature=opaque',
  ]) expect(buildImageSource(external)).toBe(external);
});
