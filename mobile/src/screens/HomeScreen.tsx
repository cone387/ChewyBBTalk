import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, Image, Alert, ActivityIndicator, Modal,
  TextInput, ActionSheetIOS, Platform, ScrollView, Linking, Animated, Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { loadBBTalks, loadMoreBBTalks, deleteBBTalkAsync, updateBBTalkAsync, togglePinAsync } from '../store/slices/bbtalkSlice';
import { loadTags } from '../store/slices/tagSlice';
import type { BBTalk, Attachment } from '../types';
import { useTheme } from '../theme/ThemeContext';

interface Props { selectedTag: string | null; selectedDate: string | null; onOpenDrawer: () => void; onLockChange?: (locked: boolean) => void; }

export default function HomeScreen({ selectedTag, selectedDate, onOpenDrawer, onLockChange }: Props) {
  const navigation = useNavigation<any>();
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const c = theme.colors;
  const { bbtalks, isLoading, hasMore } = useAppSelector(s => s.bbtalk);
  const { tags } = useAppSelector(s => s.tag);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // 防窥倒计时
  const [privacySeconds, setPrivacySeconds] = useState<number | null>(null);
  const [showCountdown, setShowCountdown] = useState(true);
  const [privacyEnabled, setPrivacyEnabled] = useState(true);
  const [locked, setLockedState] = useState(false);
  const [allowComposeWhenLocked, setAllowComposeWhenLocked] = useState(true);
  const lockKeyboardH = useRef(new Animated.Value(0)).current;

  const setLocked = useCallback((val: boolean) => {
    setLockedState(val);
    AsyncStorage.setItem('privacy_locked', val ? 'true' : 'false');
  }, []);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const lastActivity = useRef(Date.now());
  const timeoutMinsRef = useRef(5);
  const onLockChangeRef = useRef(onLockChange);
  onLockChangeRef.current = onLockChange;

  const resetPrivacyTimer = useCallback(() => {
    lastActivity.current = Date.now();
  }, []);

  // 加载设置 + 每次从设置页回来时刷新
  const loadPrivacySettings = useCallback(async () => {
    const t = await AsyncStorage.getItem('privacy_timeout_minutes');
    if (t) timeoutMinsRef.current = parseInt(t, 10);
    const cVal = await AsyncStorage.getItem('show_privacy_countdown');
    setShowCountdown(prev => { const v = cVal !== 'false'; return prev === v ? prev : v; });
    const e = await AsyncStorage.getItem('privacy_enabled');
    const enabled = e !== 'false';
    setPrivacyEnabled(prev => prev === enabled ? prev : enabled);
    const ac = await AsyncStorage.getItem('privacy_allow_compose');
    setAllowComposeWhenLocked(prev => { const v = ac !== 'false'; return prev === v ? prev : v; });
    // 恢复锁定状态 - 仅在防窥明确启用时
    if (enabled) {
      const l = await AsyncStorage.getItem('privacy_locked');
      if (l === 'true') { setLockedState(true); onLockChangeRef.current?.(true); }
      else { lastActivity.current = Date.now(); }
    } else {
      lastActivity.current = Date.now();
    }
  }, []);

  useEffect(() => {
    loadPrivacySettings();
    // 检测生物识别
    (async () => {
      try {
        const hasHw = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        setBiometricAvailable(hasHw && enrolled);
      } catch {}
    })();

    // 锁屏键盘动画
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const kbShow = Keyboard.addListener(showEvent, (e) => {
      Animated.spring(lockKeyboardH, { toValue: -e.endCoordinates.height / 2.5, useNativeDriver: true, speed: 20, bounciness: 0 }).start();
    });
    const kbHide = Keyboard.addListener(hideEvent, () => {
      Animated.spring(lockKeyboardH, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 0 }).start();
    });

    const isLockedRef = { current: false };
    const timer = setInterval(async () => {
      // 已锁定时不再轮询，减少重渲染
      if (isLockedRef.current) return;

      const t = await AsyncStorage.getItem('privacy_timeout_minutes');
      if (t) timeoutMinsRef.current = parseInt(t, 10);
      const e = await AsyncStorage.getItem('privacy_enabled');
      const enabled = e !== 'false';
      setPrivacyEnabled(prev => prev === enabled ? prev : enabled);

      const ac = await AsyncStorage.getItem('privacy_allow_compose');
      const allowVal = ac !== 'false';
      setAllowComposeWhenLocked(prev => prev === allowVal ? prev : allowVal);

      if (!enabled) { setPrivacySeconds(null); return; }

      const elapsed = (Date.now() - lastActivity.current) / 1000;
      const remaining = timeoutMinsRef.current * 60 - elapsed;
      if (remaining <= 0) {
        setPrivacySeconds(0);
        setLocked(true);
        isLockedRef.current = true;
      } else {
        setPrivacySeconds(Math.ceil(remaining));
      }
    }, 1000);

    return () => { clearInterval(timer); kbShow.remove(); kbHide.remove(); };
  }, []);

  const handleBiometricUnlock = useCallback(async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: '验证身份以解锁',
        cancelLabel: '使用密码',
        disableDeviceFallback: true,
      });
      if (result.success) {
        setLocked(false);
        setUnlockPassword('');
        lastActivity.current = Date.now();
      } else if (result.error === 'not_enrolled') {
        Alert.alert('提示', '设备未设置生物识别，请使用密码解锁');
        setBiometricAvailable(false);
      } else if (result.error !== 'user_cancel' && result.error !== 'system_cancel') {
        // Expo Go 里 Face ID 未配置会走到这里
        Alert.alert('提示', '生物识别不可用（Expo Go 不支持 Face ID，需要独立构建），请使用密码解锁');
        setBiometricAvailable(false);
      }
    } catch (e: any) {
      // NSFaceIDUsageDescription 未配置时会抛异常
      setBiometricAvailable(false);
      Alert.alert('提示', '生物识别暂不可用，请使用密码解锁');
    }
  }, []);

  const handleUnlock = async () => {
    if (!unlockPassword) return;
    setUnlocking(true);
    try {
      const { login: loginFn, getCurrentUser } = await import('../services/auth');
      const user = getCurrentUser();
      if (!user) { Alert.alert('错误', '用户信息丢失'); setUnlocking(false); return; }
      const result = await loginFn(user.username, unlockPassword);
      if (result.success) {
        setLocked(false);
        setUnlockPassword('');
        lastActivity.current = Date.now();
      } else {
        Alert.alert('解锁失败', result.error || '密码错误，请重试');
        setUnlockPassword('');
      }
    } catch (e: any) {
      Alert.alert('解锁失败', e?.message || '网络错误，请重试');
    } finally {
      setUnlocking(false);
    }
  };

  // 通知父组件锁定状态变化
  useEffect(() => { onLockChangeRef.current?.(locked); }, [locked]);

  // 从其他页面回来时重置防窥计时器
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      lastActivity.current = Date.now();
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => { dispatch(loadBBTalks({})); dispatch(loadTags()); }, [dispatch]);
  useEffect(() => {
    if (tags.length === 0 && !selectedDate) return;
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

  const showMenu = (item: BBTalk) => {
    const pinLabel = item.isPinned ? '取消置顶' : '置顶';
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['编辑', pinLabel, '删除', '取消'], destructiveButtonIndex: 2, cancelButtonIndex: 3 },
        (idx) => {
          if (idx === 0) navigation.navigate('Compose', { editItem: item });
          if (idx === 1) dispatch(togglePinAsync(item.id));
          if (idx === 2) Alert.alert('确认删除', '确定要删除吗？', [
            { text: '取消', style: 'cancel' },
            { text: '删除', style: 'destructive', onPress: () => dispatch(deleteBBTalkAsync(item.id)) },
          ]);
        }
      );
    } else {
      Alert.alert('操作', '', [
        { text: '编辑', onPress: () => navigation.navigate('Compose', { editItem: item }) },
        { text: pinLabel, onPress: () => dispatch(togglePinAsync(item.id)) },
        { text: '删除', style: 'destructive', onPress: () => dispatch(deleteBBTalkAsync(item.id)) },
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

  // 3. 附件卡片渲染（非图片）
  const renderFileAttachment = (att: Attachment) => {
    const iconName = att.type === 'video' ? 'videocam-outline' : att.type === 'audio' ? 'musical-notes-outline' : 'document-outline';
    const iconColor = att.type === 'video' ? '#8B5CF6' : att.type === 'audio' ? '#F59E0B' : '#6B7280';
    const label = att.type === 'video' ? '视频' : att.type === 'audio' ? '音频' : '文件';
    return (
      <TouchableOpacity key={att.uid} style={styles.fileCard} activeOpacity={0.7}
        onPress={(e) => { e.stopPropagation(); Linking.openURL(att.url).catch(() => Alert.alert('提示', '无法打开此文件')); }}>
        <View style={[styles.fileIconWrap, { backgroundColor: iconColor + '15' }]}>
          <Ionicons name={iconName} size={20} color={iconColor} />
        </View>
        <View style={styles.fileInfo}>
          <Text style={styles.fileCardName} numberOfLines={1}>{att.originalFilename || att.filename || '附件'}</Text>
          <Text style={styles.fileCardMeta}>{label}{att.fileSize ? ` · ${(att.fileSize / 1024).toFixed(0)}KB` : ''}</Text>
        </View>
        <Ionicons name="open-outline" size={16} color="#D1D5DB" />
      </TouchableOpacity>
    );
  };

  const renderItem = ({ item }: { item: BBTalk }) => {
    const isMobile = item.context?.source?.platform === 'mobile';
    const loc = item.context?.location as { latitude: number; longitude: number } | undefined;
    const images = item.attachments.filter(a => a.type === 'image');
    const files = item.attachments.filter(a => a.type !== 'image');

    return (
      // 1. 点击内容区进入编辑
      <TouchableOpacity style={[styles.card, { backgroundColor: c.cardBg }]} activeOpacity={0.8}
        onPress={() => navigation.navigate('Compose', { editItem: item })}>
        <TouchableOpacity style={styles.moreBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={() => showMenu(item)}>
          <Ionicons name="ellipsis-horizontal" size={18} color={c.textTertiary} />
        </TouchableOpacity>

        {item.isPinned && (
          <View style={styles.pinBadge}>
            <Ionicons name="pin" size={12} color="#F59E0B" />
            <Text style={styles.pinText}>置顶</Text>
          </View>
        )}

        <Markdown style={{
          body: { fontSize: 15, lineHeight: 24, color: c.text },
          heading1: { fontSize: 22, fontWeight: '700', color: c.text, marginVertical: 8 },
          heading2: { fontSize: 19, fontWeight: '700', color: c.text, marginVertical: 6 },
          heading3: { fontSize: 17, fontWeight: '600', color: c.text, marginVertical: 4 },
          strong: { fontWeight: '700' },
          em: { fontStyle: 'italic' },
          blockquote: { borderLeftWidth: 3, borderLeftColor: c.border, paddingLeft: 12, marginVertical: 6, backgroundColor: c.borderLight, borderRadius: 4, padding: 8 },
          code_inline: { backgroundColor: c.borderLight, color: '#DC2626', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, fontSize: 14 },
          fence: { backgroundColor: c.borderLight, padding: 12, borderRadius: 8, marginVertical: 6, fontSize: 13 },
          code_block: { backgroundColor: c.borderLight, padding: 12, borderRadius: 8, marginVertical: 6, fontSize: 13 },
          link: { color: c.primary, textDecorationLine: 'underline' },
          list_item: { marginVertical: 2 },
          paragraph: { marginVertical: 2 },
        }}>{item.content}</Markdown>

        {item.tags.length > 0 && (
          <View style={styles.tagRow}>
            {item.tags.map(tag => (
              <View key={tag.id} style={[styles.tag, { backgroundColor: tag.color || '#3B82F6' }]}>
                <Text style={styles.tagText}>{tag.name}</Text>
              </View>
            ))}
          </View>
        )}

        {/* 图片 */}
        {images.length > 0 && (
          <View style={styles.imageRow}>
            {images.map(att => (
              <TouchableOpacity key={att.uid} onPress={() => setPreviewImage(att.url)}>
                <Image source={{ uri: att.url }} style={styles.thumbnail} resizeMode="cover" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* 3. 非图片附件卡片 */}
        {files.length > 0 && (
          <View style={styles.fileRow}>{files.map(renderFileAttachment)}</View>
        )}

        {/* 底部信息 - 4. 去掉点分隔 */}
        <View style={styles.footer}>
          <View style={styles.footerLeft}>
            <Text style={[styles.time, { color: c.textTertiary }]}>{formatTime(item.createdAt)}</Text>
            <Ionicons name={isMobile ? 'phone-portrait-outline' : 'laptop-outline'} size={12} color={c.borderLight} />
            {loc && (
              <TouchableOpacity onPress={() => showLocation(loc)} style={{ padding: 2 }}>
                <Ionicons name="location-outline" size={13} color="#10B981" />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity onPress={() => toggleVisibility(item)} style={styles.visBtn}>
            <Ionicons
              name={item.visibility === 'public' ? 'globe-outline' : 'lock-closed-outline'}
              size={15} color={item.visibility === 'public' ? c.primary : c.textTertiary}
            />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const selectedTagName = selectedTag ? tags.find(t => t.id === selectedTag)?.name : null;
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
              value={searchText} onChangeText={setSearchText} autoFocus />
            {searchText.length > 0 && (
              <TouchableOpacity onPress={() => setSearchText('')}><Ionicons name="close-circle" size={18} color={c.textTertiary} /></TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: c.text }]}>碎碎念</Text>
            {filterLabel != null && (
              <View style={[styles.filterBadge, { backgroundColor: c.primary + '18' }]}>
                <Text style={[styles.filterBadgeText, { color: c.primary }]} numberOfLines={1}>{filterLabel}</Text>
              </View>
            )}
          </View>
        )}
        <TouchableOpacity onPress={() => { setSearchVisible(!searchVisible); if (searchVisible) setSearchText(''); }} style={styles.headerBtn}>
          <Ionicons name={searchVisible ? 'close' : 'search-outline'} size={22} color={c.text} />
        </TouchableOpacity>
      </View>

      <FlatList data={filteredBBTalks} keyExtractor={item => item.id} renderItem={renderItem}
        onScrollBeginDrag={resetPrivacyTimer}
        ListEmptyComponent={!isLoading ? <View style={[styles.emptyCard, { backgroundColor: c.cardBg }]}><Text style={[styles.emptyText, { color: c.textTertiary }]}>{searchText ? '没有找到匹配的碎碎念' : '暂无碎碎念'}</Text></View> : null}
        ListFooterComponent={loadingMore ? <ActivityIndicator style={{ paddingVertical: 16 }} /> : !hasMore && filteredBBTalks.length > 0 ? <Text style={[styles.noMore, { color: c.textTertiary }]}>没有更多了</Text> : null}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onEndReached={onEndReached} onEndReachedThreshold={0.3}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 80 }} />

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
        onPress={() => navigation.navigate('Compose')} activeOpacity={0.85}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <Modal visible={!!previewImage} transparent animationType="fade" onRequestClose={() => setPreviewImage(null)}>
        <View style={styles.previewOverlay}>
          <TouchableOpacity style={styles.previewClose} onPress={() => setPreviewImage(null)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {previewImage && (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
              maximumZoomScale={5} minimumZoomScale={1} bouncesZoom showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}>
              <Image source={{ uri: previewImage }} style={styles.previewImage} resizeMode="contain" />
            </ScrollView>
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
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={28} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      )}
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
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 10, paddingHorizontal: 10, marginHorizontal: 8, height: 38,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0, paddingHorizontal: 0, lineHeight: 20, includeFontPadding: false },
  card: {
    borderRadius: 16, padding: 16, marginTop: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  moreBtn: { position: 'absolute', top: 14, right: 14, zIndex: 10, padding: 2 },
  pinBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    marginBottom: 6, alignSelf: 'flex-start',
  },
  pinText: { fontSize: 11, color: '#F59E0B', fontWeight: '600' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  tagText: { color: '#fff', fontSize: 12, fontWeight: '500' },
  imageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  thumbnail: { width: 100, height: 100, borderRadius: 10, backgroundColor: '#F3F4F6' },
  // 附件卡片
  fileRow: { marginTop: 12, gap: 8 },
  fileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F9FAFB', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: '#F3F4F6',
  },
  fileIconWrap: { width: 36, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  fileInfo: { flex: 1 },
  fileCardName: { fontSize: 13, color: '#374151', fontWeight: '500' },
  fileCardMeta: { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  // 底部
  footer: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 12,
  },
  footerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  time: { fontSize: 12 },
  visBtn: { padding: 4 },
  emptyCard: { borderRadius: 16, padding: 40, marginTop: 12, alignItems: 'center' },
  emptyText: { fontSize: 15 },
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
