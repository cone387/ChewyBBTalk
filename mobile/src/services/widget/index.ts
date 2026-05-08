/**
 * Widget_DataSource 公共入口
 *
 * 用法：
 *   import { syncWidget, clearWidget } from '../../services/widget';
 *   await syncWidget();             // App 有新数据时调用
 *   await clearWidget('logout');    // 登出 / 锁定时调用
 */
import { store } from '../../store';
import type { WidgetConfig, WidgetPayload } from './types';
import {
  DEFAULT_THEME,
  MAX_CONTENT_CHARS,
  MAX_PAYLOAD_BYTES,
} from './types';
import { loadWidgetConfig, computeConfigHash } from './config';
import { selectWidgetItems } from './datasource';
import { isSupported, writeWidgetData, reloadWidget } from './bridge';

export * from './types';
export { loadWidgetConfig, saveWidgetConfig, computeConfigHash } from './config';
export { selectWidgetItems, toWidgetItem } from './datasource';
export { isSupported, readWidgetData } from './bridge';
export {
  startWidgetAutoSync,
  stopWidgetAutoSync,
  setWidgetAuthState,
} from './autoSync';

type ClearReason = 'logout' | 'locked' | 'empty';

/** 连续 reload 失败计数，超过阈值进入冷却期 */
let consecutiveReloadFailures = 0;
let reloadCooldownUntil = 0;
const MAX_RELOAD_FAILURES = 3;
const RELOAD_COOLDOWN_MS = 5 * 60 * 1000;

/** 构建 payload 并按 32KB 上限做三级裁剪 */
function buildPayload(
  config: WidgetConfig,
  authenticated: boolean,
  locked: boolean,
): WidgetPayload {
  const state = store.getState();
  const bbtalks = state.bbtalk.bbtalks;
  const items = selectWidgetItems(config, bbtalks);

  const base: WidgetPayload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    configHash: computeConfigHash(config),
    locked,
    authenticated,
    theme: DEFAULT_THEME,
    items,
    placeholder: null,
  };

  return trimPayload(base);
}

/**
 * 三级裁剪：
 *   1. 先去缩略图 URL
 *   2. 再截短 content
 *   3. 最后减少 items 数量
 * 直到 JSON 序列化长度 ≤ MAX_PAYLOAD_BYTES
 */
function trimPayload(payload: WidgetPayload): WidgetPayload {
  let current = payload;
  const byteLen = (obj: unknown) => {
    try {
      // React Native 运行时有 Buffer / TextEncoder 差异，保守用字符串长度 * 2 估算（UTF-16）
      const s = JSON.stringify(obj);
      return s ? s.length * 2 : 0;
    } catch {
      return 0;
    }
  };

  if (byteLen(current) <= MAX_PAYLOAD_BYTES) return current;

  // 1. 去缩略图
  current = {
    ...current,
    items: current.items.map((it) => ({ ...it, thumbnailUrl: null })),
  };
  if (byteLen(current) <= MAX_PAYLOAD_BYTES) return current;

  // 2. 截短 content 至 80 字符
  current = {
    ...current,
    items: current.items.map((it) => ({
      ...it,
      content: it.content.slice(0, Math.min(80, MAX_CONTENT_CHARS)),
    })),
  };
  if (byteLen(current) <= MAX_PAYLOAD_BYTES) return current;

  // 3. 逐条砍到满足
  while (current.items.length > 1 && byteLen(current) > MAX_PAYLOAD_BYTES) {
    current = { ...current, items: current.items.slice(0, current.items.length - 1) };
  }
  return current;
}

async function writeAndReload(payload: WidgetPayload): Promise<void> {
  if (!isSupported()) return;
  try {
    await writeWidgetData(JSON.stringify(payload));
  } catch (e) {
    console.warn('[HomeWidget] writeWidgetData failed:', e);
    return;
  }

  if (Date.now() < reloadCooldownUntil) {
    // 冷却期：只写不 reload，等待系统定时刷新兜底
    return;
  }

  try {
    await reloadWidget();
    consecutiveReloadFailures = 0;
  } catch (e) {
    consecutiveReloadFailures += 1;
    console.warn(
      `[HomeWidget] reloadWidget failed (${consecutiveReloadFailures}/${MAX_RELOAD_FAILURES}):`,
      e,
    );
    if (consecutiveReloadFailures >= MAX_RELOAD_FAILURES) {
      reloadCooldownUntil = Date.now() + RELOAD_COOLDOWN_MS;
      console.warn(
        `[HomeWidget] enter reload cooldown for ${RELOAD_COOLDOWN_MS / 1000}s`,
      );
    }
  }
}

/**
 * 根据当前 Redux store 与用户配置同步小组件。
 * 在 App 有数据更新时调用，不阻塞 UI。
 */
export async function syncWidget(options?: {
  authenticated?: boolean;
  locked?: boolean;
}): Promise<void> {
  if (!isSupported()) return;
  try {
    const config = await loadWidgetConfig();
    const payload = buildPayload(
      config,
      options?.authenticated ?? true,
      options?.locked ?? false,
    );
    await writeAndReload(payload);
  } catch (e) {
    console.warn('[HomeWidget] syncWidget failed:', e);
  }
}

/** 清空小组件内容（登出 / 锁定 / 空数据时调用） */
export async function clearWidget(reason: ClearReason): Promise<void> {
  if (!isSupported()) return;
  try {
    const config = await loadWidgetConfig();
    const placeholderMap: Record<ClearReason, string> = {
      logout: '请登录',
      locked: '已锁定',
      empty: '暂无内容，点击记录一下 👇',
    };
    const payload: WidgetPayload = {
      version: 1,
      generatedAt: new Date().toISOString(),
      configHash: computeConfigHash(config),
      locked: reason === 'locked',
      authenticated: reason !== 'logout',
      theme: DEFAULT_THEME,
      items: [],
      placeholder: placeholderMap[reason],
    };
    await writeAndReload(payload);
  } catch (e) {
    console.warn('[HomeWidget] clearWidget failed:', e);
  }
}

/** 供测试或调试使用：重置 reload 失败冷却 */
export function _resetReloadState(): void {
  consecutiveReloadFailures = 0;
  reloadCooldownUntil = 0;
}
