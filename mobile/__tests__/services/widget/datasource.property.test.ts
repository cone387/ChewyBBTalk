/**
 * Widget_DataSource 属性测试
 * Feature: mobile-home-widget
 *
 * 覆盖属性：
 *   - Property 1: 配置筛选稳定性（长度上限 + 子集关系）
 *   - Property 2: 可见性过滤（includePrivate=false 时结果全为 public）
 *   - Property 4: manual 顺序保持
 *
 * **Validates: Requirements 2.2, 2.3, 4.1-4.3, 6.3**
 */

import fc from 'fast-check';
import type { BBTalk, Tag } from '../../../src/types';
import { selectWidgetItems } from '../../../src/services/widget/datasource';
import type { WidgetConfig, WidgetStrategy } from '../../../src/services/widget/types';
import { MANUAL_MAX_ITEMS } from '../../../src/services/widget/types';

// --- 生成器 ---

const arbTag: fc.Arbitrary<Tag> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 10 }),
  name: fc.string({ minLength: 1, maxLength: 20 }),
  color: fc.constantFrom('#3B82F6', '#EF4444', '#10B981'),
});

const arbVisibility = fc.constantFrom<BBTalk['visibility']>('public', 'private', 'friends');

const arbBBTalk: fc.Arbitrary<BBTalk> = fc
  .tuple(
    fc.uuid(),
    fc.string({ minLength: 0, maxLength: 300 }),
    arbVisibility,
    fc.array(arbTag, { maxLength: 5 }),
    fc.boolean(),
    fc.date({ min: new Date('2024-01-01'), max: new Date('2030-01-01'), noInvalidDate: true }),
  )
  .map(([id, content, visibility, tags, isPinned, updatedAt]) => ({
    id,
    content,
    visibility,
    tags,
    attachments: [],
    isPinned,
    createdAt: updatedAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  }));

const arbBBTalkList = (min = 0, max = 50) =>
  fc.array(arbBBTalk, { minLength: min, maxLength: max });

const arbRecentCount = fc.constantFrom(3, 5, 10) as fc.Arbitrary<3 | 5 | 10>;
const arbStrategy = fc.constantFrom<WidgetStrategy>('pinned', 'recent', 'tags', 'manual');

// 任意配置（tagIds / manualUids 任取，用于 Property 1 / 2 的通用性测试）
const arbConfig: fc.Arbitrary<WidgetConfig> = fc.record({
  strategy: arbStrategy,
  recentCount: arbRecentCount,
  tagIds: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 5 }),
  manualUids: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 10 }),
  includePrivate: fc.boolean(),
});

// =========================================================================
// Property 1: 配置筛选稳定性
// =========================================================================
describe('Property 1: 配置筛选稳定性', () => {
  it('结果长度 ≤ min(策略上限, 输入长度)', () => {
    fc.assert(
      fc.property(arbConfig, arbBBTalkList(0, 50), (config, bbtalks) => {
        const result = selectWidgetItems(config, bbtalks);
        const strategyLimit =
          config.strategy === 'manual' ? MANUAL_MAX_ITEMS : config.recentCount;
        expect(result.length).toBeLessThanOrEqual(Math.min(strategyLimit, bbtalks.length));
      }),
      { numRuns: 200 },
    );
  });

  it('所有结果项 uid 都出现在输入列表中（子集关系）', () => {
    fc.assert(
      fc.property(arbConfig, arbBBTalkList(0, 50), (config, bbtalks) => {
        const inputIds = new Set(bbtalks.map((b) => b.id));
        const result = selectWidgetItems(config, bbtalks);
        for (const item of result) {
          expect(inputIds.has(item.uid)).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('结果中 uid 互不重复', () => {
    fc.assert(
      fc.property(arbConfig, arbBBTalkList(0, 50), (config, bbtalks) => {
        const result = selectWidgetItems(config, bbtalks);
        const ids = result.map((r) => r.uid);
        expect(new Set(ids).size).toBe(ids.length);
      }),
      { numRuns: 200 },
    );
  });
});

// =========================================================================
// Property 2: 可见性过滤
// =========================================================================
describe('Property 2: 可见性过滤（includePrivate=false 时结果全为 public）', () => {
  const arbPublicExcludingConfig: fc.Arbitrary<WidgetConfig> = arbConfig.map((c) => ({
    ...c,
    includePrivate: false,
  }));

  it('includePrivate=false 时 widget items 全部 visibility=public', () => {
    fc.assert(
      fc.property(
        arbPublicExcludingConfig,
        arbBBTalkList(0, 50),
        (config, bbtalks) => {
          const result = selectWidgetItems(config, bbtalks);
          for (const item of result) {
            expect(item.visibility).toBe('public');
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('includePrivate=true 时可以出现非 public 条目（存在性检查）', () => {
    // 存在性：只要有一个样例能出现 private，就说明过滤被正确关闭
    const hasPrivateRun = fc.check(
      fc.property(arbBBTalkList(5, 30), (bbtalks) => {
        const config: WidgetConfig = {
          strategy: 'recent',
          recentCount: 10,
          tagIds: [],
          manualUids: [],
          includePrivate: true,
        };
        const result = selectWidgetItems(config, bbtalks);
        return !result.some((it) => it.visibility !== 'public');
      }),
      { numRuns: 200 },
    );
    // 期望至少有一次反例（即有 private 条目出现）
    expect(hasPrivateRun.failed).toBe(true);
  });
});

// =========================================================================
// Property 4: manual 策略顺序保持
// =========================================================================
describe('Property 4: manual 顺序保持', () => {
  // 构造一组同时覆盖 manualUids 与 BBTalk 列表的测试数据：
  //   - manualUids 为给定顺序 [u1, u2, ..., un]
  //   - BBTalks 中 id 取自 manualUids（顺序被打乱），全部 public 以免被过滤
  it('manual 策略下输出顺序与 manualUids 完全一致', () => {
    fc.assert(
      fc.property(
        fc
          .array(fc.uuid(), { minLength: 1, maxLength: 10 })
          .map((uids) => Array.from(new Set(uids))), // 去重
        (uniqueUids) => {
          fc.pre(uniqueUids.length > 0);

          // shuffled 输入列表
          const shuffled = [...uniqueUids].sort(() => Math.random() - 0.5);
          const bbtalks: BBTalk[] = shuffled.map((id, idx) => ({
            id,
            content: `content-${idx}`,
            visibility: 'public',
            tags: [],
            attachments: [],
            isPinned: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date(Date.now() + idx * 1000).toISOString(),
          }));

          const config: WidgetConfig = {
            strategy: 'manual',
            recentCount: 10,
            tagIds: [],
            manualUids: uniqueUids,
            includePrivate: false,
          };

          const result = selectWidgetItems(config, bbtalks);
          expect(result.map((r) => r.uid)).toEqual(uniqueUids);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('manual 策略下 manualUids 中不存在于 bbtalks 的 uid 被过滤', () => {
    fc.assert(
      fc.property(arbBBTalkList(1, 20), fc.array(fc.uuid(), { minLength: 0, maxLength: 5 }), (bbtalks, ghostUids) => {
        const allBBTalkIds = new Set(bbtalks.map((b) => b.id));
        const manualUids = [...bbtalks.map((b) => b.id), ...ghostUids];

        const config: WidgetConfig = {
          strategy: 'manual',
          recentCount: 10,
          tagIds: [],
          manualUids,
          includePrivate: true, // 去掉可见性干扰
        };

        const result = selectWidgetItems(config, bbtalks);
        // 所有结果 uid 必须同时出现在 manualUids 与 bbtalks 中
        for (const item of result) {
          expect(allBBTalkIds.has(item.uid)).toBe(true);
          expect(manualUids.includes(item.uid)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});
