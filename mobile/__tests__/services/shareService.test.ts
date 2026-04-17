/**
 * ShareService 属性测试
 * Feature: mobile-v1.1-enhancements, Property 1: 分享文本组装正确性
 *
 * **Validates: Requirements 1.2, 1.5**
 */

// Mock external dependencies that shareService imports
jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
  Platform: { OS: 'ios' },
  Share: { share: jest.fn(), dismissedAction: 'dismissedAction' },
}));
jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
}));
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: '/tmp/',
  downloadAsync: jest.fn(),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));
jest.mock('../../src/utils/errorHandler', () => ({
  logError: jest.fn(),
}));

import * as fc from 'fast-check';
import { buildShareText } from '../../src/services/shareService';
import type { BBTalk, Tag, Attachment } from '../../src/types';

// --- Generators ---

/** 生成随机 Tag 对象 */
const arbTag: fc.Arbitrary<Tag> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes('#') && !s.includes('\n') && !s.includes('\r') && s.trim().length > 0),
  color: fc.constant('#aabbcc'),
});

/** 生成随机 Attachment 对象，type 从常见类型中选取 */
const arbAttachment: fc.Arbitrary<Attachment> = fc.record({
  uid: fc.uuid(),
  url: fc.webUrl(),
  type: fc.oneof(
    fc.constant('image'),
    fc.constant('audio'),
    fc.constant('video'),
    fc.constant('file'),
  ),
  filename: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
});

/** 生成有效 ISO 日期字符串（使用整数时间戳避免 Invalid Date） */
const arbISODate = fc.integer({ min: 946684800000, max: 4102444799999 }).map(ts => new Date(ts).toISOString());

/** 生成随机 BBTalk 对象 */
const arbBBTalk: fc.Arbitrary<BBTalk> = fc.record({
  id: fc.uuid(),
  content: fc.string({ minLength: 0, maxLength: 500 }),
  visibility: fc.oneof(
    fc.constant('public' as const),
    fc.constant('private' as const),
    fc.constant('friends' as const),
  ),
  tags: fc.array(arbTag, { minLength: 0, maxLength: 10 }),
  attachments: fc.array(arbAttachment, { minLength: 0, maxLength: 5 }),
  isPinned: fc.option(fc.boolean(), { nil: undefined }),
  createdAt: arbISODate,
  updatedAt: arbISODate,
});

// --- Property Tests ---

describe('ShareService - Property 1: 分享文本组装正确性', () => {
  it('输出应包含原始 content 文本', () => {
    fc.assert(
      fc.property(arbBBTalk, (item) => {
        const result = buildShareText(item);
        expect(result).toContain(item.content);
      }),
      { numRuns: 100 },
    );
  });

  it('当 tags 非空时，输出应包含所有 tag 名称（#tagName 格式）', () => {
    const arbBBTalkWithTags = arbBBTalk.filter(item => item.tags.length > 0);

    fc.assert(
      fc.property(arbBBTalkWithTags, (item) => {
        const result = buildShareText(item);
        for (const tag of item.tags) {
          expect(result).toContain(`#${tag.name}`);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('当 tags 为空时，输出应等于原始 content', () => {
    const arbBBTalkNoTags: fc.Arbitrary<BBTalk> = fc.record({
      id: fc.uuid(),
      content: fc.string({ minLength: 0, maxLength: 500 }),
      visibility: fc.oneof(
        fc.constant('public' as const),
        fc.constant('private' as const),
        fc.constant('friends' as const),
      ),
      tags: fc.constant([] as Tag[]),
      attachments: fc.array(arbAttachment, { minLength: 0, maxLength: 5 }),
      isPinned: fc.option(fc.boolean(), { nil: undefined }),
      createdAt: arbISODate,
      updatedAt: arbISODate,
    });

    fc.assert(
      fc.property(arbBBTalkNoTags, (item) => {
        const result = buildShareText(item);
        expect(result).toBe(item.content);
      }),
      { numRuns: 100 },
    );
  });

  it('输出不应包含非图片附件信息（audio/video/file 的 url 或 filename）', () => {
    const arbNonImageAttachment: fc.Arbitrary<Attachment> = fc.record({
      uid: fc.uuid(),
      url: fc.webUrl(),
      type: fc.oneof(
        fc.constant('audio'),
        fc.constant('video'),
        fc.constant('file'),
      ),
      // Use a unique prefix to avoid accidental substring matches with content/tags
      filename: fc.uuid().map(id => `__attach_${id}.dat`),
    });

    const arbBBTalkWithNonImageAttachments: fc.Arbitrary<BBTalk> = fc.record({
      id: fc.uuid(),
      content: fc.string({ minLength: 1, maxLength: 100 }),
      visibility: fc.oneof(
        fc.constant('public' as const),
        fc.constant('private' as const),
        fc.constant('friends' as const),
      ),
      tags: fc.array(arbTag, { minLength: 0, maxLength: 5 }),
      attachments: fc.array(arbNonImageAttachment, { minLength: 1, maxLength: 5 }),
      isPinned: fc.option(fc.boolean(), { nil: undefined }),
      createdAt: arbISODate,
      updatedAt: arbISODate,
    });

    fc.assert(
      fc.property(arbBBTalkWithNonImageAttachments, (item) => {
        const result = buildShareText(item);
        for (const att of item.attachments) {
          // Non-image attachment URLs should not appear in share text
          expect(result).not.toContain(att.url);
          // Non-image attachment filenames should not appear in share text
          if (att.filename) {
            expect(result).not.toContain(att.filename);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
