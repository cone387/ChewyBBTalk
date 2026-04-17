import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Theme } from '../theme/ThemeContext';

export interface BatchToolbarProps {
  selectedCount: number;
  totalCount: number;
  isExecuting: boolean;
  progress: { done: number; total: number } | null;
  onSelectAll: () => void;
  onDelete: () => void;
  onChangeTags: () => void;
  onChangeVisibility: () => void;
  onClose: () => void;
  theme: Theme;
}

/**
 * BatchToolbar — 批量操作工具栏。
 * 批量模式激活时显示在列表顶部，包含已选计数、全选、删除、改标签、改可见性按钮和关闭按钮。
 * 操作执行中显示进度指示器并禁用所有按钮。
 */
function BatchToolbar({
  selectedCount,
  totalCount,
  isExecuting,
  progress,
  onSelectAll,
  onDelete,
  onChangeTags,
  onChangeVisibility,
  onClose,
  theme,
}: BatchToolbarProps) {
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  const hasSelection = selectedCount > 0;
  const allSelected = selectedCount === totalCount && totalCount > 0;

  return (
    <View style={[styles.container, { backgroundColor: c.headerBg, borderBottomColor: c.border, paddingTop: insets.top }]}>
      {/* Top row: close button + count + progress */}
      <View style={styles.topRow}>
        <TouchableOpacity
          onPress={onClose}
          disabled={isExecuting}
          style={styles.closeBtn}
          hitSlop={8}
        >
          <Ionicons name="close" size={22} color={isExecuting ? c.textTertiary : c.text} />
        </TouchableOpacity>

        <View style={styles.countWrap}>
          {isExecuting && progress ? (
            <View style={styles.progressRow}>
              <ActivityIndicator size="small" color={c.primary} style={styles.spinner} />
              <Text style={[styles.countText, { color: c.text }]}>
                {progress.done}/{progress.total}
              </Text>
            </View>
          ) : (
            <Text style={[styles.countText, { color: c.text }]}>
              已选 {selectedCount} 条
            </Text>
          )}
        </View>

        {/* Spacer to balance the close button */}
        <View style={styles.closeBtn} />
      </View>

      {/* Action buttons row */}
      <View style={styles.actionRow}>
        <ActionButton
          icon={allSelected ? 'checkbox' : 'checkbox-outline'}
          label="全选"
          onPress={onSelectAll}
          disabled={isExecuting}
          color={c.primary}
          disabledColor={c.textTertiary}
        />
        <ActionButton
          icon="trash-outline"
          label="删除"
          onPress={onDelete}
          disabled={isExecuting || !hasSelection}
          color={c.danger}
          disabledColor={c.textTertiary}
        />
        <ActionButton
          icon="pricetag-outline"
          label="改标签"
          onPress={onChangeTags}
          disabled={isExecuting || !hasSelection}
          color={c.primary}
          disabledColor={c.textTertiary}
        />
        <ActionButton
          icon="eye-outline"
          label="改可见性"
          onPress={onChangeVisibility}
          disabled={isExecuting || !hasSelection}
          color={c.primary}
          disabledColor={c.textTertiary}
        />
      </View>
    </View>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  disabled,
  color,
  disabledColor,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  disabled: boolean;
  color: string;
  disabledColor: string;
}) {
  const tint = disabled ? disabledColor : color;
  return (
    <TouchableOpacity
      style={styles.actionBtn}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <Ionicons name={icon} size={20} color={tint} />
      <Text style={[styles.actionLabel, { color: tint }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default React.memo(BatchToolbar);

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 0.5,
    paddingBottom: 8,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countWrap: {
    flex: 1,
    alignItems: 'center',
  },
  countText: {
    fontSize: 15,
    fontWeight: '600',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  spinner: {
    marginRight: 6,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
  },
  actionBtn: {
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    minWidth: 56,
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
});
