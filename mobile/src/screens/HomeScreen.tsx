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

interface Props { selectedTag: string | null; onOpenDrawer: () => void; onLockChange?: (locked: boolean) => void; }

export default function HomeScreen({ selectedTag, onOpenDrawer, onLockChange }: Props) {
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

  const resetPrivacyTimer = useCallback(() => {
    lastActivity.current = Date.now();
  }, []);

  // 加载设置 + 每次从设置页回来时刷新
  const loadPrivacySettings = useCallback(async () => {
    const t = await AsyncStorage.getItem('privacy_timeout_minutes');
    if (t) timeoutMinsRef.current = parseInt(t, 10);
    const c = await AsyncStorage.getItem('show_privacy_countdown');
    if (c === 'false') setShowCountdown(false); else setShowCountdown(true);
    const e = await AsyncStorage.getItem('privacy_enabled');
    if (e === 'false') setPrivacyEnabled(false); else setPrivacyEnabled(true);
    const ac = await AsyncStorage.getItem('privacy_allow_compose');
    if (ac === 'false') setAllowComposeWhenLocked(false); else setAllowComposeWhenLocked(true);
    // 恢复锁定状态
    const l = await AsyncStorage.getItem('privacy_locked');
    if (l === 'true') { setLockedState(true); onLockChange?.(true); }
    else { lastActivity.current = Date.now(); }
  }, [onLockChange]);

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
      setPrivacyEnabled(enabled);

      const ac = await AsyncStorage.getItem('privacy_allow_compose');
      setAllowComposeWhenLocked(ac !== 'false');

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
  useEffect(() => { onLockChange?.(locked); }, [locked, onLockChange]);

  // 从其他页面回来时重置防窥计时器
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      lastActivity.current = Date.now();
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => { dispatch(loadBBTalks({})); dispatch(loadTags()); }, [dispatch]);
  useEffect(() => {
    if (tags.length === 0) return;
    const tagNames = selectedTag ? [tags.find(t => t.id === selectedTag)?.name].filter(Boolean) as string[] : [];
    dispatch(loadBBTalks({ tags: tagNames }));
  }, [selectedTag]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const tagNames = selectedTag ? [tags.find(t => t.id === selectedTag)?.name].filter(Boolean) as string[] : [];
    await dispatch(loadBBTalks({ tags: tagNames })); dispatch(loadTags()); setRefreshing(false);
  }, [dispatch, selectedTag, tags]);

  const onEndReached = useCallback(async () => {
    if (loadingMore || !hasMore || isLoading) return;
    setLoadingMore(true);
    const tagNames = selectedTag ? [tags.find(t => t.id === selectedTag)?.name].filter(Boolean) as string[] : [];
    await dispatch(loadMoreBBTalks({ tags: tagNames })); setLoadingMore(false);
  }, [dispatch, loadingMore, hasMore, isLoading, selectedTag, tags]);

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
      <TouchableOpacity style={styles.card} activeOpacity={0.8}
        onPress={() => navigation.navigate('Compose', { editItem: item })}>
        <TouchableOpacity style={styles.moreBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={() => showMenu(item)}>
          <Ionicons name="ellipsis-horizontal" size={18} color="#C4C4C4" />
        </TouchableOpacity>

        {item.isPinned && (
          <View style={styles.pinBadge}>
            <Ionicons name="pin" size={12} color="#F59E0B" />
            <Text style={styles.pinText}>置顶</Text>
          </View>
        )}

        <Markdown style={mdStyles}>{item.content}</Markdown>

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
            <Text style={styles.time}>{formatTime(item.createdAt)}</Text>
            <Ionicons name={isMobile ? 'phone-portrait-outline' : 'laptop-outline'} size={12} color="#D1D5DB" />
            {/* 2. 点击定位弹出信息 */}
            {loc && (
              <TouchableOpacity onPress={() => showLocation(loc)} style={{ padding: 2 }}>
                <Ionicons name="location-outline" size={13} color="#10B981" />
              </TouchableOpacity>
            )}
          </View>
          {/* 6. 点击切换可见性 */}
          <TouchableOpacity onPress={() => toggleVisibility(item)} style={styles.visBtn}>
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
    <View style={styles.container} onTouchStart={resetPrivacyTimer}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onOpenDrawer} style={styles.headerBtn}>
          <Ionicons name="menu-outline" size={26} color="#374151" />
        </TouchableOpacity>
        {searchVisible ? (
          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color="#9CA3AF" />
            <TextInput style={styles.searchInput} placeholder="搜索碎碎念..." placeholderTextColor="#C4C4C4"
              value={searchText} onChangeText={setSearchText} autoFocus />
            {searchText.length > 0 && (
              <TouchableOpacity onPress={() => setSearchText('')}><Ionicons name="close-circle" size={18} color="#C4C4C4" /></TouchableOpacity>
            )}
          </View>
        ) : (
          <Text style={styles.headerTitle}>{selectedTagName ? `# ${selectedTagName}` : '碎碎念'}</Text>
        )}
        <TouchableOpacity onPress={() => { setSearchVisible(!searchVisible); if (searchVisible) setSearchText(''); }} style={styles.headerBtn}>
          <Ionicons name={searchVisible ? 'close' : 'search-outline'} size={22} color="#374151" />
        </TouchableOpacity>
      </View>

      <FlatList data={filteredBBTalks} keyExtractor={item => item.id} renderItem={renderItem}
        onScrollBeginDrag={resetPrivacyTimer}
        ListEmptyComponent={!isLoading ? <View style={styles.emptyCard}><Text style={styles.emptyText}>{searchText ? '没有找到匹配的碎碎念' : '暂无碎碎念'}</Text></View> : null}
        ListFooterComponent={loadingMore ? <ActivityIndicator style={{ paddingVertical: 16 }} /> : !hasMore && filteredBBTalks.length > 0 ? <Text style={styles.noMore}>没有更多了</Text> : null}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onEndReached={onEndReached} onEndReachedThreshold={0.3}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 80 }} />

      {/* 防窥倒计时 - 点击立即锁定，长按进设置 */}
      {showCountdown && privacyEnabled && privacySeconds !== null && privacySeconds > 0 && !locked && (
        <TouchableOpacity
          style={[styles.countdownBadge, { bottom: insets.bottom + 88 }]}
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

      <TouchableOpacity style={[styles.fab, { bottom: insets.bottom + 24 }]}
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
        <View style={styles.lockOverlay}>
          <Animated.View style={[styles.lockInner, { transform: [{ translateY: lockKeyboardH }] }]}>
            <View style={styles.lockCard}>
            <Ionicons name="lock-closed" size={40} color="#7C3AED" />
            <Text style={styles.lockTitle}>内容已锁定</Text>
            <Text style={styles.lockSub}>验证身份以解锁查看</Text>

            {/* 生物识别按钮 */}
            {biometricAvailable && (
              <TouchableOpacity style={styles.biometricBtn} onPress={handleBiometricUnlock}>
                <Ionicons name={Platform.OS === 'ios' ? 'scan' : 'finger-print'} size={32} color="#7C3AED" />
                <Text style={styles.biometricText}>
                  {Platform.OS === 'ios' ? 'Face ID / Touch ID' : '指纹解锁'}
                </Text>
              </TouchableOpacity>
            )}

            {/* 分割线 */}
            {biometricAvailable && (
              <View style={styles.lockDivider}>
                <View style={styles.lockDividerLine} />
                <Text style={styles.lockDividerText}>或使用密码</Text>
                <View style={styles.lockDividerLine} />
              </View>
            )}

            {/* 密码输入 */}
            <TextInput
              style={styles.lockInput}
              placeholder="请输入密码"
              placeholderTextColor="#C4C4C4"
              secureTextEntry
              value={unlockPassword}
              onChangeText={setUnlockPassword}
              onSubmitEditing={handleUnlock}
              returnKeyType="done"
            />
            <TouchableOpacity
              style={[styles.lockBtn, (unlocking || !unlockPassword) && { opacity: 0.5 }]}
              onPress={handleUnlock}
              disabled={unlocking || !unlockPassword}
            >
              {unlocking ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.lockBtnText}>密码解锁</Text>}
            </TouchableOpacity>
          </View>
          </Animated.View>

          {/* 防窥模式下可新建（如果设置允许） */}
          {allowComposeWhenLocked && (
            <TouchableOpacity
              style={[styles.fab, { bottom: insets.bottom + 24 }]}
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
    backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 10, marginHorizontal: 8, height: 38,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#111827', paddingVertical: 0, paddingHorizontal: 0, lineHeight: 20, includeFontPadding: false },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginTop: 12,
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
  time: { fontSize: 12, color: '#9CA3AF' },
  visBtn: { padding: 4 },
  emptyCard: { backgroundColor: '#fff', borderRadius: 16, padding: 40, marginTop: 12, alignItems: 'center' },
  emptyText: { fontSize: 15, color: '#9CA3AF' },
  noMore: { textAlign: 'center', color: '#D1D5DB', fontSize: 13, paddingVertical: 16 },
  fab: {
    position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center',
    shadowColor: '#2563EB', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 6,
  },
  countdownBadge: {
    position: 'absolute', right: 22,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#2563EB', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6,
  },
  countdownText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  previewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' },
  previewClose: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 8 },
  previewImage: { width: '100%', height: '100%' },
  // 防窥锁定
  lockOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: '#F9FAFB',
    justifyContent: 'center', alignItems: 'center', zIndex: 200,
  },
  lockInner: { flex: 1, justifyContent: 'center', alignItems: 'center', width: '100%' },
  lockCard: { alignItems: 'center', padding: 32, width: '80%' },
  lockTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginTop: 16 },
  lockSub: { fontSize: 14, color: '#9CA3AF', marginTop: 6, marginBottom: 24 },
  biometricBtn: {
    alignItems: 'center', gap: 8, paddingVertical: 20,
    width: '100%', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 16,
  },
  biometricText: { fontSize: 14, color: '#7C3AED', fontWeight: '500' },
  lockDivider: { flexDirection: 'row', alignItems: 'center', width: '100%', marginVertical: 16 },
  lockDividerLine: { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  lockDividerText: { marginHorizontal: 10, fontSize: 12, color: '#C4C4C4' },
  lockInput: {
    width: '100%', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12,
    paddingHorizontal: 16, height: 48, fontSize: 16, color: '#111827', textAlign: 'center',
  },
  lockBtn: {
    width: '100%', backgroundColor: '#7C3AED', borderRadius: 12, height: 48,
    justifyContent: 'center', alignItems: 'center', marginTop: 14,
  },
  lockBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

const mdStyles = StyleSheet.create({
  body: { fontSize: 15, lineHeight: 24, color: '#1F2937' },
  heading1: { fontSize: 22, fontWeight: '700', color: '#111827', marginVertical: 8 },
  heading2: { fontSize: 19, fontWeight: '700', color: '#111827', marginVertical: 6 },
  heading3: { fontSize: 17, fontWeight: '600', color: '#111827', marginVertical: 4 },
  strong: { fontWeight: '700' },
  em: { fontStyle: 'italic' },
  blockquote: { borderLeftWidth: 3, borderLeftColor: '#D1D5DB', paddingLeft: 12, marginVertical: 6, backgroundColor: '#F9FAFB', borderRadius: 4, padding: 8 },
  code_inline: { backgroundColor: '#F3F4F6', color: '#DC2626', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, fontSize: 14 },
  fence: { backgroundColor: '#F3F4F6', padding: 12, borderRadius: 8, marginVertical: 6, fontSize: 13 },
  code_block: { backgroundColor: '#F3F4F6', padding: 12, borderRadius: 8, marginVertical: 6, fontSize: 13 },
  link: { color: '#2563EB', textDecorationLine: 'underline' },
  list_item: { marginVertical: 2 },
  paragraph: { marginVertical: 2 },
});
