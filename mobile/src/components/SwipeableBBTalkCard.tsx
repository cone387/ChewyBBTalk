import React, { useRef, useCallback } from 'react';
import {
  View,
  Text,
  Animated,
  PanResponder,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BBTalkCard from './BBTalkCard';
import type { BBTalk } from '../types';
import type { Theme } from '../theme/ThemeContext';

export interface SwipeableBBTalkCardProps {
  item: BBTalk;
  onDelete: (item: BBTalk) => void;
  onTogglePin: (item: BBTalk) => void;
  onMenu: (item: BBTalk) => void;
  onEdit: (item: BBTalk) => void;
  onToggleVisibility: (item: BBTalk) => void;
  onImagePreview: (url: string) => void;
  onLocationPress: (loc: { latitude: number; longitude: number }) => void;
  onLongPress?: (item: BBTalk) => void;
  batchMode: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
  openSwipeRef: React.MutableRefObject<(() => void) | null>;
  theme: Theme;
}

/** Threshold in px to reveal action area */
const REVEAL_THRESHOLD = 80;
/** Threshold in px (or velocity) to trigger action on release */
const ACTION_THRESHOLD = 120;
/** Velocity threshold to trigger action */
const VELOCITY_THRESHOLD = 0.5;

const SwipeableBBTalkCard = React.memo(function SwipeableBBTalkCard({
  item,
  onDelete,
  onTogglePin,
  onMenu,
  onEdit,
  onToggleVisibility,
  onImagePreview,
  onLocationPress,
  onLongPress,
  batchMode,
  selected,
  onSelect,
  openSwipeRef,
  theme,
}: SwipeableBBTalkCardProps) {
  const c = theme.colors;
  const translateX = useRef(new Animated.Value(0)).current;
  const isOpenRef = useRef(false);

  // Close this card's swipe (spring back to 0)
  const closeSwipe = useCallback(() => {
    isOpenRef.current = false;
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      speed: 20,
      bounciness: 4,
    }).start();
  }, [translateX]);

  // Refs to keep latest callbacks accessible inside PanResponder
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;
  const onTogglePinRef = useRef(onTogglePin);
  onTogglePinRef.current = onTogglePin;
  const itemRef = useRef(item);
  itemRef.current = item;
  const batchModeRef = useRef(batchMode);
  batchModeRef.current = batchMode;
  const closeSwipeRef = useRef(closeSwipe);
  closeSwipeRef.current = closeSwipe;
  const openSwipeRefRef = useRef(openSwipeRef);
  openSwipeRefRef.current = openSwipeRef;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gesture) => {
        // Disable swipe in batch mode
        if (batchModeRef.current) return false;
        // Only capture horizontal swipes: |dx| > |dy| * 1.5 and |dx| > 10
        return (
          Math.abs(gesture.dx) > 10 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5
        );
      },
      onPanResponderGrant: () => {
        // Close any other open card
        const otherClose = openSwipeRefRef.current.current;
        if (otherClose && otherClose !== closeSwipeRef.current) {
          otherClose();
        }
        // Register this card as the open one
        openSwipeRefRef.current.current = closeSwipeRef.current;
      },
      onPanResponderMove: (_evt, gesture) => {
        translateX.setValue(gesture.dx);
      },
      onPanResponderRelease: (_evt, gesture) => {
        const { dx, vx } = gesture;
        const absDx = Math.abs(dx);
        const absVx = Math.abs(vx);

        // Left swipe → delete
        if (dx < 0 && (absDx > ACTION_THRESHOLD || absVx > VELOCITY_THRESHOLD)) {
          // Animate off-screen then trigger delete
          Animated.timing(translateX, {
            toValue: -300,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            onDeleteRef.current(itemRef.current);
            // Reset position for potential undo/reuse
            translateX.setValue(0);
            isOpenRef.current = false;
            openSwipeRefRef.current.current = null;
          });
          return;
        }

        // Right swipe → toggle pin
        if (dx > 0 && (absDx > ACTION_THRESHOLD || absVx > VELOCITY_THRESHOLD)) {
          Animated.timing(translateX, {
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

        // Not enough to trigger action — spring back
        isOpenRef.current = false;
        openSwipeRefRef.current.current = null;
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          speed: 20,
          bounciness: 4,
        }).start();
      },
      onPanResponderTerminate: () => {
        isOpenRef.current = false;
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          speed: 20,
          bounciness: 4,
        }).start();
      },
    })
  ).current;

  // Interpolate opacity for action areas
  const deleteOpacity = translateX.interpolate({
    inputRange: [-REVEAL_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const pinOpacity = translateX.interpolate({
    inputRange: [0, REVEAL_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const pinLabel = item.isPinned ? '取消置顶' : '置顶';

  // Batch mode: tap to select
  const handleBatchSelect = useCallback(() => {
    onSelect(item.id);
  }, [onSelect, item.id]);

  // Long press to enter batch mode
  const handleLongPress = useCallback(() => {
    onLongPress?.(item);
  }, [onLongPress, item]);

  return (
    <View style={styles.wrapper}>
      {/* Left action area — delete (revealed on left swipe, sits behind card on the right side) */}
      <Animated.View
        style={[
          styles.actionArea,
          styles.deleteArea,
          { backgroundColor: c.danger, opacity: deleteOpacity },
        ]}
      >
        <Ionicons name="trash-outline" size={24} color="#fff" />
        <Text style={styles.actionText}>删除</Text>
      </Animated.View>

      {/* Right action area — pin (revealed on right swipe, sits behind card on the left side) */}
      <Animated.View
        style={[
          styles.actionArea,
          styles.pinArea,
          { backgroundColor: c.primary, opacity: pinOpacity },
        ]}
      >
        <Ionicons name="pin-outline" size={24} color="#fff" />
        <Text style={styles.actionText}>{pinLabel}</Text>
      </Animated.View>

      {/* Swipeable card layer */}
      <Animated.View
        style={[
          styles.cardContainer,
          { transform: [{ translateX }] },
        ]}
        {...(batchMode ? {} : panResponder.panHandlers)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onLongPress={batchMode ? undefined : handleLongPress}
          delayLongPress={500}
          onPress={batchMode ? handleBatchSelect : undefined}
          style={styles.cardRow}
        >
          {/* Batch mode checkbox */}
          {batchMode && (
            <TouchableOpacity
              style={styles.checkboxContainer}
              onPress={handleBatchSelect}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.checkbox,
                  {
                    borderColor: selected ? c.primary : c.border,
                    backgroundColor: selected ? c.primary : 'transparent',
                  },
                ]}
              >
                {selected && (
                  <Ionicons name="checkmark" size={16} color="#fff" />
                )}
              </View>
            </TouchableOpacity>
          )}

          <View style={[styles.cardContent, batchMode && styles.cardContentBatch]}>
            <BBTalkCard
              item={item}
              onMenu={onMenu}
              onEdit={onEdit}
              onToggleVisibility={onToggleVisibility}
              onImagePreview={onImagePreview}
              onLocationPress={onLocationPress}
              theme={theme}
            />
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
});

export default SwipeableBBTalkCard;

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    overflow: 'hidden',
  },
  actionArea: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 120,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  deleteArea: {
    right: 0,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
  },
  pinArea: {
    left: 0,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  actionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  cardContainer: {
    // Card sits on top of action areas
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  checkboxContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingRight: 8,
    paddingTop: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: {
    flex: 1,
  },
  cardContentBatch: {
    // Slight shrink when checkbox is visible
  },
});
