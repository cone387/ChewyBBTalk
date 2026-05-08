/**
 * Widget 自动同步：订阅 Redux store，当 bbtalks 列表引用变化时
 * 触发 syncWidget()（带 debounce，避免短时间多次写文件）
 *
 * 覆盖场景（因为这些 action 都会修改 state.bbtalk.bbtalks 引用）：
 *   - fetchBBTalks / loadMoreBBTalks 完成
 *   - createBBTalk / updateBBTalk / deleteBBTalk 完成
 *   - togglePin 完成
 *   - optimisticDelete / undoDelete
 *   - setBBTalksFromCache
 */
import { store } from '../../store';
import { syncWidget } from './index';

const DEBOUNCE_MS = 500;

let unsubscribe: (() => void) | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastBBTalksRef: unknown = undefined;
let authenticatedFlag = true;
let lockedFlag = false;

function scheduleSync(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void syncWidget({ authenticated: authenticatedFlag, locked: lockedFlag }).catch(
      (e) => console.warn('[HomeWidget] auto sync failed:', e),
    );
  }, DEBOUNCE_MS);
}

/** 更新当前鉴权 / 锁定状态，之后的自动同步会带上这些标记 */
export function setWidgetAuthState(opts: { authenticated?: boolean; locked?: boolean }): void {
  if (opts.authenticated !== undefined) authenticatedFlag = opts.authenticated;
  if (opts.locked !== undefined) lockedFlag = opts.locked;
}

/** 启动自动同步，重复调用是幂等的 */
export function startWidgetAutoSync(): void {
  if (unsubscribe) return;
  unsubscribe = store.subscribe(() => {
    const current = store.getState().bbtalk.bbtalks;
    if (current !== lastBBTalksRef) {
      lastBBTalksRef = current;
      scheduleSync();
    }
  });
  // 初始化时也 sync 一次，填充 widget-data.json
  scheduleSync();
}

/** 停止订阅（主要用于测试） */
export function stopWidgetAutoSync(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  lastBBTalksRef = undefined;
}
