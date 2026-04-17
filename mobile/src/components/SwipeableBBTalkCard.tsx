import React, { useCallback } from 'react';
import {
  View,
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

/**
 * SwipeableBBTalkCard — BBTalkCard 包装组件。
 * 支持长按进入批量模式和批量选择 checkbox。
 * 滑动手势已移除（与 TagTabs 滑动切换冲突）。
 */
const SwipeableBBTalkCard = React.memo(function SwipeableBBTalkCard({
  item,
  onMenu,
  onEdit,
  onToggleVisibility,
  onImagePreview,
  onLocationPress,
  onLongPress,
  batchMode,
  selected,
  onSelect,
  theme,
}: SwipeableBBTalkCardProps) {
  const c = theme.colors;

  const handleBatchSelect = useCallback(() => {
    onSelect(item.id);
  }, [onSelect, item.id]);

  const handleLongPress = useCallback(() => {
    onLongPress?.(item);
  }, [onLongPress, item]);

  return (
    <TouchableOpacity
      activeOpacity={1}
      onLongPress={batchMode ? undefined : handleLongPress}
      delayLongPress={500}
      onPress={batchMode ? handleBatchSelect : undefined}
    >
      <View style={styles.cardRow}>
        {batchMode && (
          <TouchableOpacity
            style={styles.checkboxContainer}
            onPress={handleBatchSelect}
            activeOpacity={0.7}
            accessibilityLabel={selected ? '取消选中' : '选中'}
            accessibilityRole="checkbox"
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
      </View>
    </TouchableOpacity>
  );
});

export default SwipeableBBTalkCard;

const styles = StyleSheet.create({
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
  cardContentBatch: {},
});
