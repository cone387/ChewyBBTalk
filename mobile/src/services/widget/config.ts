/**
 * Widget 配置的持久化与哈希计算
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WidgetConfig, WidgetStrategy, WidgetRecentCount } from './types';
import { DEFAULT_CONFIG } from './types';

const STORAGE_KEY = 'bbtalk.widget.config';

const VALID_STRATEGIES: WidgetStrategy[] = ['pinned', 'recent', 'tags', 'manual'];
const VALID_RECENT: WidgetRecentCount[] = [3, 5, 10];

/** 校验并归一化配置，任何非法字段回退到默认 */
export function normalizeConfig(input: unknown): WidgetConfig {
  if (!input || typeof input !== 'object') return { ...DEFAULT_CONFIG };
  const raw = input as Record<string, unknown>;

  const strategy = VALID_STRATEGIES.includes(raw.strategy as WidgetStrategy)
    ? (raw.strategy as WidgetStrategy)
    : DEFAULT_CONFIG.strategy;

  const recentCount = VALID_RECENT.includes(raw.recentCount as WidgetRecentCount)
    ? (raw.recentCount as WidgetRecentCount)
    : DEFAULT_CONFIG.recentCount;

  const tagIds = Array.isArray(raw.tagIds)
    ? raw.tagIds.filter((t: unknown): t is string => typeof t === 'string')
    : [];

  const manualUids = Array.isArray(raw.manualUids)
    ? raw.manualUids.filter((u: unknown): u is string => typeof u === 'string')
    : [];

  const includePrivate = raw.includePrivate === true;

  return { strategy, recentCount, tagIds, manualUids, includePrivate };
}

export async function loadWidgetConfig(): Promise<WidgetConfig> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    return normalizeConfig(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveWidgetConfig(config: WidgetConfig): Promise<void> {
  const normalized = normalizeConfig(config);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}

export async function clearWidgetConfig(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

/**
 * 计算配置指纹。
 * 不依赖 crypto-js：用字段序列化后的简单累积哈希（DJB2）取 6 位十六进制。
 * 用途仅为"快速判断配置是否变化"，无需抗碰撞强度。
 */
export function computeConfigHash(config: WidgetConfig): string {
  const normalized = normalizeConfig(config);
  const serialized = JSON.stringify({
    strategy: normalized.strategy,
    recentCount: normalized.recentCount,
    tagIds: [...normalized.tagIds].sort(),
    manualUids: [...normalized.manualUids], // 保留顺序，manual 顺序有意义
    includePrivate: normalized.includePrivate,
  });
  // DJB2
  let hash = 5381;
  for (let i = 0; i < serialized.length; i++) {
    hash = ((hash << 5) + hash + serialized.charCodeAt(i)) | 0;
  }
  // 转无符号 + 16 进制 + 截 6 位
  return (hash >>> 0).toString(16).padStart(8, '0').slice(0, 6);
}
