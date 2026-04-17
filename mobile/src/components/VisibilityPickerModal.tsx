import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Theme } from '../theme/ThemeContext';

export interface VisibilityPickerModalProps {
  visible: boolean;
  onConfirm: (visibility: 'public' | 'private' | 'friends') => void;
  onClose: () => void;
  theme: Theme;
}

interface VisibilityOption {
  key: 'public' | 'private' | 'friends';
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  description: string;
}

const VISIBILITY_OPTIONS: VisibilityOption[] = [
  { key: 'public', label: '公开', icon: 'globe-outline', description: '所有人可见' },
  { key: 'private', label: '私密', icon: 'lock-closed-outline', description: '仅自己可见' },
  { key: 'friends', label: '好友', icon: 'people-outline', description: '好友可见' },
];

/**
 * VisibilityPickerModal — 可见性选择弹窗。
 * 显示公开/私密/好友三个选项，选择后回调 onConfirm(visibility)。
 * 适配当前主题配色。
 */
function VisibilityPickerModal({ visible, onConfirm, onClose, theme }: VisibilityPickerModalProps) {
  const c = theme.colors;

  const handleSelect = useCallback((key: 'public' | 'private' | 'friends') => {
    onConfirm(key);
  }, [onConfirm]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={[styles.overlay, { backgroundColor: c.overlay }]} activeOpacity={1} onPress={onClose}>
        <View style={[styles.sheet, { backgroundColor: c.surface }]} onStartShouldSetResponder={() => true}>
          <Text style={[styles.title, { color: c.text }]}>选择可见性</Text>

          {VISIBILITY_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.optionItem, { borderBottomColor: c.borderLight }]}
              onPress={() => handleSelect(opt.key)}
              activeOpacity={0.7}
            >
              <View style={[styles.iconWrap, { backgroundColor: c.primaryLight }]}>
                <Ionicons name={opt.icon} size={20} color={c.primary} />
              </View>
              <View style={styles.optionText}>
                <Text style={[styles.optionLabel, { color: c.text }]}>{opt.label}</Text>
                <Text style={[styles.optionDesc, { color: c.textSecondary }]}>{opt.description}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={c.textTertiary} />
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={[styles.cancelBtn, { backgroundColor: c.borderLight }]}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Text style={[styles.cancelText, { color: c.textSecondary }]}>取消</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

export default React.memo(VisibilityPickerModal);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    borderRadius: 20,
    padding: 20,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 14,
    textAlign: 'center',
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  optionText: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  optionDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  cancelBtn: {
    borderRadius: 10,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  cancelText: {
    fontWeight: '600',
    fontSize: 14,
  },
});
