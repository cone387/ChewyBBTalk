import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Theme } from '../theme/ThemeContext';
import type { Tag } from '../types';

export interface TagPickerModalProps {
  visible: boolean;
  tags: Tag[];
  onConfirm: (selectedTagNames: string[]) => void;
  onClose: () => void;
  theme: Theme;
}

/**
 * TagPickerModal — 标签多选弹窗。
 * 显示所有可用标签列表，支持多选，确认后回调 onConfirm(selectedTagNames)。
 * 适配当前主题配色。
 */
function TagPickerModal({ visible, tags, onConfirm, onClose, theme }: TagPickerModalProps) {
  const c = theme.colors;
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Reset selection when modal opens
  useEffect(() => {
    if (visible) {
      setSelected(new Set());
    }
  }, [visible]);

  const toggleTag = useCallback((name: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    onConfirm(Array.from(selected));
  }, [selected, onConfirm]);

  const renderTag = useCallback(({ item }: { item: Tag }) => {
    const isSelected = selected.has(item.name);
    return (
      <TouchableOpacity
        style={[
          styles.tagItem,
          { borderBottomColor: c.borderLight },
          isSelected && { backgroundColor: c.primaryLight },
        ]}
        onPress={() => toggleTag(item.name)}
        activeOpacity={0.7}
      >
        <View style={styles.tagInfo}>
          {item.color ? (
            <View style={[styles.tagDot, { backgroundColor: item.color }]} />
          ) : null}
          <Text style={[styles.tagName, { color: c.text }]}>{item.name}</Text>
        </View>
        <Ionicons
          name={isSelected ? 'checkbox' : 'square-outline'}
          size={22}
          color={isSelected ? c.primary : c.textTertiary}
        />
      </TouchableOpacity>
    );
  }, [selected, c, toggleTag]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={[styles.overlay, { backgroundColor: c.overlay }]} activeOpacity={1} onPress={onClose}>
        <View style={[styles.sheet, { backgroundColor: c.surface }]} onStartShouldSetResponder={() => true}>
          <Text style={[styles.title, { color: c.text }]}>选择标签</Text>

          {tags.length === 0 ? (
            <Text style={[styles.emptyText, { color: c.textTertiary }]}>暂无可用标签</Text>
          ) : (
            <FlatList
              data={tags}
              keyExtractor={item => item.id || item.name}
              renderItem={renderTag}
              style={styles.list}
              showsVerticalScrollIndicator={false}
            />
          )}

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.footerBtn, { backgroundColor: c.borderLight }]}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={[styles.footerBtnText, { color: c.textSecondary }]}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.footerBtn, { backgroundColor: c.primary }]}
              onPress={handleConfirm}
              activeOpacity={0.7}
              disabled={selected.size === 0}
            >
              <Text style={[styles.footerBtnText, { color: '#fff', opacity: selected.size === 0 ? 0.5 : 1 }]}>
                确认{selected.size > 0 ? ` (${selected.size})` : ''}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

export default React.memo(TagPickerModal);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    borderRadius: 20,
    padding: 20,
    maxHeight: '70%',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 14,
    textAlign: 'center',
  },
  list: {
    maxHeight: 300,
  },
  tagItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 0.5,
    borderRadius: 8,
    marginBottom: 2,
  },
  tagInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  tagDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  tagName: {
    fontSize: 15,
    fontWeight: '500',
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 14,
    paddingVertical: 24,
  },
  footer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  footerBtn: {
    flex: 1,
    borderRadius: 10,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerBtnText: {
    fontWeight: '600',
    fontSize: 14,
  },
});
