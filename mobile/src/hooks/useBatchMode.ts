import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { bbtalkApi } from '../services/api/bbtalkApi';
import { useAppDispatch } from '../store/hooks';
import { optimisticDelete } from '../store/slices/bbtalkSlice';
import { logError } from '../utils/errorHandler';

interface UseBatchModeOptions {
  showError: (title: string, msg: string) => void;
  onComplete: () => void;
}

interface UseBatchModeReturn {
  batchMode: boolean;
  selectedIds: Set<string>;
  isExecuting: boolean;
  progress: { done: number; total: number } | null;
  enterBatchMode: (initialId: string) => void;
  exitBatchMode: () => void;
  toggleSelect: (id: string) => void;
  selectAll: (allIds: string[]) => void;
  batchDelete: (ids: string[]) => Promise<void>;
  batchUpdateTags: (ids: string[], tagNames: string[]) => Promise<void>;
  batchUpdateVisibility: (ids: string[], visibility: 'public' | 'private' | 'friends') => Promise<void>;
}

export function useBatchMode({ showError, onComplete }: UseBatchModeOptions): UseBatchModeReturn {
  const dispatch = useAppDispatch();
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isExecuting, setIsExecuting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const enterBatchMode = useCallback((initialId: string) => {
    setBatchMode(true);
    setSelectedIds(new Set([initialId]));
  }, []);

  const exitBatchMode = useCallback(() => {
    setBatchMode(false);
    setSelectedIds(new Set());
    setIsExecuting(false);
    setProgress(null);
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((allIds: string[]) => {
    setSelectedIds(new Set(allIds));
  }, []);

  const batchDelete = useCallback(async (ids: string[]) => {
    return new Promise<void>((resolve) => {
      Alert.alert(
        '批量删除',
        `确定删除选中的 ${ids.length} 条碎碎念？此操作不可撤销。`,
        [
          { text: '取消', style: 'cancel', onPress: () => resolve() },
          {
            text: '删除',
            style: 'destructive',
            onPress: async () => {
              setIsExecuting(true);
              setProgress({ done: 0, total: ids.length });
              let failed = 0;
              const errors: string[] = [];

              for (let i = 0; i < ids.length; i++) {
                setProgress({ done: i + 1, total: ids.length });
                try {
                  await bbtalkApi.deleteBBTalk(ids[i]);
                  dispatch(optimisticDelete(ids[i]));
                } catch (e: any) {
                  failed++;
                  errors.push(e.message || '未知错误');
                  logError(e, `batchDelete ${ids[i]}`);
                }
              }

              setIsExecuting(false);
              setProgress(null);

              if (failed > 0) {
                showError('部分操作失败', `${ids.length} 条中有 ${failed} 条删除失败：${errors[0]}`);
              }

              exitBatchMode();
              onComplete();
              resolve();
            },
          },
        ],
      );
    });
  }, [dispatch, showError, onComplete, exitBatchMode]);

  const batchUpdateTags = useCallback(async (ids: string[], tagNames: string[]) => {
    setIsExecuting(true);
    setProgress({ done: 0, total: ids.length });
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < ids.length; i++) {
      setProgress({ done: i + 1, total: ids.length });
      try {
        await bbtalkApi.updateBBTalk(ids[i], {
          tags: tagNames.map(name => ({ id: '', name, color: '' })),
        });
      } catch (e: any) {
        failed++;
        errors.push(e.message || '未知错误');
        logError(e, `batchUpdateTags ${ids[i]}`);
      }
    }

    setIsExecuting(false);
    setProgress(null);

    if (failed > 0) {
      showError('部分操作失败', `${ids.length} 条中有 ${failed} 条标签更新失败：${errors[0]}`);
    }

    exitBatchMode();
    onComplete();
  }, [showError, onComplete, exitBatchMode]);

  const batchUpdateVisibility = useCallback(async (ids: string[], visibility: 'public' | 'private' | 'friends') => {
    setIsExecuting(true);
    setProgress({ done: 0, total: ids.length });
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < ids.length; i++) {
      setProgress({ done: i + 1, total: ids.length });
      try {
        await bbtalkApi.updateBBTalk(ids[i], { visibility });
      } catch (e: any) {
        failed++;
        errors.push(e.message || '未知错误');
        logError(e, `batchUpdateVisibility ${ids[i]}`);
      }
    }

    setIsExecuting(false);
    setProgress(null);

    if (failed > 0) {
      showError('部分操作失败', `${ids.length} 条中有 ${failed} 条可见性更新失败：${errors[0]}`);
    }

    exitBatchMode();
    onComplete();
  }, [showError, onComplete, exitBatchMode]);

  return {
    batchMode,
    selectedIds,
    isExecuting,
    progress,
    enterBatchMode,
    exitBatchMode,
    toggleSelect,
    selectAll,
    batchDelete,
    batchUpdateTags,
    batchUpdateVisibility,
  };
}
