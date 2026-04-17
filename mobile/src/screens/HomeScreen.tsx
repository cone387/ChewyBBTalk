import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, Alert, ActivityIndicator, Modal,
  Platform, Animated, LayoutAnimation, UIManager, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { loadBBTalks, loadMoreBBTalks } from '../store/slices/bbtalkSlice';
import { loadTags } from '../store/slices/tagSlice';
import type { BBTalk } from '../types';
import { useTheme } from '../theme/ThemeContext';
import VoiceRecordingOverlay from '../components/VoiceRecordingOverlay';
import UndoToast from '../components/UndoToast';
import SkeletonCard from '../components/SkeletonCard';
import ImageViewer from '../components/ImageViewer';
import BBTalkCard from '../components/BBTalkCard';
import PrivacyLockOverlay from '../components/PrivacyLockOverlay';
import SearchBar, { SearchInput } from '../components/SearchBar';
import TagTabs from '../components/TagTabs';
import { usePrivacyMode } from '../hooks/usePrivacyMode';
import { useTagSwipe } from '../hooks/useTagSwipe';
import { useBBTalkActions } from '../hooks/useBBTalkActions';
import { logError } from '../utils/errorHandler';

if (Platform.OS === 'android') UIManager.setLayoutAnimationEnabledExperimental?.(true);

interface Props { selectedTag: string | null; selectedDate: string | null; onOpenDrawer: () => void; onLockChange?: (locked: boolean) => void; onSelectTag?: (tagId: string | null) => void; }

export default function HomeScreen({ selectedTag, selectedDate, onOpenDrawer, onLockChange, onSelectTag }: Props) {
  const navigation = useNavigation<any>();
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const c = theme.colors;

  const showError = useCallback((title: string, msg: string) => {
    Alert.alert(title, msg, [
      { text: '复制', onPress: () => Clipboard.setStringAsync(`${title}: ${msg}`) },
      { text: '关闭' },
    ]);
  }, []);

  const { bbtalks, isLoading, hasMore } = useAppSelector(s => s.bbtalk);
  const { tags } = useAppSelector(s => s.tag);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [showTagTabs, setShowTagTabs] = useState(false);
  const wasLoadingRef = useRef(false);

  // --- Hooks ---

  const privacy = usePrivacyMode({ onLockChange, showError });

  const onNavigateCompose = useCallback((item?: BBTalk) => {
    navigation.navigate('Compose', item ? { editItem: item } : undefined);
  }, [navigation]);

  const actions = useBBTalkActions({ showError, onNavigateCompose });

  const handleSelectTag = useCallback((tagId: string | null) => { onSelectTag?.(tagId); }, [onSelectTag]);
  const tagSwipe = useTagSwipe({ tags, selectedTag, showTagTabs, onSelectTag });

  // 骨架屏 → 实际内容的平滑过渡
  useEffect(() => {
    if (wasLoadingRef.current && !isLoading && bbtalks.length > 0) {
      LayoutAnimation.configureNext(LayoutAnimation.create(300, 'easeInEaseOut', 'opacity'));
    }
    wasLoadingRef.current = isLoading;
  }, [isLoading, bbtalks.length]);

  useEffect(() => {
    AsyncStorage.getItem('search_history').then(v => { if (v) try { setSearchHistory(JSON.parse(v)); } catch (e) { logError(e, 'parse search history'); } });
    AsyncStorage.getItem('show_tag_tabs').then(v => { if (v === 'true') setShowTagTabs(true); });
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      privacy.resetPrivacyTimer(); privacy.loadPrivacySettings();
      AsyncStorage.getItem('show_tag_tabs').then(v => setShowTagTabs(v === 'true'));
    });
    return unsub;
  }, [navigation, privacy.resetPrivacyTimer, privacy.loadPrivacySettings]);

  useEffect(() => { dispatch(loadBBTalks({})); dispatch(loadTags()); }, [dispatch]);
  useEffect(() => {
    if (tags.length === 0 && !selectedDate) return;
    LayoutAnimation.configureNext(LayoutAnimation.create(200, 'easeInEaseOut', 'opacity'));
    const tagNames = selectedTag ? [tags.find(t => t.id === selectedTag)?.name].filter(Boolean) as string[] : [];
    dispatch(loadBBTalks({ tags: tagNames, date: selectedDate || undefined }));
  }, [selectedTag, selectedDate]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const tagNames = selectedTag ? [tags.find(t => t.id === selectedTag)?.name].filter(Boolean) as string[] : [];
    await dispatch(loadBBTalks({ tags: tagNames, date: selectedDate || undefined }));
    dispatch(loadTags()); setRefreshing(false);
  }, [dispatch, selectedTag, selectedDate, tags]);

  const onEndReached = useCallback(() => {
    if (loadingMoreRef.current || !hasMore || isLoading) return;
    loadingMoreRef.current = true; setLoadingMore(true);
    const tagNames = selectedTag ? [tags.find(t => t.id === selectedTag)?.name].filter(Boolean) as string[] : [];
    dispatch(loadMoreBBTalks({ tags: tagNames, date: selectedDate || undefined })).finally(() => {
      loadingMoreRef.current = false; setLoadingMore(false);
    });
  }, [dispatch, hasMore, isLoading, selectedTag, selectedDate, tags]);

  const showLocation = useCallback((loc: { latitude: number; longitude: number }) => {
    Alert.alert('定位信息', `纬度: ${loc.latitude.toFixed(6)}\n经度: ${loc.longitude.toFixed(6)}`, [
      { text: '在地图中打开', onPress: () => {
        const url = Platform.select({ ios: `maps:?q=${loc.latitude},${loc.longitude}`, default: `geo:${loc.latitude},${loc.longitude}` });
        Linking.openURL(url!).catch((e) => { logError(e, 'open map URL'); });
      }},
      { text: '关闭' },
    ]);
  }, []);

  // --- Search ---

  const saveSearchHistory = useCallback((term: string) => {
    if (!term.trim()) return;
    setSearchHistory(prev => {
      const next = [term, ...prev.filter(s => s !== term)].slice(0, 10);
      AsyncStorage.setItem('search_history', JSON.stringify(next));
      return next;
    });
  }, []);
  const clearSearchHistory = useCallback(() => { setSearchHistory([]); AsyncStorage.removeItem('search_history'); }, []);

  const filteredBBTalks = searchText
    ? bbtalks.filter(b => b.content.toLowerCase().includes(searchText.toLowerCase()))
    : bbtalks;

  const selectedTagName = selectedTag ? tags.find(t => t.id === selectedTag)?.name : null;
  const filterLabel = selectedDate ? selectedDate : selectedTagName || null;

  const handleVoiceFinishAndClose = useCallback(async (result: { text: string; audioUri: string | null; audioDuration: number }) => {
    setVoiceRecording(false);
    await actions.handleVoiceFinish(result);
  }, [actions.handleVoiceFinish]);

  const renderItem = useCallback(({ item }: { item: BBTalk }) => (
    <BBTalkCard item={item} onMenu={actions.showMenu} onEdit={onNavigateCompose}
      onToggleVisibility={actions.toggleVisibility} onImagePreview={setPreviewImage} onLocationPress={showLocation} theme={theme} />
  ), [actions.showMenu, onNavigateCompose, actions.toggleVisibility, showLocation, theme]);

  // --- Render ---

  return (
    <View style={[styles.container, { backgroundColor: c.background }]} onTouchStart={privacy.resetPrivacyTimer}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: c.headerBg, borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={onOpenDrawer} style={styles.headerBtn}>
          <Ionicons name="menu-outline" size={26} color={c.text} />
        </TouchableOpacity>
        {searchVisible ? (
          <SearchInput searchText={searchText} onSearchTextChange={setSearchText} onSubmit={saveSearchHistory} theme={theme} />
        ) : (
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: c.text }]}>碎碎念</Text>
            {filterLabel != null && !showTagTabs && (
              <View style={[styles.filterBadge, { backgroundColor: c.primary + '18' }]}>
                <Text style={[styles.filterBadgeText, { color: c.primary }]} numberOfLines={1}>{filterLabel}</Text>
              </View>
            )}
            {selectedDate && (
              <View style={[styles.filterBadge, { backgroundColor: c.primary + '18' }]}>
                <Text style={[styles.filterBadgeText, { color: c.primary }]} numberOfLines={1}>{selectedDate}</Text>
              </View>
            )}
          </View>
        )}
        <TouchableOpacity onPress={() => { setSearchVisible(!searchVisible); if (searchVisible) { saveSearchHistory(searchText); setSearchText(''); } }} style={styles.headerBtn}>
          <Ionicons name={searchVisible ? 'close' : 'search-outline'} size={22} color={c.text} />
        </TouchableOpacity>
      </View>

      <SearchBar visible={searchVisible} searchText={searchText} searchHistory={searchHistory}
        onSearchTextChange={setSearchText} onSubmit={saveSearchHistory} onClearHistory={clearSearchHistory}
        onHistoryItemPress={setSearchText} onClose={() => setSearchVisible(false)} theme={theme} />

      {showTagTabs && !searchVisible && tags.length > 0 && (
        <TagTabs tags={tags} selectedTag={selectedTag} selectedDate={selectedDate}
          onSelectTag={handleSelectTag} onResetAnim={tagSwipe.resetSlideAnim} scrollRef={tagSwipe.tagScrollRef as any} theme={theme} />
      )}

      <Animated.View style={{ flex: 1, transform: [{ translateX: showTagTabs ? tagSwipe.listSlideAnim : 0 }] }}
        {...(showTagTabs ? tagSwipe.panResponder.panHandlers : {})}>
        <FlatList data={filteredBBTalks} keyExtractor={item => item.id}
          renderItem={renderItem}
          onScrollBeginDrag={privacy.resetPrivacyTimer}
          ListEmptyComponent={bbtalks.length === 0 && isLoading ? (
            <View>{[0, 1, 2, 3].map(i => <SkeletonCard key={i} />)}</View>
          ) : !isLoading ? (
            <View style={[styles.emptyCard, { backgroundColor: c.cardBg }]}>
              {searchText || selectedTag || selectedDate ? (
                <><Ionicons name="search-outline" size={40} color={c.textTertiary} />
                  <Text style={[styles.emptyTitle, { color: c.textSecondary }]}>没有找到匹配的碎碎念</Text>
                  <Text style={[styles.emptyHint, { color: c.textTertiary }]}>试试其他关键词或筛选条件</Text></>
              ) : (
                <><Ionicons name="chatbubble-ellipses-outline" size={48} color={c.primary} />
                  <Text style={[styles.emptyTitle, { color: c.text }]}>写下你的第一条碎碎念</Text>
                  <Text style={[styles.emptyHint, { color: c.textTertiary }]}>点击右下角 + 按钮开始记录{'\n'}长按可以语音输入</Text></>
              )}
            </View>
          ) : null}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ paddingVertical: 16 }} /> : !hasMore && filteredBBTalks.length > 0 ? <Text style={[styles.noMore, { color: c.textTertiary }]}>没有更多了</Text> : null}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} colors={[c.primary]} progressBackgroundColor={c.surface} />}
          onEndReached={onEndReached} onEndReachedThreshold={0.3}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 80 }} />
      </Animated.View>

      {privacy.showCountdown && privacy.privacyEnabled && privacy.privacySeconds !== null && privacy.privacySeconds > 0 && !privacy.locked && (
        <TouchableOpacity style={[styles.countdownBadge, { bottom: insets.bottom + 88, backgroundColor: c.primary }]}
          onPress={() => privacy.setLocked(true)} onLongPress={() => navigation.navigate('PrivacySettings')} activeOpacity={0.7}>
          <Ionicons name="lock-closed" size={12} color="#fff" />
          <Text style={styles.countdownText}>
            {privacy.privacySeconds >= 60 ? `${Math.floor(privacy.privacySeconds / 60)}:${(privacy.privacySeconds % 60).toString().padStart(2, '0')}` : `${privacy.privacySeconds}s`}
          </Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={[styles.fab, { bottom: insets.bottom + 24, backgroundColor: c.primary, shadowColor: c.fabShadow }]}
        onPress={() => navigation.navigate('Compose')} onLongPress={() => setVoiceRecording(true)} delayLongPress={300} activeOpacity={0.85}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <Modal visible={!!previewImage} transparent animationType="fade" onRequestClose={() => setPreviewImage(null)}>
        <View style={styles.previewOverlay}>
          <TouchableOpacity style={styles.previewClose} onPress={() => setPreviewImage(null)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {previewImage && <ImageViewer imageUrl={previewImage} onClose={() => setPreviewImage(null)} />}
        </View>
      </Modal>

      <PrivacyLockOverlay locked={privacy.locked} biometricAvailable={privacy.biometricAvailable}
        allowComposeWhenLocked={privacy.allowComposeWhenLocked} unlockPassword={privacy.unlockPassword} unlocking={privacy.unlocking}
        lockKeyboardH={privacy.lockKeyboardH} onUnlockPasswordChange={privacy.setUnlockPassword} onUnlock={privacy.handleUnlock}
        onBiometricUnlock={privacy.handleBiometricUnlock} onCompose={() => navigation.navigate('Compose')}
        onVoiceRecord={() => setVoiceRecording(true)} bottomInset={insets.bottom} theme={theme} />

      <UndoToast visible={!!actions.pendingDelete} onUndo={actions.handleUndo} onDismiss={actions.handleDismiss} />
      <VoiceRecordingOverlay visible={voiceRecording} onFinish={handleVoiceFinishAndClose} onCancel={() => setVoiceRecording(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 0.5,
  },
  headerBtn: { padding: 4, width: 34, alignItems: 'center' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  filterBadge: { marginLeft: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, maxWidth: 140 },
  filterBadgeText: { fontSize: 12, fontWeight: '600' },
  emptyCard: { borderRadius: 16, padding: 40, marginTop: 40, alignItems: 'center', gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '600', marginTop: 8 },
  emptyHint: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  noMore: { textAlign: 'center', fontSize: 13, paddingVertical: 16 },
  fab: {
    position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28,
    justifyContent: 'center', alignItems: 'center',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 6,
  },
  countdownBadge: {
    position: 'absolute', right: 22, flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6,
  },
  countdownText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  previewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' },
  previewClose: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 8 },
});
