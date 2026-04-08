import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, LayoutAnimation, UIManager, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { loadTags } from '../store/slices/tagSlice';
import { getCurrentUser } from '../services/auth';

if (Platform.OS === 'android') UIManager.setLayoutAnimationEnabledExperimental?.(true);

interface Props {
  selectedTag: string | null;
  onSelectTag: (tagId: string | null) => void;
  onClose: () => void;
}

export default function DrawerContent({ selectedTag, onSelectTag, onClose }: Props) {
  const dispatch = useAppDispatch();
  const { tags } = useAppSelector(s => s.tag);
  const { totalCount } = useAppSelector(s => s.bbtalk);
  const currentUser = getCurrentUser();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [tagsExpanded, setTagsExpanded] = useState(true);

  useEffect(() => { if (tags.length === 0) dispatch(loadTags()); }, []);

  const select = (id: string | null) => { onSelectTag(id); onClose(); };
  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setTagsExpanded(!tagsExpanded);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      {/* 标签区 - 可折叠 */}
      <TouchableOpacity style={styles.sectionHeader} onPress={toggleExpand} activeOpacity={0.7}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={styles.dot} />
          <Text style={styles.sectionTitle}>标签</Text>
        </View>
        <Ionicons name={tagsExpanded ? 'chevron-up' : 'chevron-down'} size={16} color="#9CA3AF" />
      </TouchableOpacity>

      <ScrollView style={styles.tagScroll} showsVerticalScrollIndicator={false}>
        {tagsExpanded && (
          <>
            <TouchableOpacity style={[styles.item, !selectedTag && styles.itemActive]} onPress={() => select(null)}>
              <Ionicons name="pricetag-outline" size={16} color="#9CA3AF" style={{ marginRight: 8 }} />
              <Text style={[styles.itemText, !selectedTag && styles.itemTextActive]}>全部</Text>
              {totalCount > 0 && <Text style={styles.itemCount}>{totalCount}</Text>}
            </TouchableOpacity>

            {tags.map(tag => (
              <TouchableOpacity key={tag.id} style={[styles.item, selectedTag === tag.id && styles.itemActive]} onPress={() => select(tag.id)}>
                <Ionicons name="pricetag-outline" size={16} color="#9CA3AF" style={{ marginRight: 8 }} />
                <Text style={[styles.itemText, selectedTag === tag.id && styles.itemTextActive]}>{tag.name}</Text>
                {(tag.bbtalkCount ?? 0) > 0 && <Text style={styles.itemCount}>{tag.bbtalkCount}</Text>}
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>

      {/* 底部用户 + 设置 */}
      {currentUser && (
        <View style={[styles.userSection, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.userRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(currentUser.display_name || currentUser.username).charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.userName}>{currentUser.display_name || currentUser.username}</Text>
              <Text style={styles.userSub}>@{currentUser.username}</Text>
            </View>
            <TouchableOpacity onPress={() => { onClose(); setTimeout(() => navigation.navigate('Settings'), 100); }} style={{ padding: 6 }}>
              <Ionicons name="settings-outline" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 10,
  },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#F97316' },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  tagScroll: { flex: 1, paddingHorizontal: 12 },
  item: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 11, borderRadius: 10, marginBottom: 2 },
  itemActive: { backgroundColor: '#F3F4F6' },
  itemText: { flex: 1, fontSize: 14, color: '#374151' },
  itemTextActive: { fontWeight: '600', color: '#111827' },
  itemCount: { fontSize: 12, color: '#9CA3AF' },
  userSection: { padding: 16, borderTopWidth: 0.5, borderTopColor: '#F3F4F6' },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#7C3AED', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  userName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  userSub: { fontSize: 12, color: '#6B7280' },
});
