import React, { useRef, useMemo } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  StyleSheet,
  View,
} from 'react-native';
import { Image } from 'expo-image';

interface ImageViewerProps {
  imageUrl: string;
  onClose: () => void;
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const DOUBLE_TAP_DELAY = 300;
const CLOSE_THRESHOLD = 100;
const ZOOM_SCALE = 2.5;

/**
 * ImageViewer — 全屏图片查看器。
 * 使用 PanResponder + Animated 实现：
 * - 双指捏合缩放（pinch-to-zoom）
 * - 双击缩放 / 还原
 * - 缩放状态下单指拖动平移
 * - 未缩放状态下向下滑动关闭
 */
export default function ImageViewer({ imageUrl, onClose }: ImageViewerProps) {
  // --- Animated values ---
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  // --- Mutable refs for gesture tracking ---
  const baseScale = useRef(1);
  const baseTranslateX = useRef(0);
  const baseTranslateY = useRef(0);
  const pinchStartDistance = useRef(0);
  const lastTapTime = useRef(0);
  const isZoomed = useRef(false);

  /** Calculate distance between two touches */
  const getDistance = (touches: { pageX: number; pageY: number }[]) => {
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  /** Animate back to initial (unzoomed) state */
  const resetTransform = () => {
    isZoomed.current = false;
    baseScale.current = 1;
    baseTranslateX.current = 0;
    baseTranslateY.current = 0;
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 7 }).start();
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 7 }).start();
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 7 }).start();
  };

  /** Animate to zoomed-in state (double-tap) */
  const zoomIn = () => {
    isZoomed.current = true;
    baseScale.current = ZOOM_SCALE;
    Animated.spring(scale, { toValue: ZOOM_SCALE, useNativeDriver: true, friction: 7 }).start();
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,

        onPanResponderGrant: (evt) => {
          const touches = evt.nativeEvent.touches;

          // --- Double-tap detection (single finger only) ---
          if (touches.length === 1) {
            const now = Date.now();
            if (now - lastTapTime.current < DOUBLE_TAP_DELAY) {
              // Toggle zoom
              if (isZoomed.current) {
                resetTransform();
              } else {
                zoomIn();
              }
              lastTapTime.current = 0;
              return;
            }
            lastTapTime.current = now;
          }

          // --- Pinch start ---
          if (touches.length === 2) {
            pinchStartDistance.current = getDistance(touches as any);
          }
        },

        onPanResponderMove: (evt, gestureState) => {
          const touches = evt.nativeEvent.touches;

          // --- Pinch-to-zoom (two fingers) ---
          if (touches.length === 2 && pinchStartDistance.current > 0) {
            const currentDistance = getDistance(touches as any);
            const pinchScale = currentDistance / pinchStartDistance.current;
            const newScale = Math.max(0.5, Math.min(5, baseScale.current * pinchScale));
            scale.setValue(newScale);
            return;
          }

          // --- Single finger gestures ---
          if (touches.length === 1) {
            if (isZoomed.current) {
              // Pan while zoomed
              translateX.setValue(baseTranslateX.current + gestureState.dx);
              translateY.setValue(baseTranslateY.current + gestureState.dy);
            } else {
              // Drag down to close (only when not zoomed)
              if (gestureState.dy > 0) {
                translateY.setValue(gestureState.dy);
              }
            }
          }
        },

        onPanResponderRelease: (evt, gestureState) => {
          const touches = evt.nativeEvent.touches;

          // --- End of pinch ---
          if (pinchStartDistance.current > 0) {
            // Read the current animated scale value
            const currentScaleValue = (scale as any).__getValue();
            if (currentScaleValue <= 1.05) {
              resetTransform();
            } else {
              baseScale.current = currentScaleValue;
              isZoomed.current = true;
            }
            pinchStartDistance.current = 0;
            return;
          }

          // --- End of single-finger gesture ---
          if (isZoomed.current) {
            // Save current pan offsets
            baseTranslateX.current += gestureState.dx;
            baseTranslateY.current += gestureState.dy;
          } else {
            // Check if user dragged down enough to close
            if (gestureState.dy > CLOSE_THRESHOLD) {
              onClose();
            } else {
              // Snap back
              Animated.spring(translateY, {
                toValue: 0,
                useNativeDriver: true,
                friction: 7,
              }).start();
            }
          }
        },
      }),
    [],
  );

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <Animated.View
        style={[
          styles.imageWrapper,
          {
            transform: [
              { translateX },
              { translateY },
              { scale },
            ],
          },
        ]}
      >
        <Image
          source={imageUrl}
          style={styles.image}
          contentFit="contain"
          cachePolicy="disk"
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageWrapper: {
    width: SCREEN_W,
    height: SCREEN_H,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: SCREEN_W,
    height: SCREEN_H,
  },
});
