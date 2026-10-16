import { useGlassPreferences } from '../theme/GlassPreferences';
import { UI } from '../theme/materials';
import GlassIconButton from '../components/GlassIconButton';
import GlassSurface from '../components/GlassSurface';
import { createPrivacyOperation } from '../services/privacyOperation';
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Keyboard,
  RefreshControl, ActivityIndicator, Modal, AppState,
  Platform, Animated, Linking, BackHandler,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { loadBBTalks, loadMoreBBTalks, togglePinAsync, setBBTalksFromCache, incrementCommentCount } from '../store/slices/bbtalkSlice';
import { loadTags } from '../store/slices/tagSlice';
import type { BBTalk, Comment } from '../types';
import { useTheme } from '../theme/ThemeContext';
import { THEMES } from '../theme/themes';
import { useMediaStatusBar } from '../hooks/useMediaStatusBar';
import VoiceRecordingOverlay from '../components/VoiceRecordingOverlay';
import { useHoldToRecord } from '../hooks/useHoldToRecord';
import UndoToast from '../components/UndoToast';
import SkeletonCard from '../components/SkeletonCard';
import ImageViewer from '../components/ImageViewer';
import SwipeableBBTalkCard from '../components/SwipeableBBTalkCard';
import EmptyState from '../components/EmptyState';
import PrivacyLockOverlay from '../components/PrivacyLockOverlay';
import PrivacyLoading from '../components/PrivacyLoading';
import SearchBar, { SearchInput } from '../components/SearchBar';
import TagTabs from '../components/TagTabs';
import BatchToolbar from '../components/BatchToolbar';
import TagPickerModal from '../components/TagPickerModal';
import VisibilityPickerModal from '../components/VisibilityPickerModal';
import OfflineBanner from '../components/OfflineBanner';
import CommentInputModal from '../components/CommentInputModal';
import DraftNotice from '../components/DraftNotice';
import OutboxNotice from '../components/OutboxNotice';
import { onRecordsChanged } from '../services/recordChanges';
import { usePrivacyMode } from '../hooks/usePrivacyMode';
import { useTagSwipe } from '../hooks/useTagSwipe';
import { useStickySearchHeader } from '../hooks/useStickySearchHeader';
import { useBBTalkActions } from '../hooks/useBBTalkActions';
import { useBatchMode } from '../hooks/useBatchMode';
import { useOfflineCache } from '../hooks/useOfflineCache';
import { logError } from '../utils/errorHandler';
import { xAlert, xConfirm } from '../utils/crossAlert';
import { getSession, isCurrentSession } from '../services/session';

const mediaTheme = THEMES.find(item => item.key === 'dark')!;

interface Props { selectedTag: string | null; selectedDate: string | null; onLockChange?: (locked: boolean) => void; onSelectTag?: (tagId: string | null) => void; onRecordingChange?: (active: boolean) => void; }

export default function HomeScreen({ selectedTag, selectedDate, onLockChange, onSelectTag, onRecordingChange }: Props) {
  const session = useRef(getSession()).current;
  const searchHistoryKey = `search_history:${session.scope}`;
  const navigation = useNavigation<any>();
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const c = theme.colors;
  const { reduceMotion } = useGlassPreferences();

  const showError = useCallback((title: string, msg: string) => {
    xAlert(title, msg);
  }, []);

  const { hasLoadedFromNetwork, isFiltered, bbtalks, isLoading, hasMore } = useAppSelector(s => s.bbtalk);
  const { tags, isLoading: tagsLoading } = useAppSelector(s => s.tag);
  const visibleTags = useMemo(() => tags.filter(tag => (tag.bbtalkCount ?? 0) > 0), [tags]);
  const knownSelectedTag = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedTag) { knownSelectedTag.current = null; return; }
    const current = tags.find(tag => tag.id === selectedTag);
    if (current) knownSelectedTag.current = selectedTag;
    // Initial fetches may still be empty. Only clear a verified empty/deleted tag.
    if (!tagsLoading && ((current && current.bbtalkCount === 0)
      || (!current && knownSelectedTag.current === selectedTag))) onSelectTag?.(null);
  }, [tags, tagsLoading, selectedTag, onSelectTag]);
  const selectedTagName = selectedTag ? tags.find(t => t.id === selectedTag)?.name : null;
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const showTagTabs = true;
  const sticky = useStickySearchHeader();
  const [commentTargetId, setCommentTargetId] = useState<string | null>(null);
  const [lastAddedComment, setLastAddedComment] = useState<{ bbtalkId: string; comment: Comment } | null>(null);
  const lastFeedReadAt = useRef(0);
  const feedDirty = useRef(false);
  const feedReadSequence = useRef(0);
  const recordsRevision = useRef(0);

  // --- Hooks ---

  const privacy = usePrivacyMode({ onLockChange, showError });
  useMediaStatusBar(navigation.getParent?.() ?? navigation, !!previewImage && !privacy.locked, theme.key);
  useEffect(() => {
    // Locking unmounts the list; its next mount starts at offset zero as well.
    if (privacy.locked || !privacy.settingsReady) sticky.scrollY.setValue(0);
  }, [privacy.locked, privacy.settingsReady, sticky.scrollY]);

  useEffect(() => { if (privacy.locked) setVoiceRecording(false); }, [privacy.locked]);

  const { isOffline, lastSyncTime, initCache, loadCachedData, syncToCache } = useOfflineCache();

  // Helper to guard write operations when offline
  const guardOfflineWrite = useCallback((): boolean => {
    if (isOffline) {
      xAlert('离线模式', '当前处于离线模式，该操作需要网络连接');
      return true; // blocked
    }
    return false; // allowed
  }, [isOffline]);

  const onNavigateCompose = useCallback((item?: BBTalk) => {
    navigation.navigate('Compose', item ? { editItem: item } : undefined);
  }, [navigation]);

  const onNavigateDetail = useCallback((item: BBTalk) => {
    navigation.navigate('Compose', { editItem: item });
  }, [navigation]);

  const actions = useBBTalkActions({ showError, onNavigateCompose });

  // Wrap delete action with offline guard
  const handleDeleteGuarded = useCallback((item: BBTalk) => {
    if (guardOfflineWrite()) return;
    actions.handleDelete(item);
  }, [actions.handleDelete, guardOfflineWrite]);

  const openSwipeRef = useRef<(() => void) | null>(null);

  const onTogglePin = useCallback((item: BBTalk) => {
    if (guardOfflineWrite()) return;
    dispatch(togglePinAsync(item.id));
  }, [dispatch, guardOfflineWrite]);

  const handleSelectTag = useCallback((tagId: string | null) => { onSelectTag?.(tagId); }, [onSelectTag]);
  const onManageTags = useCallback(() => navigation.navigate('TagManagement'), [navigation]);

  const handleComment = useCallback((item: BBTalk) => {
    if (guardOfflineWrite()) return;
    setCommentTargetId(item.id);
  }, [guardOfflineWrite]);

  const handleCommentAdded = useCallback((comment: Comment) => {
    if (commentTargetId) {
      setLastAddedComment({ bbtalkId: commentTargetId, comment });
      dispatch(incrementCommentCount({ id: commentTargetId, comment }));
    }
  }, [commentTargetId, dispatch]);
  const tagSwipe = useTagSwipe({ tags: visibleTags, selectedTag, showTagTabs, onSelectTag });

  // --- Batch Mode ---

  const onRefreshRef = useRef<() => void>(() => {});
  const batch = useBatchMode({ showError, onComplete: () => onRefreshRef.current() });
  const recordingVisible = voiceRecording && !batch.batchMode && !privacy.locked;
  useEffect(() => {
    onRecordingChange?.(recordingVisible);
    return () => onRecordingChange?.(false);
  }, [recordingVisible, onRecordingChange]);
  const [tagPickerVisible, setTagPickerVisible] = useState(false);
  const [visibilityPickerVisible, setVisibilityPickerVisible] = useState(false);

  const handleLongPress = useCallback((item: BBTalk) => {
    if (!batch.batchMode) {
      batch.enterBatchMode(item.id);
    }
  }, [batch.batchMode, batch.enterBatchMode]);

  const handleBatchDelete = useCallback(() => {
    if (guardOfflineWrite()) return;
    const ids = Array.from(batch.selectedIds);
    if (ids.length === 0) return;
    batch.batchDelete(ids);
  }, [batch.selectedIds, batch.batchDelete, guardOfflineWrite]);

  const handleBatchChangeTags = useCallback(() => {
    if (guardOfflineWrite()) return;
    if (batch.selectedIds.size === 0) return;
    setTagPickerVisible(true);
  }, [batch.selectedIds, guardOfflineWrite]);

  const handleBatchChangeVisibility = useCallback(() => {
    if (guardOfflineWrite()) return;
    if (batch.selectedIds.size === 0) return;
    setVisibilityPickerVisible(true);
  }, [batch.selectedIds, guardOfflineWrite]);

  const handleTagPickerConfirm = useCallback((selectedTagNames: string[]) => {
    setTagPickerVisible(false);
    const ids = Array.from(batch.selectedIds);
    if (ids.length === 0 || selectedTagNames.length === 0) return;
    batch.batchUpdateTags(ids, selectedTagNames);
  }, [batch.selectedIds, batch.batchUpdateTags]);

  const handleVisibilityPickerConfirm = useCallback((visibility: 'public' | 'private' | 'friends') => {
    setVisibilityPickerVisible(false);
    const ids = Array.from(batch.selectedIds);
    if (ids.length === 0) return;
    batch.batchUpdateVisibility(ids, visibility);
  }, [batch.selectedIds, batch.batchUpdateVisibility]);

  // Android BackHandler: exit batch mode on back press
  useEffect(() => {
    if (!batch.batchMode) return;
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      batch.exitBatchMode();
      return true;
    });
    return () => handler.remove();
  }, [batch.batchMode, batch.exitBatchMode]);

  useEffect(() => {
    AsyncStorage.getItem(searchHistoryKey).then(v => {
      if (!v || !isCurrentSession(session)) return;
      try { const values = JSON.parse(v); if (Array.isArray(values)) setSearchHistory(values.filter(value => typeof value === 'string').slice(0, 10)); }
      catch (e) { logError(e, 'parse search history'); }
    }).catch(e => logError(e, 'read search history'));
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      privacy.resetPrivacyTimer(); privacy.loadPrivacySettings();
    });
    return unsub;
  }, [navigation, privacy.resetPrivacyTimer, privacy.loadPrivacySettings]);

  // --- Offline Cache: init + load cached data on mount ---
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await initCache();
        const cached = await loadCachedData();
        if (mounted && cached.length > 0) {
          dispatch(setBBTalksFromCache(cached));
        }
      } catch (e) {
        logError(e, 'HomeScreen offline cache init');
      }
    })();
    return () => { mounted = false; };
  }, [initCache, loadCachedData, dispatch]);

  useEffect(() => { dispatch(loadTags()); }, [dispatch]);

  // --- Offline Cache: sync to cache after successful API load ---
  const prevBBTalksRef = useRef<BBTalk[]>([]);
  useEffect(() => {
    // Persist authoritative unfiltered data, including an empty list after deletion.
    // Cached hydration and filtered results must not overwrite the full read cache.
    if (hasLoadedFromNetwork && !isFiltered && !isLoading && !isOffline && bbtalks !== prevBBTalksRef.current) {
      prevBBTalksRef.current = bbtalks;
      syncToCache(bbtalks).catch(e => logError(e, 'HomeScreen syncToCache'));
    }
  }, [bbtalks, hasLoadedFromNetwork, isFiltered, isLoading, isOffline, syncToCache]);
  const loadFeed = useCallback(async () => {
    const sequence = ++feedReadSequence.current;
    const revision = recordsRevision.current;
    feedDirty.current = true;
    const tagNames = selectedTagName ? [selectedTagName] : [];
    const result = await dispatch(loadBBTalks({ search: activeSearch || undefined, tags: tagNames, date: selectedDate || undefined }));
    if (sequence !== feedReadSequence.current) return false;
    const succeeded = result.meta?.requestStatus !== 'rejected';
    feedDirty.current = !succeeded || recordsRevision.current !== revision;
    if (succeeded) lastFeedReadAt.current = Date.now();
    return succeeded;
  }, [dispatch, selectedTagName, selectedDate, activeSearch]);
  useEffect(() => { void loadFeed(); }, [loadFeed]);

  const refreshRequest = useRef<{ key: string; promise: Promise<void> } | null>(null);
  const onRefresh = useCallback(async () => {
    if (isOffline) return;
    const key = JSON.stringify([selectedTagName, selectedDate, activeSearch]);
    if (refreshRequest.current?.key === key) return refreshRequest.current.promise;
    setRefreshing(true);
    let promise!: Promise<void>;
    promise = (async () => {
      let refreshAgain = false;
      try {
        const [succeeded] = await Promise.all([
          loadFeed(),
          dispatch(loadTags()),
        ]);
        refreshAgain = succeeded && feedDirty.current;
      } finally {
        if (refreshRequest.current?.promise === promise) {
          refreshRequest.current = null; setRefreshing(false);
          if (refreshAgain && navigation.isFocused() && AppState.currentState === 'active') void onRefreshRef.current();
        }
      }
    })();
    refreshRequest.current = { key, promise };
    return promise;
  }, [dispatch, selectedTagName, selectedDate, isOffline, activeSearch, loadFeed, navigation]);
  onRefreshRef.current = onRefresh;
  useEffect(() => onRecordsChanged(() => {
    recordsRevision.current++;
    feedDirty.current = true;
    if (navigation.isFocused() && AppState.currentState === 'active') void onRefreshRef.current?.();
  }), [navigation]);
  const foregroundRefreshAt = useRef(0);
  const foregroundRefresh = useCallback((force = false) => {
    if (!navigation.isFocused() || AppState.currentState !== 'active') return;
    if (!feedDirty.current && Date.now() - foregroundRefreshAt.current < 1000) return;
    if (!force && !feedDirty.current && Date.now() - lastFeedReadAt.current < 30_000) return;
    foregroundRefreshAt.current = Date.now();
    void onRefreshRef.current?.();
  }, [navigation]);
  useEffect(() => {
    const focus = navigation.addListener('focus', () => foregroundRefresh());
    const active = AppState.addEventListener('change', state => { if (state === 'active') foregroundRefresh(true); });
    return () => { focus(); active.remove(); };
  }, [navigation, foregroundRefresh]);
  const previousOffline = useRef(isOffline);
  useEffect(() => {
    if (previousOffline.current && !isOffline) foregroundRefresh(true);
    previousOffline.current = isOffline;
  }, [isOffline, foregroundRefresh]);


  const onEndReached = useCallback(() => {
    if (isOffline) return; // Disabled when offline
    if (loadingMoreRef.current || !hasMore || isLoading) return;
    loadingMoreRef.current = true; setLoadingMore(true);
    const tagNames = selectedTagName ? [selectedTagName] : [];
    dispatch(loadMoreBBTalks({ search: activeSearch || undefined, tags: tagNames, date: selectedDate || undefined })).finally(() => {
      loadingMoreRef.current = false; setLoadingMore(false);
    });
  }, [dispatch, hasMore, isLoading, selectedTagName, selectedDate, isOffline, activeSearch]);

  const showLocation = useCallback((loc: { latitude: number; longitude: number }) => {
    const operation = createPrivacyOperation();
    if (!operation.isCurrent()) return;
    xConfirm('定位信息', '在地图应用中查看这条记录的位置？', () => {
      if (!operation.isCurrent()) return;
      const url = Platform.select({ ios: `maps:?q=${loc.latitude},${loc.longitude}`, default: `geo:${loc.latitude},${loc.longitude}` });
      Linking.openURL(url!).catch((e) => { logError(e, 'open map URL'); });
    }, undefined, { confirmText: '在地图中打开', cancelText: '关闭' });
  }, []);

  // --- Search ---

  const saveSearchHistory = useCallback((term: string) => {
    term = term.trim();
    setSearchVisible(false);
    Keyboard.dismiss();
    setSearchText(term);
    setActiveSearch(term);
    if (!term || !isCurrentSession(session)) return;
    setSearchHistory(prev => {
      const next = [term, ...prev.filter(s => s !== term)].slice(0, 10);
      AsyncStorage.setItem(searchHistoryKey, JSON.stringify(next)).catch(e => logError(e, 'save search history'));
      return next;
    });
  }, [searchHistoryKey, session]);
  const clearSearchHistory = useCallback(() => { setSearchHistory([]); AsyncStorage.removeItem(searchHistoryKey).catch(e => logError(e, 'clear search history')); }, [searchHistoryKey]);
  const changeSearchText = useCallback((text: string) => {
    setSearchText(text);
    if (!text.trim()) setActiveSearch('');
  }, []);
  const clearFilters = useCallback(() => {
    setSearchText(''); setActiveSearch(''); handleSelectTag(null);
  }, [handleSelectTag]);

  const filteredBBTalks = bbtalks;

  const handleImagePreview = useCallback((images: string[], index: number) => {
    setPreviewImages(images);
    setPreviewIndex(index);
    setPreviewImage(images[index]);
  }, []);

  const handleBatchSelectAll = useCallback(() => {
    batch.selectAll(filteredBBTalks.map(b => b.id));
  }, [batch.selectAll, filteredBBTalks]);

  const handleVoiceFinishAndClose = useCallback(async (result: { text: string; audioUri: string | null; audioDuration: number }) => {
    setVoiceRecording(false);
    if (result.text || result.audioUri) navigation.navigate('Compose', { voiceResult: result });
  }, [navigation]);

  const onFeedDrag = useCallback(() => {
    privacy.resetPrivacyTimer();
    setSearchVisible(false);
  }, [privacy.resetPrivacyTimer]);

  // Notices and filter feedback scroll with the content, below the pinned navigation.
  const listHeaderComponent = useCallback(() => <>
    <OfflineBanner isOffline={isOffline} lastSyncTime={lastSyncTime} theme={theme} />
      <DraftNotice />
      <OutboxNotice />

      {!!activeSearch && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`清除关键词筛选：${activeSearch}`}
        style={{ minHeight: 44, paddingHorizontal: 4, justifyContent: 'center' }} onPress={() => changeSearchText('')}>
        <Text style={{ color: c.primary }}>关键词：{activeSearch} ×</Text>
      </TouchableOpacity>}

      {selectedDate && (
        <TouchableOpacity onPress={() => handleSelectTag(null)} accessibilityRole="button"
          accessibilityLabel={`清除日期筛选：${selectedDate}`}
          style={{ minHeight: 44, marginHorizontal: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="calendar-outline" size={18} color={c.primary} />
          <Text style={{ color: c.primary, flex: 1 }}>{selectedDate} 的记录</Text>
          <Ionicons name="close-circle-outline" size={20} color={c.primary} />
        </TouchableOpacity>
      )}

  </>, [isOffline, lastSyncTime, theme, activeSearch, c, changeSearchText, selectedDate, handleSelectTag]);

  const renderItem = useCallback(({ item }: { item: BBTalk }) => (
    <SwipeableBBTalkCard
      item={item}
      onDelete={handleDeleteGuarded}
      onTogglePin={onTogglePin}
      onMenu={actions.showMenu}
      onEdit={onNavigateDetail}
      onToggleVisibility={actions.toggleVisibility}
      onImagePreview={handleImagePreview}
      onLocationPress={showLocation}
      onComment={handleComment}
      newComment={lastAddedComment?.bbtalkId === item.id ? lastAddedComment.comment : null}
      onLongPress={handleLongPress}
      batchMode={batch.batchMode}
      selected={batch.selectedIds.has(item.id)}
      onSelect={batch.toggleSelect}
      openSwipeRef={openSwipeRef}
      theme={theme}
    />
  ), [handleDeleteGuarded, onTogglePin, actions.showMenu, onNavigateDetail, actions.toggleVisibility, handleImagePreview, showLocation, handleComment, lastAddedComment, handleLongPress, batch.batchMode, batch.selectedIds, batch.toggleSelect, theme]);

  // Keep modal input, search typing and the privacy clock outside list reconciliation.
  const feed = useMemo(() => (
      <Animated.View style={{ flex: 1, transform: [{ translateX: showTagTabs && visibleTags.length > 0 ? tagSwipe.listSlideAnim : 0 }] }}
        {...(showTagTabs && visibleTags.length > 0 ? tagSwipe.panResponder.panHandlers : {})}>
        <View style={styles.listViewport}>
        <Animated.FlatList data={filteredBBTalks} keyExtractor={item => item.id}
          renderItem={renderItem}
          ListHeaderComponent={listHeaderComponent}
          onScroll={sticky.onScroll} scrollEventThrottle={16}
          keyboardDismissMode="on-drag"
          onScrollBeginDrag={onFeedDrag}
          ListEmptyComponent={bbtalks.length === 0 && isLoading ? (
            <View>{[0, 1, 2, 3].map(i => <SkeletonCard key={i} />)}</View>
          ) : !isLoading ? (
            activeSearch || selectedTag || selectedDate ? (
              <EmptyState
                icon="search-outline"
                iconColor={c.textTertiary}
                title="没有找到匹配的碎碎念"
                hint="试试其他关键词或筛选条件"
                actionLabel="清除筛选" onAction={clearFilters}
              />
            ) : (
              <EmptyState
                icon="chatbubble-ellipses-outline"
                title="写下你的第一条碎碎念"
                hint={'一句心情、一张照片，都值得留下。\n记录默认仅自己可见。'}
                actionLabel="写下第一条" onAction={() => navigation.navigate('Compose')}
                secondaryActionLabel="录一段语音" onSecondaryAction={() => setVoiceRecording(true)}
              />
            )
          ) : null}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ paddingVertical: 16 }} /> : !hasMore && filteredBBTalks.length > 0 ? <Text style={[styles.noMore, { color: c.textTertiary }]}>没有更多了</Text> : null}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} enabled={!isOffline} tintColor={c.primary} colors={[c.primary]} progressBackgroundColor={c.surface}
            progressViewOffset={batch.batchMode ? 0 : insets.top + sticky.searchHeight + sticky.navigationHeight} />}
          onEndReached={onEndReached} onEndReachedThreshold={0.3}
          initialNumToRender={6} maxToRenderPerBatch={6} windowSize={7}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 12, paddingTop: batch.batchMode ? 0 : insets.top + sticky.searchHeight + sticky.navigationHeight, paddingBottom: insets.bottom + UI.tabBarClearance + 96 }} />
        </View>
      </Animated.View>
  ), [showTagTabs, visibleTags.length, tagSwipe.listSlideAnim, tagSwipe.panResponder, filteredBBTalks,
    renderItem, listHeaderComponent, onFeedDrag, isLoading, activeSearch,
    selectedTag, selectedDate, clearFilters, navigation, c, loadingMore, hasMore,
    refreshing, onRefresh, isOffline, onEndReached, insets.bottom, insets.top, batch.batchMode, sticky.onScroll, sticky.searchHeight, sticky.navigationHeight]);

  // --- Render ---

  const holdRecording = useHoldToRecord(() => {
    setVoiceRecording(true);
  }, voiceRecording, () => navigation.navigate('Compose'));

  if (privacy.settingsError) return <PrivacyLoading onRetry={() => { void privacy.loadPrivacySettings(); }} />;
  if (!privacy.settingsReady) return <PrivacyLoading />;

  if (privacy.locked) return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <PrivacyLockOverlay locked={privacy.locked} biometricAvailable={privacy.biometricAvailable}
        allowComposeWhenLocked={privacy.allowComposeWhenLocked} unlockPassword={privacy.unlockPassword} unlocking={privacy.unlocking}
        lockKeyboardH={privacy.lockKeyboardH} onUnlockPasswordChange={privacy.setUnlockPassword} onUnlock={privacy.handleUnlock}
        onBiometricUnlock={privacy.handleBiometricUnlock} onCompose={() => navigation.navigate('Compose')}
        onVoiceRecord={() => setVoiceRecording(true)} bottomInset={insets.bottom} theme={theme} />
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: c.background }]} onTouchStart={privacy.resetPrivacyTimer}>
      {batch.batchMode ? (
        <BatchToolbar
          selectedCount={batch.selectedIds.size}
          totalCount={filteredBBTalks.length}
          isExecuting={batch.isExecuting}
          progress={batch.progress}
          onSelectAll={handleBatchSelectAll}
          onDelete={handleBatchDelete}
          onChangeTags={handleBatchChangeTags}
          onChangeVisibility={handleBatchChangeVisibility}
          onClose={batch.exitBatchMode}
          theme={theme}
        />
      ) : null}

      {feed}

      {!batch.batchMode && <View pointerEvents="box-none" style={[styles.headerClip, { top: insets.top }]}>
        <Animated.View pointerEvents="box-none" style={{ backgroundColor: c.background, transform: [{ translateY: sticky.translateY }] }}>
          <View onLayout={sticky.onSearchLayout} style={styles.searchRow}>
            <SearchInput searchText={searchText} onSearchTextChange={changeSearchText}
              onSubmit={saveSearchHistory} onFocus={() => setSearchVisible(true)}
              theme={theme} />
            {privacy.showCountdown && privacy.privacyEnabled && privacy.privacySeconds !== null && privacy.privacySeconds > 0 && !privacy.locked && (
              <TouchableOpacity style={[styles.countdownBadge, { backgroundColor: c.surface }]}
                onPress={() => privacy.setLocked(true)} onLongPress={() => navigation.navigate('PrivacySettings')} activeOpacity={0.7}
                accessibilityRole="button" accessibilityLabel="锁定内容">
                <Ionicons name="lock-closed-outline" size={12} color={c.textSecondary} />
                <Text style={[styles.countdownText, { color: c.textSecondary }]}>
                  {privacy.privacySeconds >= 60 ? `${Math.floor(privacy.privacySeconds / 60)}:${(privacy.privacySeconds % 60).toString().padStart(2, '0')}` : `${privacy.privacySeconds}s`}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          <View onLayout={sticky.onNavigationLayout}>
            <TagTabs tags={visibleTags} selectedTag={selectedTag} selectedDate={selectedDate}
              onSelectTag={handleSelectTag} onResetAnim={tagSwipe.resetSlideAnim}
              onManage={onManageTags}
              scrollRef={tagSwipe.tagScrollRef as any} theme={theme} />
          </View>
          {searchVisible && !searchText && <View>
            <SearchBar visible searchText={searchText} searchHistory={searchHistory}
              onSearchTextChange={changeSearchText} onSubmit={saveSearchHistory} onClearHistory={clearSearchHistory}
              onHistoryItemPress={saveSearchHistory} onClose={() => setSearchVisible(false)} theme={theme} />
          </View>}
        </Animated.View>
      </View>}
      {!batch.batchMode && <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: c.background, zIndex: 21 }} />}

      {!batch.batchMode && (
        <GlassSurface theme={theme} radius={28} elevated style={[styles.fab, { bottom: insets.bottom + UI.tabBarClearance + 16 }]}
          {...holdRecording.handlers} accessibilityRole="button" accessibilityLabel="新建碎碎念">
          <Ionicons name="add" size={28} color={holdRecording.pressed ? c.text : c.primary} />
        </GlassSurface>
      )}

      <Modal visible={!!previewImage} transparent presentationStyle="overFullScreen" animationType={reduceMotion ? "none" : "fade"} onRequestClose={() => setPreviewImage(null)}>
        <View style={styles.previewOverlay}>

          <GlassIconButton theme={mediaTheme} icon="close" style={[styles.previewClose, { top: insets.top + 12 }]} onPress={() => setPreviewImage(null)} accessibilityLabel="关闭图片预览" />
          {previewImages.length > 1 && (
            <View style={styles.previewCounter}>
              <Text style={styles.previewCounterText}>{previewIndex + 1} / {previewImages.length}</Text>
            </View>
          )}
          {previewImage && <ImageViewer imageUrl={previewImage} onClose={() => setPreviewImage(null)} />}
          {previewImages.length > 1 && previewIndex > 0 && (
            <GlassIconButton theme={mediaTheme} icon="chevron-back" style={[styles.previewNav, styles.previewNavLeft]} onPress={() => { const i = previewIndex - 1; setPreviewIndex(i); setPreviewImage(previewImages[i]); }} accessibilityLabel="上一张图片" />
          )}
          {previewImages.length > 1 && previewIndex < previewImages.length - 1 && (
            <GlassIconButton theme={mediaTheme} icon="chevron-forward" style={[styles.previewNav, styles.previewNavRight]} onPress={() => { const i = previewIndex + 1; setPreviewIndex(i); setPreviewImage(previewImages[i]); }} accessibilityLabel="下一张图片" />
          )}
        </View>
      </Modal>

      <UndoToast visible={!!actions.pendingDelete} onUndo={actions.handleUndo} onDismiss={actions.handleDismiss} />
      <VoiceRecordingOverlay visible={voiceRecording && !batch.batchMode} holdMode={holdRecording.holdMode} cancelHint={holdRecording.cancelHint} stopAction={holdRecording.stopAction} onFinish={handleVoiceFinishAndClose} onCancel={() => setVoiceRecording(false)} />

      <TagPickerModal
        visible={tagPickerVisible}
        tags={tags}
        onConfirm={handleTagPickerConfirm}
        onClose={() => setTagPickerVisible(false)}
        theme={theme}
      />
      <VisibilityPickerModal
        visible={visibilityPickerVisible}
        onConfirm={handleVisibilityPickerConfirm}
        onClose={() => setVisibilityPickerVisible(false)}
        theme={theme}
      />
      <CommentInputModal
        visible={!!commentTargetId}
        bbtalkId={commentTargetId || ''}
        onClose={() => setCommentTargetId(null)}
        onCommentAdded={handleCommentAdded}
        theme={theme}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listViewport: { flex: 1, width: '100%', maxWidth: 960, alignSelf: 'center' },
  headerClip: { position: 'absolute', left: 0, right: 0, zIndex: 20, overflow: 'hidden' },
  searchRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, minHeight: 60 },
  noMore: { textAlign: 'center', fontSize: 13, paddingVertical: 16 },
  fab: {
    position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28,
    justifyContent: 'center', alignItems: 'center',
  },
  countdownBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 8,
    minHeight: 44, borderRadius: 22, paddingHorizontal: 12,
  },
  countdownText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  previewOverlay: { flex: 1, backgroundColor: '#000' },
  previewClose: { position: 'absolute', top: 50, right: 20, zIndex: 10 },
  previewCounter: { position: 'absolute', top: 56, left: 0, right: 0, zIndex: 10, alignItems: 'center' },
  previewCounterText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  previewNav: { position: 'absolute', top: '45%', zIndex: 10 },
  previewNavLeft: { left: 12 },
  previewNavRight: { right: 12 },
});
