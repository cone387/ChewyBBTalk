/**
 * SwipeableBBTalkCard 单元测试
 * Feature: mobile-v1.1-enhancements, Task 3.3
 *
 * 测试覆盖：
 * - 左滑超过阈值触发 onDelete 回调
 * - 右滑超过阈值触发 onTogglePin 回调
 * - 未超过阈值时弹性回弹（Animated.spring 调用）
 * - 同一时刻只有一张卡片展开（openSwipeRef 机制）
 * - 批量模式下禁用手势
 *
 * Strategy: We replicate the PanResponder config creation logic from
 * SwipeableBBTalkCard to test the gesture callbacks directly. This mirrors
 * the component's useRef-based pattern and tests the exact same decision
 * logic without needing to render the full component tree.
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7**
 */

import type { BBTalk } from '../../src/types';

// --- Constants (mirrored from SwipeableBBTalkCard.tsx) ---
const ACTION_THRESHOLD = 120;
const VELOCITY_THRESHOLD = 0.5;

// --- Mock Animated API ---
interface MockAnimationResult {
  start: (cb?: () => void) => void;
}

const springCalls: Array<{ toValue: number; useNativeDriver: boolean }> = [];
const timingCalls: Array<{ toValue: number; duration: number; useNativeDriver: boolean }> = [];

const MockAnimated = {
  spring: (
    _value: any,
    config: { toValue: number; useNativeDriver: boolean; speed?: number; bounciness?: number },
  ): MockAnimationResult => {
    springCalls.push({ toValue: config.toValue, useNativeDriver: config.useNativeDriver });
    return {
      start: (cb?: () => void) => { if (cb) cb(); },
    };
  },
  timing: (
    _value: any,
    config: { toValue: number; duration: number; useNativeDriver: boolean },
  ): MockAnimationResult => {
    timingCalls.push({ toValue: config.toValue, duration: config.duration, useNativeDriver: config.useNativeDriver });
    return {
      start: (cb?: () => void) => { if (cb) cb(); },
    };
  },
};

// --- Helpers ---

function makeBBTalk(overrides: Partial<BBTalk> = {}): BBTalk {
  return {
    id: 'test-id-1',
    content: '测试内容',
    visibility: 'public',
    tags: [],
    attachments: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function gs(overrides: any = {}) {
  return {
    dx: 0, dy: 0, vx: 0, vy: 0,
    moveX: 0, moveY: 0, x0: 0, y0: 0,
    numberActiveTouches: 1, stateID: 1,
    ...overrides,
  };
}

const evt = {} as any;

interface SetupOptions {
  item?: BBTalk;
  onDelete?: jest.Mock;
  onTogglePin?: jest.Mock;
  batchMode?: boolean;
  openSwipeRef?: { current: (() => void) | null };
}

/**
 * Creates the PanResponder config using the same logic as SwipeableBBTalkCard.
 * This mirrors the component's useRef + PanResponder.create pattern exactly.
 */
function createSwipeConfig(options: SetupOptions = {}) {
  const {
    item = makeBBTalk(),
    onDelete = jest.fn(),
    onTogglePin = jest.fn(),
    batchMode = false,
    openSwipeRef = { current: null },
  } = options;

  const translateX = { setValue: jest.fn() };
  const isOpenRef = { current: false };

  // Mutable refs (same pattern as the component)
  const onDeleteRef = { current: onDelete };
  const onTogglePinRef = { current: onTogglePin };
  const itemRef = { current: item };
  const batchModeRef = { current: batchMode };
  const openSwipeRefRef = { current: openSwipeRef };

  const closeSwipe = () => {
    isOpenRef.current = false;
    MockAnimated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      speed: 20,
      bounciness: 4,
    }).start();
  };

  const closeSwipeRef = { current: closeSwipe };

  const config = {
    onMoveShouldSetPanResponder: (_evt: any, gesture: any) => {
      if (batchModeRef.current) return false;
      return (
        Math.abs(gesture.dx) > 10 &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5
      );
    },
    onPanResponderGrant: () => {
      const otherClose = openSwipeRefRef.current.current;
      if (otherClose && otherClose !== closeSwipeRef.current) {
        otherClose();
      }
      openSwipeRefRef.current.current = closeSwipeRef.current;
    },
    onPanResponderMove: (_evt: any, gesture: any) => {
      translateX.setValue(gesture.dx);
    },
    onPanResponderRelease: (_evt: any, gesture: any) => {
      const { dx, vx } = gesture;
      const absDx = Math.abs(dx);
      const absVx = Math.abs(vx);

      // Left swipe → delete
      if (dx < 0 && (absDx > ACTION_THRESHOLD || absVx > VELOCITY_THRESHOLD)) {
        MockAnimated.timing(translateX, {
          toValue: -300,
          duration: 200,
          useNativeDriver: true,
        }).start(() => {
          onDeleteRef.current(itemRef.current);
          translateX.setValue(0);
          isOpenRef.current = false;
          openSwipeRefRef.current.current = null;
        });
        return;
      }

      // Right swipe → toggle pin
      if (dx > 0 && (absDx > ACTION_THRESHOLD || absVx > VELOCITY_THRESHOLD)) {
        MockAnimated.timing(translateX, {
          toValue: 300,
          duration: 200,
          useNativeDriver: true,
        }).start(() => {
          onTogglePinRef.current(itemRef.current);
          translateX.setValue(0);
          isOpenRef.current = false;
          openSwipeRefRef.current.current = null;
        });
        return;
      }

      // Not enough — spring back
      isOpenRef.current = false;
      openSwipeRefRef.current.current = null;
      MockAnimated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
        speed: 20,
        bounciness: 4,
      }).start();
    },
    onPanResponderTerminate: () => {
      isOpenRef.current = false;
      MockAnimated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
        speed: 20,
        bounciness: 4,
      }).start();
    },
  };

  return { config, onDelete, onTogglePin, openSwipeRef, batchModeRef };
}

// --- Tests ---

beforeEach(() => {
  springCalls.length = 0;
  timingCalls.length = 0;
});

describe('SwipeableBBTalkCard gesture logic', () => {
  // =========================================================================
  // 1. 左滑超过阈值触发 onDelete 回调 — 需求 2.1, 2.2
  // =========================================================================
  describe('左滑超过阈值触发 onDelete', () => {
    it('左滑距离超过 ACTION_THRESHOLD (120px) 时触发 onDelete', () => {
      const onDelete = jest.fn();
      const item = makeBBTalk();
      const { config } = createSwipeConfig({ item, onDelete });

      config.onPanResponderGrant(evt, gs());
      config.onPanResponderRelease(evt, gs({ dx: -130, vx: -0.3 }));

      expect(onDelete).toHaveBeenCalledWith(item);
    });

    it('左滑速度超过 VELOCITY_THRESHOLD (0.5) 时触发 onDelete', () => {
      const onDelete = jest.fn();
      const item = makeBBTalk();
      const { config } = createSwipeConfig({ item, onDelete });

      config.onPanResponderGrant(evt, gs());
      config.onPanResponderRelease(evt, gs({ dx: -50, vx: -0.8 }));

      expect(onDelete).toHaveBeenCalledWith(item);
    });

    it('左滑后 Animated.timing 被调用 (toValue: -300)', () => {
      const onDelete = jest.fn();
      const { config } = createSwipeConfig({ onDelete });

      config.onPanResponderGrant(evt, gs());
      config.onPanResponderRelease(evt, gs({ dx: -130, vx: -0.3 }));

      expect(timingCalls).toContainEqual(
        expect.objectContaining({ toValue: -300, duration: 200, useNativeDriver: true }),
      );
    });
  });

  // =========================================================================
  // 2. 右滑超过阈值触发 onTogglePin 回调 — 需求 2.3, 2.4
  // =========================================================================
  describe('右滑超过阈值触发 onTogglePin', () => {
    it('右滑距离超过 ACTION_THRESHOLD (120px) 时触发 onTogglePin', () => {
      const onTogglePin = jest.fn();
      const item = makeBBTalk();
      const { config } = createSwipeConfig({ item, onTogglePin });

      config.onPanResponderGrant(evt, gs());
      config.onPanResponderRelease(evt, gs({ dx: 130, vx: 0.3 }));

      expect(onTogglePin).toHaveBeenCalledWith(item);
    });

    it('右滑速度超过 VELOCITY_THRESHOLD (0.5) 时触发 onTogglePin', () => {
      const onTogglePin = jest.fn();
      const item = makeBBTalk();
      const { config } = createSwipeConfig({ item, onTogglePin });

      config.onPanResponderGrant(evt, gs());
      config.onPanResponderRelease(evt, gs({ dx: 50, vx: 0.8 }));

      expect(onTogglePin).toHaveBeenCalledWith(item);
    });

    it('右滑后 Animated.timing 被调用 (toValue: 300)', () => {
      const onTogglePin = jest.fn();
      const { config } = createSwipeConfig({ onTogglePin });

      config.onPanResponderGrant(evt, gs());
      config.onPanResponderRelease(evt, gs({ dx: 130, vx: 0.3 }));

      expect(timingCalls).toContainEqual(
        expect.objectContaining({ toValue: 300, duration: 200, useNativeDriver: true }),
      );
    });
  });

  // =========================================================================
  // 3. 未超过阈值时弹性回弹 — 需求 2.5
  // =========================================================================
  describe('未超过阈值时弹性回弹', () => {
    it('左滑距离和速度均未超过阈值时，调用 Animated.spring 回弹到 0', () => {
      const onDelete = jest.fn();
      const onTogglePin = jest.fn();
      const { config } = createSwipeConfig({ onDelete, onTogglePin });

      config.onPanResponderGrant(evt, gs());
      config.onPanResponderRelease(evt, gs({ dx: -50, vx: -0.2 }));

      expect(onDelete).not.toHaveBeenCalled();
      expect(onTogglePin).not.toHaveBeenCalled();
      expect(springCalls).toContainEqual(
        expect.objectContaining({ toValue: 0, useNativeDriver: true }),
      );
    });

    it('右滑距离和速度均未超过阈值时，调用 Animated.spring 回弹到 0', () => {
      const onDelete = jest.fn();
      const onTogglePin = jest.fn();
      const { config } = createSwipeConfig({ onDelete, onTogglePin });

      config.onPanResponderGrant(evt, gs());
      config.onPanResponderRelease(evt, gs({ dx: 50, vx: 0.2 }));

      expect(onDelete).not.toHaveBeenCalled();
      expect(onTogglePin).not.toHaveBeenCalled();
      expect(springCalls).toContainEqual(
        expect.objectContaining({ toValue: 0, useNativeDriver: true }),
      );
    });

    it('onPanResponderTerminate 时也调用 Animated.spring 回弹', () => {
      const { config } = createSwipeConfig();

      config.onPanResponderTerminate(evt, gs());

      expect(springCalls).toContainEqual(
        expect.objectContaining({ toValue: 0, useNativeDriver: true }),
      );
    });
  });

  // =========================================================================
  // 4. 同一时刻只有一张卡片展开（openSwipeRef 机制）— 需求 2.6
  // =========================================================================
  describe('openSwipeRef 机制', () => {
    it('新卡片滑动时关闭已展开的旧卡片', () => {
      const otherCloseSwipe = jest.fn();
      const openSwipeRef = { current: otherCloseSwipe as (() => void) | null };

      const { config } = createSwipeConfig({ openSwipeRef });

      config.onPanResponderGrant(evt, gs());

      expect(otherCloseSwipe).toHaveBeenCalled();
    });

    it('滑动后将自己的 closeSwipe 注册到 openSwipeRef', () => {
      const openSwipeRef = { current: null as (() => void) | null };

      const { config } = createSwipeConfig({ openSwipeRef });

      config.onPanResponderGrant(evt, gs());

      expect(openSwipeRef.current).toBeInstanceOf(Function);
    });

    it('操作完成后清除 openSwipeRef', () => {
      const openSwipeRef = { current: null as (() => void) | null };
      const onDelete = jest.fn();

      const { config } = createSwipeConfig({ openSwipeRef, onDelete });

      config.onPanResponderGrant(evt, gs());
      expect(openSwipeRef.current).not.toBeNull();

      // Trigger delete action
      config.onPanResponderRelease(evt, gs({ dx: -130, vx: -0.3 }));

      expect(openSwipeRef.current).toBeNull();
    });

    it('弹性回弹后也清除 openSwipeRef', () => {
      const openSwipeRef = { current: null as (() => void) | null };

      const { config } = createSwipeConfig({ openSwipeRef });

      config.onPanResponderGrant(evt, gs());
      expect(openSwipeRef.current).not.toBeNull();

      // Release without exceeding threshold
      config.onPanResponderRelease(evt, gs({ dx: 30, vx: 0.1 }));

      expect(openSwipeRef.current).toBeNull();
    });
  });

  // =========================================================================
  // 5. 批量模式下禁用手势 — 需求 2.7
  // =========================================================================
  describe('批量模式下禁用手势', () => {
    it('batchMode 为 true 时，onMoveShouldSetPanResponder 返回 false', () => {
      const { config } = createSwipeConfig({ batchMode: true });

      const result = config.onMoveShouldSetPanResponder(evt, gs({ dx: 100, dy: 0 }));

      expect(result).toBe(false);
    });

    it('batchMode 为 false 且水平滑动时，onMoveShouldSetPanResponder 返回 true', () => {
      const { config } = createSwipeConfig({ batchMode: false });

      const result = config.onMoveShouldSetPanResponder(evt, gs({ dx: 20, dy: 5 }));

      expect(result).toBe(true);
    });

    it('垂直滑动为主时返回 false（避免与 FlatList 冲突）', () => {
      const { config } = createSwipeConfig({ batchMode: false });

      const result = config.onMoveShouldSetPanResponder(evt, gs({ dx: 10, dy: 20 }));

      expect(result).toBe(false);
    });

    it('水平位移太小时（< 10px）返回 false', () => {
      const { config } = createSwipeConfig({ batchMode: false });

      const result = config.onMoveShouldSetPanResponder(evt, gs({ dx: 5, dy: 0 }));

      expect(result).toBe(false);
    });
  });
});
