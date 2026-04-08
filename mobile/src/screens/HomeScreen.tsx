import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, Image, Alert, ActivityIndicator, Modal,
  TextInput, ActionSheetIOS, Platform, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { loadBBTalks, loadMoreBBTalks, deleteBBTalkAsync } from '../store/slices/bbtalkSlice';
import { loadTags } from '../store/slices/tagSlice';
import type { BBTalk } from '../types';

interface Props { selectedTag: string | null; onOpenDrawer: () => void; }

export default function HomeScreen({ selectedTag, onOpenDrawer }: Props) {
  const navigation = useNavigation<any>();
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();
  const { bbtalks, isLoading, hasMore } = useAppSelector(s => s.bbtalk);
  const { tags } = useAppSelector(s => s.tag);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  useEffect(() => { dispatch(loadBBTalks({})); dispatch(loadTags()); }, [dispatch]);
  useEffect(() => {
    if (tags.length === 0) return;
    const tagNames = selectedTag ? [tags.find(t => t.id === selectedTag)?.name].filter(Boolean) as string[] : [];
    dispatch(loadBBTalks({ tags: tagNames }));
  }, [selectedTag]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const tagNames = selectedTag ? [tags.find(t => t.id === selectedTag)?.name].filter(Boolean) as string[] : [];
    await dispatch(loadBBTalks({ tags: tagNames }));
    dispatch(loadTags());
    setRefreshing(false);
  }, [dispatch, selectedTag, tags]);

  const onEndReached = useCallback(async () => {
    if (loadingMore || !hasMore || isLoading) return;
    setLoadingMore(true);
    const tagNames = selectedTag ? [tags.find(t => t.id === selectedTag)?.name].filter(Boolean) as string[] : [];
    await dispatch(loadMoreBBTalks({ tags: tagNames }));
    setLoadingMore(false);
  }, [dispatch, loadingMore, hasMore, isLoading, selectedTag, tags]);

  const showMenu = (item: BBTalk) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['编辑', '置顶', '删除', '取消'], destructiveButtonIndex: 2, cancelButtonIndex: 3 },
        (idx) => {
          if (idx === 0) navigation.navigate('Compose', { editItem: item });
          if (idx === 2) Alert.alert('确认删除', '确定要删除吗？', [
            { text: '取消', style: 'cancel' },
            { text: '删除', style: 'destructive', onPress: () => dispatch(deleteBBTalkAsync(item.id)) },
          ]);
        }
      );
    } else {
      Alert.alert('操作', '', [
        { text: '编辑', onPress: () => navigation.navigate('Compose', { editItem: item }) },
        { text: '置顶' },
        { text: '删除', style: 'destructive', onPress: () => dispatch(deleteBBTalkAsync(item.id)) },
        { text: '取消', style: 'cancel' },
      ]);
    }
  };

  const toggleVisibility = (item: BBTalk) => {
    const newVis = item.visibility === 'public' ? 'private' : 'public';
    Alert.alert('切换可见性', `确定设为${newVis === 'public' ? '公开' : '私密'}？`, [
      { text: '取消', style: 'cancel' },
      { text: '确定', onPress: () => {
        // TODO: dispatch update visibility
        Alert.alert('提示', '功能开发中');
      }},
    ]);
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins}分钟前`;
    const hours = Math.floor(diff / 3600000);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(diff / 86400000);
    if (days < 7) return `${days}天前`;
    return d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
  };

  const filteredBBTalks = searchText
    ? bbtalks.filter(b => b.content.toLowerCase().includes(searchText.toLowerCase()))
    : bbtalks;

  const renderItem = ({ item }: { item: BBTalk }) => {
    const isMobile = item.context?.source?.platform === 'mobile';
    return (
      <TouchableOpacity style={styles.card} activeOpacity={0.8}
        onPress={() => navigation.navigate('Compose', { editItem: item })}>

        {/* 更多按钮 */}
        <TouchableOpacity style={styles.moreBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={(e) => { e.stopPropagation(); showMenu(item); }}>
          <Ionicons name="ellipsis-horizontal" size={18} color="#C4C4C4" />
        </TouchableOpacity>

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

        {/* 图片 - 点击预览 */}
        {item.attachments.filter(a => a.type === 'image').length > 0 && (
          <View style={styles.imageRow}>
            {item.attachments.filter(a => a.type === 'image').map(att => (
              <TouchableOpacity key={att.uid} onPress={(e) => { e.stopPropagation(); setPreviewImage(att.url); }}>
                <Image source={{ uri: att.url }} style={styles.thumbnail} resizeMode="cover" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* 底部信息 */}
        <View style={styles.footer}>
          <View style={styles.footerLeft}>
            <Text style={styles.time}>{formatTime(item.createdAt)}</Text>
            <Text style={styles.dot}>·</Text>
            <Ionicons name={isMobile ? 'phone-portrait-outline' : 'laptop-outline'} size={12} color="#D1D5DB" />
            {item.context?.location && (
              <><Text style={styles.dot}>·</Text><Ionicons name="location-outline" size={12} color="#10B981" /></>
            )}
          </View>
          <TouchableOpacity onPress={(e) => { e.stopPropagation(); toggleVisibility(item); }} style={styles.visBtn}>
            <Ionicons
              name={item.visibility === 'public' ? 'globe-outline' : 'lock-closed-outline'}
              size={15} color={item.visibility === 'public' ? '#60A5FA' : '#C4C4C4'}
            />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const selectedTagName = selectedTag ? tags.find(t => t.id === selectedTag)?.name : null;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onOpenDrawer} style={styles.headerBtn}>
          <Ionicons name="menu-outline" size={26} color="#374151" />
        </TouchableOpacity>
        {searchVisible ? (
          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color="#9CA3AF" />
            <TextInput
              style={styles.searchInput}
              placeholder="搜索碎碎念..."
              placeholderTextColor="#C4C4C4"
              value={searchText}
              onChangeText={setSearchText}
              autoFocus
            />
            {searchText.length > 0 && (
              <TouchableOpacity onPress={() => setSearchText('')}>
                <Ionicons name="close-circle" size={18} color="#C4C4C4" />
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <Text style={styles.headerTitle}>{selectedTagName ? `# ${selectedTagName}` : '碎碎念'}</Text>
        )}
        <TouchableOpacity onPress={() => { setSearchVisible(!searchVisible); if (searchVisible) setSearchText(''); }} style={styles.headerBtn}>
          <Ionicons name={searchVisible ? 'close' : 'search-outline'} size={22} color="#374151" />
        </TouchableOpacity>
      </View>

      {/* 列表 */}
      <FlatList
        data={filteredBBTalks}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        ListEmptyComponent={!isLoading ? <View style={styles.emptyCard}><Text style={styles.emptyText}>{searchText ? '没有找到匹配的碎碎念' : '暂无碎碎念'}</Text></View> : null}
        ListFooterComponent={
          loadingMore ? <ActivityIndicator style={{ paddingVertical: 16 }} /> :
          !hasMore && filteredBBTalks.length > 0 ? <Text style={styles.noMore}>没有更多了</Text> : null
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 80 }}
      />

      {/* FAB */}
      <TouchableOpacity style={[styles.fab, { bottom: insets.bottom + 24 }]}
        onPress={() => navigation.navigate('Compose')} activeOpacity={0.85}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* 图片预览 - 支持双指缩放 */}
      <Modal visible={!!previewImage} transparent animationType="fade" onRequestClose={() => setPreviewImage(null)}>
        <View style={styles.previewOverlay}>
          <TouchableOpacity style={styles.previewClose} onPress={() => setPreviewImage(null)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {previewImage && (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
              maximumZoomScale={5}
              minimumZoomScale={1}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              bouncesZoom
            >
              <Image source={{ uri: previewImage }} style={styles.previewImage} resizeMode="contain" />
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, backgroundColor: '#fff',
    borderBottomWidth: 0.5, borderBottomColor: '#E5E7EB',
  },
  headerBtn: { padding: 4, width: 34, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 10, marginHorizontal: 8, height: 36,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#111827', padding: 0 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginTop: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  moreBtn: { position: 'absolute', top: 14, right: 14, zIndex: 10, padding: 2 },
  content: { fontSize: 15, lineHeight: 26, color: '#1F2937', paddingRight: 28 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  tagText: { color: '#fff', fontSize: 12, fontWeight: '500' },
  imageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  thumbnail: { width: 100, height: 100, borderRadius: 10, backgroundColor: '#F3F4F6' },
  footer: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 14, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: '#F3F4F6',
  },
  footerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  footerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  time: { fontSize: 12, color: '#9CA3AF' },
  dot: { fontSize: 10, color: '#D1D5DB', marginHorizontal: -2 },
  visBtn: { padding: 4 },
  emptyCard: { backgroundColor: '#fff', borderRadius: 16, padding: 40, marginTop: 12, alignItems: 'center' },
  emptyText: { fontSize: 15, color: '#9CA3AF' },
  noMore: { textAlign: 'center', color: '#D1D5DB', fontSize: 13, paddingVertical: 16 },
  fab: {
    position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center',
    shadowColor: '#2563EB', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 6,
  },
  previewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' },
  previewClose: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 8 },
  previewImage: { width: '100%', height: '100%' },
});
