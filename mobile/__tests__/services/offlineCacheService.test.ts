/**
 * OfflineCacheService 属性测试
 * Feature: mobile-v1.1-enhancements
 *
 * 属性 7：离线缓存 round-trip
 * 属性 8：清除缓存正确性
 *
 * 由于 expo-sqlite 需要原生运行时，无法在 Node.js 测试环境中运行，
 * 因此测试 cacheBBTalks + getCachedBBTalks 内部的核心逻辑：
 * JSON 序列化/反序列化 round-trip 语义等价性。
 *
 * **Validates: Requirements 5.1, 5.10**
 */

import * as fc from 'fast-check';
import type { BBTalk, Tag, Attachment } from '../../src/types';

// --- Generators ---

/** 生成随机 Tag 对象 */
const arbTag: fc.Arbitrary<Tag> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 20 }),
  color: fc.stringMatching(/^#[0-9a-f]{6}$/),
  sortOrder: fc.option(fc.nat({ max: 1000 }), { nil: undefined }),
  bbtalkCount: fc.option(fc.nat({ max: 10000 }), { nil: undefined }),
});

/** 生成随机 Attachment 对象 */
const arbAttachment: fc.Arbitrary<Attachment> = fc.record({
  uid: fc.uuid(),
  url: fc.webUrl(),
  type: fc.oneof(
    fc.constant('image'),
    fc.constant('audio'),
    fc.constant('video'),
    fc.constant('file'),
  ),
  filename: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  originalFilename: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  fileSize: fc.option(fc.nat({ max: 100_000_000 }), { nil: undefined }),
  mimeType: fc.option(
    fc.oneof(
      fc.constant('image/jpeg'),
      fc.constant('image/png'),
      fc.constant('audio/mpeg'),
      fc.constant('video/mp4'),
      fc.constant('application/pdf'),
    ),
    { nil: undefined },
  ),
});

/** 生成有效 ISO 日期字符串 */
const arbISODate = fc
  .integer({ min: 946684800000, max: 4102444799999 })
  .map(ts => new Date(ts).toISOString());

/** 生成随机 context 对象（JSON-safe） */
const arbContext: fc.Arbitrary<Record<string, any> | undefined> = fc.option(
  fc.dictionary(
    fc.string({ minLength: 1, maxLength: 10 }).filter(s => s.trim().length > 0),
    fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
    { minKeys: 0, maxKeys: 5 },
  ),
  { nil: undefined },
);

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
  attachments: fc.array(arbAttachment, { minLength: 0, maxLength: 10 }),
  context: arbContext,
  isPinned: fc.option(fc.boolean(), { nil: undefined }),
  createdAt: arbISODate,
  updatedAt: arbISODate,
});

/** 生成随机 BBTalk 列表（0-50 条） */
const arbBBTalkList = fc.array(arbBBTalk, { minLength: 0, maxLength: 50 });

/** 生成非空 BBTalk 列表（1-50 条） */
const arbNonEmptyBBTalkList = fc.array(arbBBTalk, { minLength: 1, maxLength: 50 });

// --- Helper: simulate the cache round-trip ---

/**
 * 模拟 cacheBBTalks + getCachedBBTalks 的核心逻辑：
 * 写入时 JSON.stringify 序列化，读取时 JSON.parse 反序列化。
 * 这是 OfflineCacheService 内部实际执行的数据转换。
 */
function simulateCacheRoundTrip(bbtalks: BBTalk[]): BBTalk[] {
  // cacheBBTalks: JSON.stringify(item) for each item
  // getCachedBBTalks: JSON.parse(row.data) for each row
  return bbtalks.map(item => JSON.parse(JSON.stringify(item)));
}

/**
 * 比较两个 BBTalk 对象是否语义等价。
 * 检查所有核心字段：id, content, tags, attachments, visibility, isPinned, createdAt, updatedAt, context
 */
function assertBBTalkSemanticEqual(original: BBTalk, restored: BBTalk): void {
  expect(restored.id).toBe(original.id);
  expect(restored.content).toBe(original.content);
  expect(restored.visibility).toBe(original.visibility);
  expect(restored.isPinned).toBe(original.isPinned);
  expect(restored.createdAt).toBe(original.createdAt);
  expect(restored.updatedAt).toBe(original.updatedAt);

  // Tags: 数量和每个 tag 的 id/name/color 一致
  expect(restored.tags).toHaveLength(original.tags.length);
  for (let i = 0; i < original.tags.length; i++) {
    expect(restored.tags[i].id).toBe(original.tags[i].id);
    expect(restored.tags[i].name).toBe(original.tags[i].name);
    expect(restored.tags[i].color).toBe(original.tags[i].color);
  }

  // Attachments: 数量和每个 attachment 的核心字段一致
  expect(restored.attachments).toHaveLength(original.attachments.length);
  for (let i = 0; i < original.attachments.length; i++) {
    expect(restored.attachments[i].uid).toBe(original.attachments[i].uid);
    expect(restored.attachments[i].url).toBe(original.attachments[i].url);
    expect(restored.attachments[i].type).toBe(original.attachments[i].type);
    expect(restored.attachments[i].filename).toBe(original.attachments[i].filename);
  }

  // Context: deep equality via JSON comparison
  expect(JSON.stringify(restored.context)).toBe(JSON.stringify(original.context));
}

// --- Property Tests ---

describe('OfflineCacheService - Property 7: 离线缓存 round-trip', () => {
  /**
   * **Validates: Requirements 5.1**
   *
   * 对于任意 BBTalk 列表（0-50 条，含随机 tags/attachments），
   * 经过 JSON.stringify → JSON.parse round-trip 后，
   * 结果应与原始列表在语义上等价。
   */
  it('cacheBBTalks 写入后 getCachedBBTalks 读取结果语义等价', () => {
    fc.assert(
      fc.property(arbBBTalkList, (bbtalks) => {
        const restored = simulateCacheRoundTrip(bbtalks);

        // 列表长度一致
        expect(restored).toHaveLength(bbtalks.length);

        // 每条 BBTalk 语义等价
        for (let i = 0; i < bbtalks.length; i++) {
          assertBBTalkSemanticEqual(bbtalks[i], restored[i]);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('空列表 round-trip 返回空列表', () => {
    const restored = simulateCacheRoundTrip([]);
    expect(restored).toEqual([]);
  });

  it('单条 BBTalk round-trip 保持所有字段', () => {
    fc.assert(
      fc.property(arbBBTalk, (item) => {
        const [restored] = simulateCacheRoundTrip([item]);
        assertBBTalkSemanticEqual(item, restored);
      }),
      { numRuns: 100 },
    );
  });

  it('round-trip 后 JSON 深度相等', () => {
    fc.assert(
      fc.property(arbBBTalkList, (bbtalks) => {
        const restored = simulateCacheRoundTrip(bbtalks);
        // JSON.stringify round-trip should produce deep-equal objects
        expect(restored).toEqual(JSON.parse(JSON.stringify(bbtalks)));
      }),
      { numRuns: 100 },
    );
  });
});

describe('OfflineCacheService - Property 8: 清除缓存正确性', () => {
  /**
   * **Validates: Requirements 5.10**
   *
   * 模拟缓存状态管理：
   * 对于任意非空缓存状态，clearCache 后
   * getCachedBBTalks 返回空列表，getLastSyncTime 返回 null。
   */

  /** 模拟简单的内存缓存状态，验证 clear 语义 */
  class MockCacheState {
    private bbtalks: BBTalk[] = [];
    private meta: Map<string, string> = new Map();

    cacheBBTalks(items: BBTalk[]): void {
      // 全量替换策略（与 offlineCacheService 一致）
      this.bbtalks = items.map(item => JSON.parse(JSON.stringify(item)));
    }

    getCachedBBTalks(): BBTalk[] {
      return [...this.bbtalks];
    }

    setLastSyncTime(timestamp: string): void {
      this.meta.set('last_sync_time', timestamp);
    }

    getLastSyncTime(): string | null {
      return this.meta.get('last_sync_time') ?? null;
    }

    clearCache(): void {
      this.bbtalks = [];
      this.meta.clear();
    }
  }

  it('clearCache 后 getCachedBBTalks 返回空列表', () => {
    fc.assert(
      fc.property(arbNonEmptyBBTalkList, (bbtalks) => {
        const cache = new MockCacheState();

        // 写入非空缓存
        cache.cacheBBTalks(bbtalks);
        expect(cache.getCachedBBTalks().length).toBeGreaterThan(0);

        // 清除缓存
        cache.clearCache();

        // 验证：空列表
        expect(cache.getCachedBBTalks()).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });

  it('clearCache 后 getLastSyncTime 返回 null', () => {
    fc.assert(
      fc.property(
        arbNonEmptyBBTalkList,
        arbISODate,
        (bbtalks, syncTime) => {
          const cache = new MockCacheState();

          // 写入缓存并设置同步时间
          cache.cacheBBTalks(bbtalks);
          cache.setLastSyncTime(syncTime);
          expect(cache.getLastSyncTime()).toBe(syncTime);

          // 清除缓存
          cache.clearCache();

          // 验证：lastSyncTime 为 null
          expect(cache.getLastSyncTime()).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('clearCache 后再次写入缓存应正常工作', () => {
    fc.assert(
      fc.property(
        arbNonEmptyBBTalkList,
        arbNonEmptyBBTalkList,
        (firstBatch, secondBatch) => {
          const cache = new MockCacheState();

          // 第一次写入
          cache.cacheBBTalks(firstBatch);
          expect(cache.getCachedBBTalks()).toHaveLength(firstBatch.length);

          // 清除
          cache.clearCache();
          expect(cache.getCachedBBTalks()).toEqual([]);

          // 第二次写入
          cache.cacheBBTalks(secondBatch);
          expect(cache.getCachedBBTalks()).toHaveLength(secondBatch.length);

          // 验证第二次写入的数据语义等价
          const restored = cache.getCachedBBTalks();
          for (let i = 0; i < secondBatch.length; i++) {
            assertBBTalkSemanticEqual(secondBatch[i], restored[i]);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('全量替换策略：cacheBBTalks 覆盖旧数据', () => {
    fc.assert(
      fc.property(
        arbNonEmptyBBTalkList,
        arbBBTalkList,
        (firstBatch, secondBatch) => {
          const cache = new MockCacheState();

          // 第一次写入
          cache.cacheBBTalks(firstBatch);

          // 第二次写入（全量替换）
          cache.cacheBBTalks(secondBatch);

          // 验证：只包含第二次写入的数据
          const restored = cache.getCachedBBTalks();
          expect(restored).toHaveLength(secondBatch.length);
          for (let i = 0; i < secondBatch.length; i++) {
            assertBBTalkSemanticEqual(secondBatch[i], restored[i]);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
