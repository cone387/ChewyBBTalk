import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, Image, Alert, TextInput, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { loadBBTalks, loadMoreBBTalks, deleteBBTalkAsync } from '../store/slices/bbtalkSlice';
import { loadTags } from '../store/slices/tagSlice';
import { getCurrentUser } from '../services/auth';
import type { BBTalk, Tag } from '../types';

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const dispatch = useAppDispatch();
  const { bbtalks, isLoading, hasMore, totalCount } = useAppSelector(s => s.bbtalk);
  const { tags } = useAppSelector(s => s.tag);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const currentUser = getCurrentUser();

  useEffect(() => {
    dispatch(loadBBTalks({}));
    dispatch(loadTags());
  }, [dispatch]);

  // 标签筛选
  useEffect(() => {
    if (tags.length === 0) return;
    const tagNames = selectedTag
      ? [tags.find(t => t.id === selectedTag)?.name].filter(Boolean) as string[]
      : [];
    dispatch(loadBBTalks({ tags: tagNames }));
  }, [selectedTag, dispatch]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const tagNames = selectedTag
      ? [tags.find(t => t.id === selectedTag)?.name].filter(Boolean) as string[]
      : [];
    await dispatch(loadBBTalks({ tags: tagNames }));
    dispatch(loadTags());
    setRefreshing(false);
  }, [dispatch, selectedTag, tags]);

  const onEndReached = useCallback(async () => {
    if (loadingMore || !hasMore || isLoading) return;
    setLoadingMore(true);
    const tagNames = selectedTag
      ? [tags.find(t => t.id === selectedTag)?.name].filter(Boolean) as string[]
      : [];
    await dispatch(loadMoreBBTalks({ tags: tagNames }));
    setLoadingMore(false);
  }, [dispatch, loadingMore, hasMore, isLoading, selectedTag, tags]);

  const handleDelete = (item: BBTalk) => {
    Alert.alert('确认删除', '确定要删除这条碎碎念吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除', style: 'destructive',
        onPress: () => dispatch(deleteBBTalkAsync(item.id)),
      },
    ]);
  };

  const formatTime = (dateStr: string) => {
    const now = new Date();
    const d = new Date(dateStr);
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins} 分钟前`;
    const hours = Math.floor(diff / 3600000);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(diff / 86400000);
    if (days < 7) return `${days} 天前`;
    return d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
  };

  const renderItem = ({ item }: { item: BBTalk }) => (
    <View style={styles.card}>
      {/* 内容 */}
      <Text style={styles.content}>{item.content}</Text>

      {/* 标签 */}
      {item.tags.length > 0 && (
        <View style={styles.tagRow}>
          {item.tags.map(tag => (
            <View key={tag.id} style={[styles.tag, { backgroundColor: tag.color || '#3B82F6' }]}>
              <Text style={styles.tagText}>{tag.name}</Text>
            </View>
          ))}
        </View>
      )}

      {/* 图片附件 */}
      {item.attachments.filter(a => a.type === 'image').length > 0 && (
        <View style={styles.imageRow}>
          {item.attachments.filter(a => a.type === 'image').map(att => (
            <Image key={att.uid} source={{ uri: att.url }} style={styles.thumbnail} />
          ))}
        </View>
      )}

      {/* 底部信息 */}
      <View style={styles.footer}>
        <Text style={styles.time}>{formatTime(item.createdAt)}</Text>
        <View style={styles.footerRight}>
          <Text style={styles.visibility}>
            {item.visibility === 'public' ? '🌐' : '🔒'}
          </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('Compose', { editItem: item })}
            style={styles.actionBtn}
          >
            <Text style={styles.actionText}>编辑</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleDelete(item)} style={styles.actionBtn}>
            <Text style={[styles.actionText, { color: '#EF4444' }]}>删除</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderTagFilter = () => (
    <View style={styles.tagFilter}>
      <TouchableOpacity
        style={[styles.filterChip, !selectedTag && styles.filterChipActive]}
        onPress={() => setSelectedTag(null)}
      >
        <Text style={[styles.filterChipText, !selectedTag && styles.filterChipTextActive]}>
          全部 {totalCount > 0 ? `(${totalCount})` : ''}
        </Text>
      </TouchableOpacity>
      {tags.map(tag => (
        <TouchableOpacity
          key={tag.id}
          style={[styles.filterChip, selectedTag === tag.id && styles.filterChipActive]}
          onPress={() => setSelectedTag(selectedTag === tag.id ? null : tag.id)}
        >
          <Text style={[styles.filterChipText, selectedTag === tag.id && styles.filterChipTextActive]}>
            {tag.name} {tag.bbtalkCount ? `(${tag.bbtalkCount})` : ''}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={bbtalks}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        ListHeaderComponent={renderTagFilter}
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>暂无碎碎念</Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator style={{ paddingVertical: 16 }} />
          ) : !hasMore && bbtalks.length > 0 ? (
            <Text style={styles.noMore}>没有更多了</Text>
          ) : null
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        contentContainerStyle={{ paddingBottom: 100 }}
      />

      {/* 发布按钮 */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('Compose')}
      >
        <Text style={styles.fabText}>＋</Text>
      </TouchableOpacity>
    </View>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  content: {
    fontSize: 15,
    lineHeight: 24,
    color: '#1F2937',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tagText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  imageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  thumbnail: {
    width: 100,
    height: 100,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
  },
  time: { fontSize: 13, color: '#6B7280' },
  footerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  visibility: { fontSize: 14 },
  actionBtn: { paddingVertical: 2 },
  actionText: { fontSize: 13, color: '#4F46E5', fontWeight: '500' },
  tagFilter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  filterChipActive: {
    backgroundColor: '#4F46E5',
  },
  filterChipText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  empty: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 15,
    color: '#9CA3AF',
  },
  noMore: {
    textAlign: 'center',
    color: '#9CA3AF',
    fontSize: 13,
    paddingVertical: 16,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 30,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  fabText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '300',
    marginTop: -2,
  },
});
