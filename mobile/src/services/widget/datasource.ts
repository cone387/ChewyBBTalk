/**
 * 根据 WidgetConfig 从 BBTalk 列表中筛选出要展示的条目
 */
import type { BBTalk } from '../../types';
import type { WidgetConfig, WidgetItem } from './types';
import { MAX_CONTENT_CHARS, MAX_TAGS_PER_ITEM, MANUAL_MAX_ITEMS } from './types';

/** 将 BBTalk 裁剪为 WidgetItem（截断 content、标签、只留首张图） */
export function toWidgetItem(bbtalk: BBTalk): WidgetItem {
  const firstImage = bbtalk.attachments.find(
    (a) => a.type === 'image' || a.mimeType?.startsWith('image/'),
  );
  return {
    uid: bbtalk.id,
    content: bbtalk.content.slice(0, MAX_CONTENT_CHARS),
    updatedAt: bbtalk.updatedAt,
    isPinned: !!bbtalk.isPinned,
    visibility: bbtalk.visibility,
    tags: bbtalk.tags.slice(0, MAX_TAGS_PER_ITEM).map((t) => ({
      name: t.name,
      color: t.color,
    })),
    thumbnailUrl: firstImage?.url ?? null,
  };
}

/**
 * 根据配置与 BBTalk 列表筛选目标条目。
 *
 * 属性约束（见 design.md）：
 *   - 结果长度 ≤ min(strategy 上限, 输入长度)
 *   - 结果所有项均属于输入列表（子集关系）
 *   - includePrivate=false 时结果全部为 visibility === 'public'
 *   - manual 策略下输出顺序与 config.manualUids 完全一致
 */
export function selectWidgetItems(
  config: WidgetConfig,
  bbtalks: BBTalk[],
): WidgetItem[] {
  // 统一的可见性过滤
  const visibilityFilter = (b: BBTalk) =>
    config.includePrivate ? true : b.visibility === 'public';

  let filtered = bbtalks.filter(visibilityFilter);
  const maxByStrategy: Record<WidgetConfig['strategy'], number> = {
    pinned: config.recentCount,
    recent: config.recentCount,
    tags: config.recentCount,
    manual: MANUAL_MAX_ITEMS,
  };

  switch (config.strategy) {
    case 'pinned':
      filtered = filtered
        .filter((b) => !!b.isPinned)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      break;

    case 'recent':
      // 置顶仍优先，其后按更新时间降序（与 App 列表默认排序一致）
      filtered = [...filtered].sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return b.updatedAt.localeCompare(a.updatedAt);
      });
      break;

    case 'tags': {
      const tagSet = new Set(config.tagIds);
      filtered = filtered
        .filter((b) => b.tags.some((t) => tagSet.has(t.id)))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      break;
    }

    case 'manual': {
      const order = new Map<string, number>();
      config.manualUids.forEach((uid, idx) => order.set(uid, idx));
      filtered = filtered
        .filter((b) => order.has(b.id))
        .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      break;
    }
  }

  const limit = Math.min(maxByStrategy[config.strategy], MANUAL_MAX_ITEMS);
  return filtered.slice(0, limit).map(toWidgetItem);
}
