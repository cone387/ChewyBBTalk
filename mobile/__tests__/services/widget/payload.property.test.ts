/**
 * Widget payload 裁剪属性测试
 * Feature: mobile-home-widget
 *
 * 覆盖属性：
 *   - Property 3: payload 裁剪（content ≤ 200、tags ≤ 3）
 *
 * **Validates: Requirements 3.2, 7.3**
 */

import fc from 'fast-check';
import type { BBTalk, Tag, Attachment } from '../../../src/types';
import { toWidgetItem } from '../../../src/services/widget/datasource';
import {
  MAX_CONTENT_CHARS,
  MAX_TAGS_PER_ITEM,
} from '../../../src/services/widget/types';

const arbTag: fc.Arbitrary<Tag> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 10 }),
  name: fc.string({ minLength: 1, maxLength: 20 }),
  color: fc.constantFrom('#3B82F6', '#EF4444', '#10B981'),
});

const arbAttachment: fc.Arbitrary<Attachment> = fc.record({
  uid: fc.string({ minLength: 1, maxLength: 10 }),
  url: fc.webUrl(),
  type: fc.constantFrom('image', 'audio', 'video', 'file'),
});

const arbBBTalk: fc.Arbitrary<BBTalk> = fc.record({
  id: fc.uuid(),
  content: fc.string({ minLength: 0, maxLength: 500 }),
  visibility: fc.constantFrom<BBTalk['visibility']>('public', 'private', 'friends'),
  tags: fc.array(arbTag, { maxLength: 10 }),
  attachments: fc.array(arbAttachment, { maxLength: 5 }),
  isPinned: fc.boolean(),
  createdAt: fc.date({ noInvalidDate: true }).map((d) => d.toISOString()),
  updatedAt: fc.date({ noInvalidDate: true }).map((d) => d.toISOString()),
});

describe('Property 3: payload 裁剪', () => {
  it('toWidgetItem.content 长度 ≤ MAX_CONTENT_CHARS', () => {
    fc.assert(
      fc.property(arbBBTalk, (bbtalk) => {
        const item = toWidgetItem(bbtalk);
        expect(item.content.length).toBeLessThanOrEqual(MAX_CONTENT_CHARS);
      }),
      { numRuns: 200 },
    );
  });

  it('toWidgetItem.tags 长度 ≤ MAX_TAGS_PER_ITEM', () => {
    fc.assert(
      fc.property(arbBBTalk, (bbtalk) => {
        const item = toWidgetItem(bbtalk);
        expect(item.tags.length).toBeLessThanOrEqual(MAX_TAGS_PER_ITEM);
      }),
      { numRuns: 200 },
    );
  });

  it('toWidgetItem 保留原始 uid / updatedAt / isPinned / visibility', () => {
    fc.assert(
      fc.property(arbBBTalk, (bbtalk) => {
        const item = toWidgetItem(bbtalk);
        expect(item.uid).toBe(bbtalk.id);
        expect(item.updatedAt).toBe(bbtalk.updatedAt);
        expect(item.isPinned).toBe(!!bbtalk.isPinned);
        expect(item.visibility).toBe(bbtalk.visibility);
      }),
      { numRuns: 200 },
    );
  });

  it('content 前缀是原 content 的前缀（无内容改写）', () => {
    fc.assert(
      fc.property(arbBBTalk, (bbtalk) => {
        const item = toWidgetItem(bbtalk);
        expect(bbtalk.content.startsWith(item.content)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('tags 是原 tags 的前缀切片', () => {
    fc.assert(
      fc.property(arbBBTalk, (bbtalk) => {
        const item = toWidgetItem(bbtalk);
        // tags 前 N 项的 name/color 应与原 tags 的 slice 一致
        const expected = bbtalk.tags.slice(0, MAX_TAGS_PER_ITEM).map((t) => ({
          name: t.name,
          color: t.color,
        }));
        expect(item.tags).toEqual(expected);
      }),
      { numRuns: 200 },
    );
  });
});

describe('toWidgetItem 缩略图提取', () => {
  it('第一张图片附件作为 thumbnailUrl', () => {
    const bbtalk: BBTalk = {
      id: 'x',
      content: 'hi',
      visibility: 'public',
      tags: [],
      attachments: [
        { uid: 'a1', url: 'https://example.com/1.jpg', type: 'image' },
        { uid: 'a2', url: 'https://example.com/2.jpg', type: 'image' },
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const item = toWidgetItem(bbtalk);
    expect(item.thumbnailUrl).toBe('https://example.com/1.jpg');
  });

  it('没有图片附件时 thumbnailUrl 为 null', () => {
    const bbtalk: BBTalk = {
      id: 'x',
      content: 'hi',
      visibility: 'public',
      tags: [],
      attachments: [
        { uid: 'a1', url: 'https://example.com/a.mp3', type: 'audio' },
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const item = toWidgetItem(bbtalk);
    expect(item.thumbnailUrl).toBeNull();
  });
});
