import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, Alert, ActivityIndicator, Modal,
  TextInput, ActionSheetIOS, Platform, ScrollView, Linking, Animated, LayoutAnimation, UIManager, PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { loadBBTalks, loadMoreBBTalks, updateBBTalkAsync, togglePinAsync, createBBTalkAsync, optimisticDelete, undoDelete } from '../store/slices/bbtalkSlice';
import { loadTags } from '../store/slices/tagSlice';
import type { BBTalk, Attachment } from '../types';
import { useTheme } from '../theme/ThemeContext';
import { attachmentApi } from '../services/api/mediaApi';
import { bbtalkApi } from '../services/api/bbtalkApi';
import VoiceRecordingOverlay from '../components/VoiceRecordingOverlay';
import UndoToast from '../components/UndoToast';
import SkeletonCard from '../components/SkeletonCard';
import ImageViewer from '../components/ImageViewer';
import { usePrivacyMode } from '../hooks/usePrivacyMode';
import BBTalkCard from '../components/BBTalkCard';

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
  const listSlideAnim = useRef(new Animated.Value(0)).current;
  const tagScrollRef = useRef<ScrollView>(null);
  const swipingRef = useRef(false);
  const wasLoadingRef = useRef(false);
  const [pendingDelete, setPendingDelete] = useState<{ bbtalk: BBTalk; index: number } | null>(null);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 骨架屏 → 实际内容的平滑过渡
  useEffect(() => {
    if (wasLoadingRef.current && !isLoading && bbtalks.length > 0) {
      LayoutAnimation.configureNext(LayoutAnimation.create(300, 'easeInEaseOut', 'opacity'));
    }
    wasLoadingRef.current = isLoading;
  }, [isLoading, bbtalks.length]);

  // 防窥模式 Hook
  const {
    locked, privacyEnabled, privacySeconds, showCountdown,
    biometricAvailable, allowComposeWhenLocked,
    unlockPassword, unlocking, lockKeyboardH,
    setLocked, setUnlockPassword, resetPrivacyTimer,
    handleBiometricUnlock, handleUnlock, loadPrivacySettings,
  } = usePrivacyMode({ onLockChange, showError });

  useEffect(() => {
    AsyncStorage.getItem('search_history').then(v => {
      if (v) try { setSearchHistory(JSON.parse(v)); } catch {}
    });
    AsyncStorage.getItem('show_tag_tabs').then(v => {
      if (v === 'true') setShowTagTabs(true);
    });
  }, []);

  // 从其他页面回来时重置防窥计时器并刷新设置
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      resetPrivacyTimer();
      loadPrivacySettings();
      // Reload tag tabs setting
      AsyncStorage.getItem('show_tag_tabs').then(v => setShowTagTabs(v === 'true'));
    });
    return unsubscribe;
  }, [navigation, resetPrivacyTimer, loadPrivacySettings]);

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
    await dispatch(loadBBTalks({ tags: tagNames, date: selectedDate || undefined })); dispatch(loadTags()); setRefreshing(false);
  }, [dispatch, selectedTag, selectedDate, tags]);

  const onEndReached = useCallback(() => {
    if (loadingMoreRef.current || !hasMore || isLoading) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const tagNames = selectedTag ? [tags.find(t => t.id === selectedTag)?.name].filter(Boolean) as string[] : [];
    dispatch(loadMoreBBTalks({ tags: tagNames, date: selectedDate || undefined })).finally(() => {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    });
  }, [dispatch, hasMore, isLoading, selectedTag, selectedDate, tags]);

  const shareBBTalk = async (item: BBTalk) => {
    let text = item.content;
    if (item.tags.length > 0) {
      text += '\n\n' + item.tags.map(t => `#${t.name}`).join(' ');
    }
    try {
      if (Platform.OS === 'web') {
        if (navigator.share) await navigator.share({ text });
        else { await Clipboard.setStringAsync(text); Alert.alert('已复制', '内容已复制到剪贴板'); }
      } else {
        const { Share } = require('react-native');
        const result = await Share.share({ message: text });
        // If user dismissed or share failed, offer clipboard copy
        if (result.action === Share.dismissedAction) {
          Alert.alert('分享', '已取消分享，是否复制到剪贴板？', [
            { text: '取消' },
            { text: '复制', onPress: () => Clipboard.setStringAsync(text) },
          ]);
        }
      }
    } catch {
      // Fallback: copy to clipboard
      await Clipboard.setStringAsync(text);
      Alert.alert('已复制', '内容已复制到剪贴板，可粘贴到微信等应用');
    }
  };

  const handleDelete = useCallback((item: BBTalk) => {
    const index = bbtalks.findIndex(b => b.id === item.id);
    if (index === -1) return;
    setPendingDelete({ bbtalk: item, index });
    dispatch(optimisticDelete(item.id));

    deleteTimerRef.current = setTimeout(async () => {
      try {
        await bbtalkApi.deleteBBTalk(item.id);
      } catch (error: any) {
        dispatch(undoDelete({ bbtalk: item, index }));
        showError('删除失败', error.message || '请稍后重试');
      }
      setPendingDelete(null);
    }, 3000);
  }, [bbtalks, dispatch, showError]);

  const handleUndo = useCallback(() => {
    if (deleteTimerRef.current) {
      clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = null;
    }
    if (pendingDelete) {
      dispatch(undoDelete(pendingDelete));
      setPendingDelete(null);
    }
  }, [pendingDelete, dispatch]);

  const handleDismiss = useCallback(() => {
    setPendingDelete(null);
  }, []);

  const showMenu = (item: BBTalk) => {
    const pinLabel = item.isPinned ? '取消置顶' : '置顶';
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['编辑', pinLabel, '分享', '复制', '删除', '取消'], destructiveButtonIndex: 4, cancelButtonIndex: 5 },
        (idx) => {
          if (idx === 0) navigation.navigate('Compose', { editItem: item });
          if (idx === 1) dispatch(togglePinAsync(item.id));
          if (idx === 2) shareBBTalk(item);
          if (idx === 3) { Clipboard.setStringAsync(item.content); }
          if (idx === 4) handleDelete(item);
        }
      );
    } else {
      Alert.alert('操作', '', [
        { text: '编辑', onPress: () => navigation.navigate('Compose', { editItem: item }) },
        { text: pinLabel, onPress: () => dispatch(togglePinAsync(item.id)) },
        { text: '分享', onPress: () => shareBBTalk(item) },
        { text: '复制', onPress: () => Clipboard.setStringAsync(item.content) },
        { text: '删除', style: 'destructive', onPress: () => handleDelete(item) },
        { text: '取消', style: 'cancel' },
      ]);
    }
  };

  // 6. 切换可见性 - 直接调用 API
  const toggleVisibility = (item: BBTalk) => {
    const newVis = item.visibility === 'public' ? 'private' : 'public';
    Alert.alert('切换可见性', `确定设为${newVis === 'public' ? '公开' : '私密'}？`, [
      { text: '取消', style: 'cancel' },
      { text: '确定', onPress: () => {
        dispatch(updateBBTalkAsync({
          id: item.id,
          data: { visibility: newVis } as any,
        }));
      }},
    ]);
  };

  // 2. 点击定位显示信息
  const showLocation = (loc: { latitude: number; longitude: number }) => {
    Alert.alert('定位信息', `纬度: ${loc.latitude.toFixed(6)}\n经度: ${loc.longitude.toFixed(6)}`, [
      { text: '在地图中打开', onPress: () => {
        const url = Platform.select({
          ios: `maps:?q=${loc.latitude},${loc.longitude}`,
          default: `geo:${loc.latitude},${loc.longitude}`,
        });
        Linking.openURL(url!).catch(() => {});
      }},
      { text: '关闭' },
    ]);
  };

  const saveSearchHistory = useCallback((term: string) => {
    if (!term.trim()) return;
    setSearchHistory(prev => {
      const next = [term, ...prev.filter(s => s !== term)].slice(0, 10);
      AsyncStorage.setItem('search_history', JSON.stringify(next));
      return next;
    });
  }, []);

  const clearSearchHistory = useCallback(() => {
    setSearchHistory([]);
    AsyncStorage.removeItem('search_history');
  }, []);

  const filteredBBTalks = searchText
    ? bbtalks.filter(b => b.content.toLowerCase().includes(searchText.toLowerCase()))
    : bbtalks;

  const handleVoiceFinish = useCallback(async (result: { text: string; audioUri: string | null; audioDuration: number }) => {
    setVoiceRecording(false);
    const { text, audioUri, audioDuration } = result;
    if (!text && !audioUri) return;

    try {
      let audioAttachment: Attachment | undefined;
      if (audioUri) {
        if (Platform.OS === 'web') {
          // Web: fetch blob URI → File → FormData
          const blob = await (await fetch(audioUri)).blob();
          const fileName = `voice_${Date.now()}.webm`;
          const file = new File([blob], fileName, { type: blob.type || 'audio/webm' });
          audioAttachment = await attachmentApi.uploadFile(file);
        } else {
          const ext = Platform.OS === 'ios' ? 'm4a' : '3gp';
          const mime = Platform.OS === 'ios' ? 'audio/mp4' : 'audio/3gpp';
          audioAttachment = await attachmentApi.upload(audioUri, `voice_${Date.now()}.${ext}`, mime);
        }
      }

      const content = text || '🎙️ 语音记录';
      const attachments = audioAttachment ? [audioAttachment] : [];

      await dispatch(createBBTalkAsync({
        content,
        attachments,
        visibility: 'private',
        context: { source: { client: 'ChewyBBTalk Mobile', version: '1.0', platform: 'mobile', input: 'voice' } },
      }));
    } catch (e: any) {
      showError('保存失败', e.message || '请稍后重试');
    }
  }, [dispatch]);

  const selectedTagName = selectedTag ? tags.find(t => t.id === selectedTag)?.name : null;

  // Tag swipe: switch tags with slide animation
  const allTagIds = useMemo(() => [null, ...tags.map(t => t.id)], [tags]);
  const currentTagIdx = selectedTag ? allTagIds.indexOf(selectedTag) : 0;

  const switchTag = useCallback((direction: 'left' | 'right') => {
    if (!showTagTabs || !onSelectTag || tags.length === 0) return;
    const nextIdx = direction === 'left'
      ? Math.min(currentTagIdx + 1, allTagIds.length - 1)
      : Math.max(currentTagIdx - 1, 0);
    if (nextIdx === currentTagIdx) return;

    const slideOut = direction === 'left' ? -1 : 1;
    // Slide out
    Animated.timing(listSlideAnim, { toValue: slideOut * 300, duration: 120, useNativeDriver: true }).start(() => {
      onSelectTag(allTagIds[nextIdx]);
      // Jump to opposite side
      listSlideAnim.setValue(-slideOut * 300);
      // Slide in
      Animated.spring(listSlideAnim, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
    });

    // Auto-scroll tab bar
    if (tagScrollRef.current) {
      tagScrollRef.current.scrollTo({ x: Math.max(0, nextIdx * 70 - 100), animated: true });
    }
  }, [showTagTabs, onSelectTag, tags, currentTagIdx, allTagIds]);

  const switchTagRef = useRef(switchTag);
  switchTagRef.current = switchTag;
  const showTagTabsRef = useRef(showTagTabs);
  showTagTabsRef.current = showTagTabs;

  const listPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => {
        return showTagTabsRef.current && Math.abs(gesture.dx) > 20 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5;
      },
      onPanResponderGrant: () => { swipingRef.current = true; },
      onPanResponderMove: (_, gesture) => {
        listSlideAnim.setValue(gesture.dx * 0.3);
      },
      onPanResponderRelease: (_, gesture) => {
        swipingRef.current = false;
        if (Math.abs(gesture.dx) > 60 || Math.abs(gesture.vx) > 0.5) {
          switchTagRef.current(gesture.dx < 0 ? 'left' : 'right');
        } else {
          Animated.spring(listSlideAnim, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 0 }).start();
        }
      },
      onPanResponderTerminate: () => {
        swipingRef.current = false;
        Animated.spring(listSlideAnim, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 0 }).start();
      },
    })
  ).current;
  const filterLabel = selectedDate
    ? selectedDate
    : selectedTagName || null;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]} onTouchStart={resetPrivacyTimer}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: c.headerBg, borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={onOpenDrawer} style={styles.headerBtn}>
          <Ionicons name="menu-outline" size={26} color={c.text} />
        </TouchableOpacity>
        {searchVisible ? (
          <View style={[styles.searchBar, { backgroundColor: c.borderLight }]}>
            <Ionicons name="search" size={16} color={c.textTertiary} />
            <TextInput style={[styles.searchInput, { color: c.text }]} placeholder="搜索碎碎念..." placeholderTextColor={c.textTertiary}
              value={searchText} onChangeText={setSearchText} autoFocus
              onSubmitEditing={() => saveSearchHistory(searchText)}
              returnKeyType="search" />
            {searchText.length > 0 && (
              <TouchableOpacity onPress={() => setSearchText('')}><Ionicons name="close-circle" size={18} color={c.textTertiary} /></TouchableOpacity>
            )}
          </View>
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

      {/* Search history */}
      {searchVisible && !searchText && searchHistory.length > 0 && (
        <View style={[styles.searchHistoryWrap, { backgroundColor: c.cardBg, borderBottomColor: c.border }]}>
          <View style={styles.searchHistoryHeader}>
            <Text style={[styles.searchHistoryTitle, { color: c.textSecondary }]}>最近搜索</Text>
            <TouchableOpacity onPress={clearSearchHistory}>
              <Text style={[styles.searchHistoryClear, { color: c.textTertiary }]}>清除</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.searchHistoryTags}>
            {searchHistory.map((term, i) => (
              <TouchableOpacity key={i} style={[styles.searchHistoryChip, { backgroundColor: c.borderLight }]}
                onPress={() => { setSearchText(term); }}>
                <Text style={[styles.searchHistoryChipText, { color: c.text }]}>{term}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Tag tabs - 固定吸顶 */}
      {showTagTabs && !searchVisible && tags.length > 0 && (
        <View style={[styles.tagTabsWrap, { backgroundColor: c.background }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            ref={tagScrollRef}
            contentContainerStyle={styles.tagTabsContent}>
            <TouchableOpacity
              style={[styles.tagTab, !selectedTag && !selectedDate && styles.tagTabActive]}
              onPress={() => { onSelectTag?.(null); listSlideAnim.setValue(0); }}>
              <Text style={[styles.tagTabText, { color: !selectedTag && !selectedDate ? c.text : c.textTertiary },
                !selectedTag && !selectedDate && styles.tagTabTextActive]}>全部</Text>
              {!selectedTag && !selectedDate && <View style={[styles.tagTabIndicator, { backgroundColor: c.primary }]} />}
            </TouchableOpacity>
            {tags.map(tag => {
              const active = selectedTag === tag.id;
              return (
                <TouchableOpacity key={tag.id} style={[styles.tagTab, active && styles.tagTabActive]}
                  onPress={() => { onSelectTag?.(active ? null : tag.id); listSlideAnim.setValue(0); }}>
                  <Text style={[styles.tagTabText, { color: active ? c.text : c.textTertiary },
                    active && styles.tagTabTextActive]}>{tag.name}</Text>
                  {active && <View style={[styles.tagTabIndicator, { backgroundColor: c.primary }]} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      <Animated.View style={{ flex: 1, transform: [{ translateX: showTagTabs ? listSlideAnim : 0 }] }}
        {...(showTagTabs ? listPanResponder.panHandlers : {})}>
        <FlatList data={filteredBBTalks} keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <BBTalkCard
              item={item}
              onMenu={showMenu}
              onEdit={(item) => navigation.navigate('Compose', { editItem: item })}
              onToggleVisibility={toggleVisibility}
              onImagePreview={setPreviewImage}
              onLocationPress={showLocation}
              theme={theme}
            />
          )}
          onScrollBeginDrag={resetPrivacyTimer}
          ListEmptyComponent={bbtalks.length === 0 && isLoading ? (
          <View>
            {[0, 1, 2, 3].map(i => <SkeletonCard key={i} />)}
          </View>
        ) : !isLoading ? (
          <View style={[styles.emptyCard, { backgroundColor: c.cardBg }]}>
            {searchText || selectedTag || selectedDate ? (
              <>
                <Ionicons name="search-outline" size={40} color={c.textTertiary} />
                <Text style={[styles.emptyTitle, { color: c.textSecondary }]}>没有找到匹配的碎碎念</Text>
                <Text style={[styles.emptyHint, { color: c.textTertiary }]}>试试其他关键词或筛选条件</Text>
              </>
            ) : (
              <>
                <Ionicons name="chatbubble-ellipses-outline" size={48} color={c.primary} />
                <Text style={[styles.emptyTitle, { color: c.text }]}>写下你的第一条碎碎念</Text>
                <Text style={[styles.emptyHint, { color: c.textTertiary }]}>点击右下角 + 按钮开始记录{'\n'}长按可以语音输入</Text>
              </>
            )}
          </View>
        ) : null}
        ListFooterComponent={loadingMore ? <ActivityIndicator style={{ paddingVertical: 16 }} /> : !hasMore && filteredBBTalks.length > 0 ? <Text style={[styles.noMore, { color: c.textTertiary }]}>没有更多了</Text> : null}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} colors={[c.primary]} progressBackgroundColor={c.surface} />}
        onEndReached={onEndReached} onEndReachedThreshold={0.3}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 80 }} />
      </Animated.View>

      {/* 防窥倒计时 - 点击立即锁定，长按进设置 */}
      {showCountdown && privacyEnabled && privacySeconds !== null && privacySeconds > 0 && !locked && (
        <TouchableOpacity
          style={[styles.countdownBadge, { bottom: insets.bottom + 88, backgroundColor: c.primary }]}
          onPress={() => { setLocked(true); }}
          onLongPress={() => navigation.navigate('PrivacySettings')}
          activeOpacity={0.7}
        >
          <Ionicons name="lock-closed" size={12} color="#fff" />
          <Text style={styles.countdownText}>
            {privacySeconds >= 60 ? `${Math.floor(privacySeconds / 60)}:${(privacySeconds % 60).toString().padStart(2, '0')}` : `${privacySeconds}s`}
          </Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={[styles.fab, { bottom: insets.bottom + 24, backgroundColor: c.primary, shadowColor: c.fabShadow }]}
        onPress={() => navigation.navigate('Compose')}
        onLongPress={() => setVoiceRecording(true)}
        delayLongPress={300}
        activeOpacity={0.85}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <Modal visible={!!previewImage} transparent animationType="fade" onRequestClose={() => setPreviewImage(null)}>
        <View style={styles.previewOverlay}>
          <TouchableOpacity style={styles.previewClose} onPress={() => setPreviewImage(null)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {previewImage && (
            <ImageViewer imageUrl={previewImage} onClose={() => setPreviewImage(null)} />
          )}
        </View>
      </Modal>

      {/* 防窥锁定遮罩 */}
      {locked && (
        <View style={[styles.lockOverlay, { backgroundColor: c.lockBg }]}>
          <Animated.View style={[styles.lockInner, { transform: [{ translateY: lockKeyboardH }] }]}>
            <View style={styles.lockCard}>
            <Ionicons name="lock-closed" size={40} color={c.lockAccent} />
            <Text style={[styles.lockTitle, { color: c.text }]}>内容已锁定</Text>
            <Text style={[styles.lockSub, { color: c.textTertiary }]}>验证身份以解锁查看</Text>

            {biometricAvailable && (
              <TouchableOpacity style={[styles.biometricBtn, { borderColor: c.border }]} onPress={handleBiometricUnlock}>
                <Ionicons name={Platform.OS === 'ios' ? 'scan' : 'finger-print'} size={32} color={c.lockAccent} />
                <Text style={[styles.biometricText, { color: c.lockAccent }]}>
                  {Platform.OS === 'ios' ? 'Face ID / Touch ID' : '指纹解锁'}
                </Text>
              </TouchableOpacity>
            )}

            {biometricAvailable && (
              <View style={styles.lockDivider}>
                <View style={[styles.lockDividerLine, { backgroundColor: c.border }]} />
                <Text style={[styles.lockDividerText, { color: c.textTertiary }]}>或使用密码</Text>
                <View style={[styles.lockDividerLine, { backgroundColor: c.border }]} />
              </View>
            )}

            <TextInput
              style={[styles.lockInput, { borderColor: c.border, color: c.text }]}
              placeholder="请输入密码"
              placeholderTextColor={c.textTertiary}
              secureTextEntry
              value={unlockPassword}
              onChangeText={setUnlockPassword}
              onSubmitEditing={handleUnlock}
              returnKeyType="done"
            />
            <TouchableOpacity
              style={[styles.lockBtn, { backgroundColor: c.lockAccent }, (unlocking || !unlockPassword) && { opacity: 0.5 }]}
              onPress={handleUnlock}
              disabled={unlocking || !unlockPassword}
            >
              {unlocking ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.lockBtnText}>密码解锁</Text>}
            </TouchableOpacity>
          </View>
          </Animated.View>

          {allowComposeWhenLocked && (
            <TouchableOpacity
              style={[styles.fab, { bottom: insets.bottom + 24, backgroundColor: c.primary, shadowColor: c.fabShadow }]}
              onPress={() => navigation.navigate('Compose')}
              onLongPress={() => setVoiceRecording(true)}
              delayLongPress={300}
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={28} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      )}

      <UndoToast visible={!!pendingDelete} onUndo={handleUndo} onDismiss={handleDismiss} />

      <VoiceRecordingOverlay
        visible={voiceRecording}
        onFinish={handleVoiceFinish}
        onCancel={() => setVoiceRecording(false)}
      />
    </View>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 0.5,
  },
  headerBtn: { padding: 4, width: 34, alignItems: 'center' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  filterBadge: {
    marginLeft: 8, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 8, maxWidth: 140,
  },
  filterBadgeText: { fontSize: 12, fontWeight: '600' },
  searchHistoryWrap: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 0.5 },
  searchHistoryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  searchHistoryTitle: { fontSize: 12, fontWeight: '500' },
  searchHistoryClear: { fontSize: 12 },
  searchHistoryTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  searchHistoryChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  searchHistoryChipText: { fontSize: 13 },
  // Tag tabs - 知乎风格
  tagTabsWrap: { },
  tagTabsContent: { paddingHorizontal: 12 },
  tagTab: {
    alignItems: 'center',
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8,
  },
  tagTabActive: {},
  tagTabText: { fontSize: 14 },
  tagTabTextActive: { fontWeight: '700' },
  tagTabIndicator: { width: 18, height: 3, borderRadius: 1.5, marginTop: 4 },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 10, paddingHorizontal: 10, marginHorizontal: 8, height: 38,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0, paddingHorizontal: 0, lineHeight: 20, includeFontPadding: false },
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
    position: 'absolute', right: 22,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6,
  },
  countdownText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  previewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' },
  previewClose: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 8 },
  previewImage: { width: '100%', height: '100%' },
  // 防窥锁定
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center', alignItems: 'center', zIndex: 200,
  },
  lockInner: { flex: 1, justifyContent: 'center', alignItems: 'center', width: '100%' },
  lockCard: { alignItems: 'center', padding: 32, width: '80%' },
  lockTitle: { fontSize: 20, fontWeight: '700', marginTop: 16 },
  lockSub: { fontSize: 14, marginTop: 6, marginBottom: 24 },
  biometricBtn: {
    alignItems: 'center', gap: 8, paddingVertical: 20,
    width: '100%', borderWidth: 1, borderRadius: 16,
  },
  biometricText: { fontSize: 14, fontWeight: '500' },
  lockDivider: { flexDirection: 'row', alignItems: 'center', width: '100%', marginVertical: 16 },
  lockDividerLine: { flex: 1, height: 1 },
  lockDividerText: { marginHorizontal: 10, fontSize: 12 },
  lockInput: {
    width: '100%', borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 16, height: 48, fontSize: 16, textAlign: 'center',
  },
  lockBtn: {
    width: '100%', borderRadius: 12, height: 48,
    justifyContent: 'center', alignItems: 'center', marginTop: 14,
  },
  lockBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
