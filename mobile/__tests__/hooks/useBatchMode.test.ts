/**
 * useBatchMode Hook 单元测试
 *
 * 测试批量操作模式的核心状态管理逻辑：
 * - enterBatchMode / exitBatchMode
 * - toggleSelect / selectAll
 * - batchDelete / batchUpdateTags / batchUpdateVisibility
 *
 * **Validates: Requirements 4.1, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10**
 */

jest.mock('react-native', () => ({
  Alert: {
    alert: jest.fn(),
  },
}));

jest.mock('../../src/services/api/bbtalkApi', () => ({
  bbtalkApi: {
    deleteBBTalk: jest.fn(),
    updateBBTalk: jest.fn(),
  },
}));

jest.mock('../../src/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: jest.fn(),
}));

jest.mock('../../src/store/slices/bbtalkSlice', () => ({
  optimisticDelete: jest.fn((id: string) => ({ type: 'bbtalk/optimisticDelete', payload: id })),
}));

jest.mock('../../src/utils/errorHandler', () => ({
  logError: jest.fn(),
}));

import { renderHook, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { useBatchMode } from '../../src/hooks/useBatchMode';
import { bbtalkApi } from '../../src/services/api/bbtalkApi';

const mockShowError = jest.fn();
const mockOnComplete = jest.fn();

function renderUseBatchMode() {
  return renderHook(() =>
    useBatchMode({ showError: mockShowError, onComplete: mockOnComplete }),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useBatchMode', () => {
  describe('enterBatchMode', () => {
    it('should activate batch mode and select the initial id', () => {
      const { result } = renderUseBatchMode();

      expect(result.current.batchMode).toBe(false);
      expect(result.current.selectedIds.size).toBe(0);

      act(() => {
        result.current.enterBatchMode('abc-123');
      });

      expect(result.current.batchMode).toBe(true);
      expect(result.current.selectedIds.has('abc-123')).toBe(true);
      expect(result.current.selectedIds.size).toBe(1);
    });
  });

  describe('exitBatchMode', () => {
    it('should deactivate batch mode and clear all selected ids', () => {
      const { result } = renderUseBatchMode();

      act(() => {
        result.current.enterBatchMode('abc-123');
      });
      expect(result.current.batchMode).toBe(true);

      act(() => {
        result.current.exitBatchMode();
      });

      expect(result.current.batchMode).toBe(false);
      expect(result.current.selectedIds.size).toBe(0);
      expect(result.current.isExecuting).toBe(false);
      expect(result.current.progress).toBeNull();
    });
  });

  describe('toggleSelect', () => {
    it('should add an id when not selected', () => {
      const { result } = renderUseBatchMode();

      act(() => {
        result.current.enterBatchMode('id-1');
      });

      act(() => {
        result.current.toggleSelect('id-2');
      });

      expect(result.current.selectedIds.has('id-1')).toBe(true);
      expect(result.current.selectedIds.has('id-2')).toBe(true);
      expect(result.current.selectedIds.size).toBe(2);
    });

    it('should remove an id when already selected', () => {
      const { result } = renderUseBatchMode();

      act(() => {
        result.current.enterBatchMode('id-1');
      });

      act(() => {
        result.current.toggleSelect('id-1');
      });

      expect(result.current.selectedIds.has('id-1')).toBe(false);
      expect(result.current.selectedIds.size).toBe(0);
    });
  });

  describe('selectAll', () => {
    it('should select all provided ids', () => {
      const { result } = renderUseBatchMode();
      const allIds = ['id-1', 'id-2', 'id-3', 'id-4'];

      act(() => {
        result.current.enterBatchMode('id-1');
      });

      act(() => {
        result.current.selectAll(allIds);
      });

      expect(result.current.selectedIds.size).toBe(4);
      for (const id of allIds) {
        expect(result.current.selectedIds.has(id)).toBe(true);
      }
    });
  });

  describe('batchDelete', () => {
    it('should show confirmation dialog before deleting', async () => {
      const { result } = renderUseBatchMode();

      act(() => {
        result.current.enterBatchMode('id-1');
      });

      await act(async () => {
        result.current.batchDelete(['id-1', 'id-2']);
      });

      expect(Alert.alert).toHaveBeenCalledWith(
        '批量删除',
        expect.stringContaining('2 条'),
        expect.any(Array),
      );
    });

    it('should delete items when confirmed and call onComplete', async () => {
      (bbtalkApi.deleteBBTalk as jest.Mock).mockResolvedValue(undefined);

      // Capture the Alert callback to simulate user pressing "删除"
      (Alert.alert as jest.Mock).mockImplementation((_title, _msg, buttons) => {
        const deleteBtn = buttons?.find((b: any) => b.text === '删除');
        deleteBtn?.onPress?.();
      });

      const { result } = renderUseBatchMode();

      act(() => {
        result.current.enterBatchMode('id-1');
      });

      await act(async () => {
        await result.current.batchDelete(['id-1', 'id-2']);
      });

      expect(bbtalkApi.deleteBBTalk).toHaveBeenCalledTimes(2);
      expect(bbtalkApi.deleteBBTalk).toHaveBeenCalledWith('id-1');
      expect(bbtalkApi.deleteBBTalk).toHaveBeenCalledWith('id-2');
      expect(mockOnComplete).toHaveBeenCalled();
      // Should exit batch mode after completion
      expect(result.current.batchMode).toBe(false);
    });

    it('should report failures when some deletes fail', async () => {
      (bbtalkApi.deleteBBTalk as jest.Mock)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('网络错误'));

      (Alert.alert as jest.Mock).mockImplementation((_title, _msg, buttons) => {
        const deleteBtn = buttons?.find((b: any) => b.text === '删除');
        deleteBtn?.onPress?.();
      });

      const { result } = renderUseBatchMode();

      act(() => {
        result.current.enterBatchMode('id-1');
      });

      await act(async () => {
        await result.current.batchDelete(['id-1', 'id-2']);
      });

      expect(mockShowError).toHaveBeenCalledWith(
        '部分操作失败',
        expect.stringContaining('1 条删除失败'),
      );
    });

    it('should resolve without action when user cancels', async () => {
      (Alert.alert as jest.Mock).mockImplementation((_title, _msg, buttons) => {
        const cancelBtn = buttons?.find((b: any) => b.text === '取消');
        cancelBtn?.onPress?.();
      });

      const { result } = renderUseBatchMode();

      act(() => {
        result.current.enterBatchMode('id-1');
      });

      await act(async () => {
        await result.current.batchDelete(['id-1']);
      });

      expect(bbtalkApi.deleteBBTalk).not.toHaveBeenCalled();
      // Batch mode should still be active since user cancelled
      expect(result.current.batchMode).toBe(true);
    });
  });

  describe('batchUpdateTags', () => {
    it('should update tags for all provided ids', async () => {
      (bbtalkApi.updateBBTalk as jest.Mock).mockResolvedValue({});

      const { result } = renderUseBatchMode();

      act(() => {
        result.current.enterBatchMode('id-1');
      });

      await act(async () => {
        await result.current.batchUpdateTags(['id-1', 'id-2'], ['日记', '旅行']);
      });

      expect(bbtalkApi.updateBBTalk).toHaveBeenCalledTimes(2);
      expect(bbtalkApi.updateBBTalk).toHaveBeenCalledWith('id-1', {
        tags: [
          { id: '', name: '日记', color: '' },
          { id: '', name: '旅行', color: '' },
        ],
      });
      expect(mockOnComplete).toHaveBeenCalled();
      expect(result.current.batchMode).toBe(false);
    });

    it('should report failures when some updates fail', async () => {
      (bbtalkApi.updateBBTalk as jest.Mock)
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('服务器错误'));

      const { result } = renderUseBatchMode();

      act(() => {
        result.current.enterBatchMode('id-1');
      });

      await act(async () => {
        await result.current.batchUpdateTags(['id-1', 'id-2'], ['日记']);
      });

      expect(mockShowError).toHaveBeenCalledWith(
        '部分操作失败',
        expect.stringContaining('1 条标签更新失败'),
      );
    });
  });

  describe('batchUpdateVisibility', () => {
    it('should update visibility for all provided ids', async () => {
      (bbtalkApi.updateBBTalk as jest.Mock).mockResolvedValue({});

      const { result } = renderUseBatchMode();

      act(() => {
        result.current.enterBatchMode('id-1');
      });

      await act(async () => {
        await result.current.batchUpdateVisibility(['id-1', 'id-2', 'id-3'], 'public');
      });

      expect(bbtalkApi.updateBBTalk).toHaveBeenCalledTimes(3);
      expect(bbtalkApi.updateBBTalk).toHaveBeenCalledWith('id-1', { visibility: 'public' });
      expect(bbtalkApi.updateBBTalk).toHaveBeenCalledWith('id-2', { visibility: 'public' });
      expect(bbtalkApi.updateBBTalk).toHaveBeenCalledWith('id-3', { visibility: 'public' });
      expect(mockOnComplete).toHaveBeenCalled();
      expect(result.current.batchMode).toBe(false);
    });

    it('should report failures when some updates fail', async () => {
      (bbtalkApi.updateBBTalk as jest.Mock)
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('网络错误'))
        .mockResolvedValueOnce({});

      const { result } = renderUseBatchMode();

      act(() => {
        result.current.enterBatchMode('id-1');
      });

      await act(async () => {
        await result.current.batchUpdateVisibility(['id-1', 'id-2', 'id-3'], 'private');
      });

      expect(mockShowError).toHaveBeenCalledWith(
        '部分操作失败',
        expect.stringContaining('1 条可见性更新失败'),
      );
    });
  });

  describe('isExecuting and progress state', () => {
    it('should reset isExecuting and progress after operation completes', async () => {
      (bbtalkApi.updateBBTalk as jest.Mock).mockResolvedValue({});

      const { result } = renderUseBatchMode();

      act(() => {
        result.current.enterBatchMode('id-1');
      });

      await act(async () => {
        await result.current.batchUpdateVisibility(['id-1'], 'public');
      });

      expect(result.current.isExecuting).toBe(false);
      expect(result.current.progress).toBeNull();
    });
  });
});


// ---------------------------------------------------------------------------
// Property Tests — Properties 4, 5, 6
// Feature: mobile-v1.1-enhancements
// ---------------------------------------------------------------------------

import * as fc from 'fast-check';

// --- Generators ---

/** 生成随机 id 字符串（UUID 格式） */
const arbId: fc.Arbitrary<string> = fc.uuid();

/** 生成非空且无重复的 id 列表（1-100 个） */
const arbUniqueIdList: fc.Arbitrary<string[]> = fc
  .uniqueArray(arbId, { minLength: 1, maxLength: 100 })
  .filter(arr => arr.length > 0);

// --- Property 4: 全选操作正确性 ---
// **Validates: Requirements 4.4**

describe('useBatchMode - Property 4: 全选操作正确性', () => {
  it('selectAll 后 selectedIds 应包含列表中的每一个 id，且 size 等于列表长度', () => {
    fc.assert(
      fc.property(arbUniqueIdList, (allIds) => {
        const { result } = renderUseBatchMode();

        // Enter batch mode first (required to be in batch mode)
        act(() => {
          result.current.enterBatchMode(allIds[0]);
        });

        // Execute selectAll
        act(() => {
          result.current.selectAll(allIds);
        });

        // Verify every id is in selectedIds
        for (const id of allIds) {
          expect(result.current.selectedIds.has(id)).toBe(true);
        }

        // Verify size matches
        expect(result.current.selectedIds.size).toBe(allIds.length);
      }),
      { numRuns: 100 },
    );
  });

  it('selectAll 应覆盖之前的选中状态', () => {
    fc.assert(
      fc.property(
        arbUniqueIdList,
        arbUniqueIdList,
        (firstIds, secondIds) => {
          const { result } = renderUseBatchMode();

          act(() => {
            result.current.enterBatchMode(firstIds[0]);
          });

          // Select first set
          act(() => {
            result.current.selectAll(firstIds);
          });

          // Select second set (should replace)
          act(() => {
            result.current.selectAll(secondIds);
          });

          // Only second set should be selected
          expect(result.current.selectedIds.size).toBe(secondIds.length);
          for (const id of secondIds) {
            expect(result.current.selectedIds.has(id)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// --- Property 5: 退出批量模式清空状态 ---
// **Validates: Requirements 4.8**

describe('useBatchMode - Property 5: 退出批量模式清空状态', () => {
  it('exitBatchMode 后 batchMode 应为 false，selectedIds 应为空', () => {
    fc.assert(
      fc.property(arbUniqueIdList, (selectedIds) => {
        const { result } = renderUseBatchMode();

        // Enter batch mode and select some ids
        act(() => {
          result.current.enterBatchMode(selectedIds[0]);
        });

        if (selectedIds.length > 1) {
          act(() => {
            result.current.selectAll(selectedIds);
          });
        }

        // Verify we are in batch mode with selections
        expect(result.current.batchMode).toBe(true);
        expect(result.current.selectedIds.size).toBeGreaterThan(0);

        // Exit batch mode
        act(() => {
          result.current.exitBatchMode();
        });

        // Verify state is fully cleared
        expect(result.current.batchMode).toBe(false);
        expect(result.current.selectedIds.size).toBe(0);
        expect(result.current.isExecuting).toBe(false);
        expect(result.current.progress).toBeNull();
      }),
      { numRuns: 100 },
    );
  });
});

// --- Property 6: 批量操作失败汇总正确性 ---
// **Validates: Requirements 4.9**

describe('useBatchMode - Property 6: 批量操作失败汇总正确性', () => {
  it('batchUpdateTags 中失败数量应等于实际 API 失败次数', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate N ids (1-20) and M failures (0 to N)
        fc.integer({ min: 1, max: 20 }).chain(n =>
          fc.tuple(
            fc.constant(n),
            fc.integer({ min: 0, max: n }),
          ),
        ),
        async ([totalCount, failCount]) => {
          // Reset mocks for each property run
          mockShowError.mockClear();
          (bbtalkApi.updateBBTalk as jest.Mock).mockReset();
          mockOnComplete.mockClear();

          // Generate ids
          const ids = Array.from({ length: totalCount }, (_, i) => `prop6-tag-${i}`);

          // Create a set of indices that should fail
          const failIndices = new Set<number>();
          for (let i = 0; i < failCount; i++) {
            failIndices.add(i);
          }

          // Configure mock: fail for failIndices, succeed for others
          (bbtalkApi.updateBBTalk as jest.Mock).mockImplementation(
            (id: string) => {
              const idx = ids.indexOf(id);
              if (failIndices.has(idx)) {
                return Promise.reject(new Error(`模拟失败 ${id}`));
              }
              return Promise.resolve({});
            },
          );

          const { result } = renderUseBatchMode();

          act(() => {
            result.current.enterBatchMode(ids[0]);
          });

          // Execute batch update tags with proper act wrapping
          await act(async () => {
            await result.current.batchUpdateTags(ids, ['测试标签']);
          });

          if (failCount > 0) {
            // showError should be called with correct failure count
            expect(mockShowError).toHaveBeenCalledTimes(1);
            const errorMsg = mockShowError.mock.calls[0][1] as string;
            expect(errorMsg).toContain(`${failCount} 条标签更新失败`);
          } else {
            // No failures, showError should not be called
            expect(mockShowError).not.toHaveBeenCalled();
          }

          // Total API calls should equal totalCount
          expect(bbtalkApi.updateBBTalk).toHaveBeenCalledTimes(totalCount);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('batchUpdateVisibility 中失败数量应等于实际 API 失败次数', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 20 }).chain(n =>
          fc.tuple(
            fc.constant(n),
            fc.integer({ min: 0, max: n }),
          ),
        ),
        async ([totalCount, failCount]) => {
          mockShowError.mockClear();
          (bbtalkApi.updateBBTalk as jest.Mock).mockReset();
          mockOnComplete.mockClear();

          const ids = Array.from({ length: totalCount }, (_, i) => `prop6-vis-${i}`);

          const failIndices = new Set<number>();
          for (let i = 0; i < failCount; i++) {
            failIndices.add(i);
          }

          (bbtalkApi.updateBBTalk as jest.Mock).mockImplementation(
            (id: string) => {
              const idx = ids.indexOf(id);
              if (failIndices.has(idx)) {
                return Promise.reject(new Error(`模拟失败 ${id}`));
              }
              return Promise.resolve({});
            },
          );

          const { result } = renderUseBatchMode();

          act(() => {
            result.current.enterBatchMode(ids[0]);
          });

          await act(async () => {
            await result.current.batchUpdateVisibility(ids, 'private');
          });

          if (failCount > 0) {
            expect(mockShowError).toHaveBeenCalledTimes(1);
            const errorMsg = mockShowError.mock.calls[0][1] as string;
            expect(errorMsg).toContain(`${failCount} 条可见性更新失败`);
          } else {
            expect(mockShowError).not.toHaveBeenCalled();
          }

          expect(bbtalkApi.updateBBTalk).toHaveBeenCalledTimes(totalCount);
        },
      ),
      { numRuns: 100 },
    );
  });
});
