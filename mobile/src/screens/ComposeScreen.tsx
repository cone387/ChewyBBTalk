import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Image,
  Platform, Keyboard, InputAccessoryView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { createBBTalkAsync, updateBBTalkAsync } from '../store/slices/bbtalkSlice';
import { loadTags } from '../store/slices/tagSlice';
import { attachmentApi } from '../services/api/mediaApi';
import type { Attachment, BBTalk } from '../types';

const INPUT_ACCESSORY_ID = 'compose-toolbar';

export default function ComposeScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const dispatch = useAppDispatch();
  const { tags: existingTags } = useAppSelector(s => s.tag);
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();

  const editItem: BBTalk | undefined = route.params?.editItem;
  const isEditing = !!editItem;

  const getInitialContent = () => {
    if (!editItem) return '';
    return editItem.tags.map(t => `#${t.name} `).join('') + editItem.content;
  };

  const [content, setContent] = useState(getInitialContent());
  const [visibility, setVisibility] = useState<'public' | 'private'>((editItem?.visibility as any) || 'private');
  const [attachments, setAttachments] = useState<Attachment[]>(editItem?.attachments || []);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [showQuickTags, setShowQuickTags] = useState(false);

  useEffect(() => {
    if (existingTags.length === 0) dispatch(loadTags());
    const s1 = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const s2 = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { s1.remove(); s2.remove(); };
  }, []);

  const parseTags = (text: string): string[] => [...new Set(Array.from(text.matchAll(/(?:^|\s)#([^\s#]+)\s/g)).map(m => m[1]))];
  const cleanContent = (text: string): string => text.replace(/(?:^|\s)#([^\s#]+)\s/g, ' ').trim();
  const currentTags = parseTags(content + ' ');

  const pickMedia = async (type: 'images' | 'videos') => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: type === 'images' ? ['images'] : ['videos'],
      allowsMultipleSelection: true, quality: 0.8,
    });
    if (result.canceled || result.assets.length === 0) return;
    setUploading(true);
    try {
      for (const asset of result.assets) {
        const att = await attachmentApi.upload(asset.uri, asset.fileName || `media_${Date.now()}.${type === 'images' ? 'jpg' : 'mp4'}`, asset.mimeType || (type === 'images' ? 'image/jpeg' : 'video/mp4'));
        setAttachments(prev => [...prev, att]);
      }
    } catch (err: any) { Alert.alert('上传失败', err.message); }
    finally { setUploading(false); }
  };

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ multiple: true });
      if (result.canceled || !result.assets?.length) return;
      setUploading(true);
      for (const asset of result.assets) {
        const att = await attachmentApi.upload(asset.uri, asset.name, asset.mimeType || 'application/octet-stream');
        setAttachments(prev => [...prev, att]);
      }
    } catch (err: any) { Alert.alert('上传失败', err.message); }
    finally { setUploading(false); }
  };

  const getLocation = async () => {
    if (location) { setLocation(null); return; }
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('提示', '需要定位权限'); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
    } catch { Alert.alert('定位失败', '请稍后重试'); }
  };

  const insertTag = (tagName: string) => {
    const prefix = content.length > 0 && !content.endsWith(' ') && !content.endsWith('\n') ? ' ' : '';
    setContent(prev => `${prev}${prefix}#${tagName} `);
    setShowQuickTags(false);
    inputRef.current?.focus();
  };

  const handleSubmit = async () => {
    const cleaned = cleanContent(content);
    if (!cleaned) { Alert.alert('提示', '请输入内容'); return; }
    Keyboard.dismiss(); setSubmitting(true);
    try {
      const context: Record<string, any> = { source: { client: 'ChewyBBTalk Mobile', version: '1.0', platform: 'mobile' } };
      if (location) context.location = location;
      if (isEditing && editItem) {
        await dispatch(updateBBTalkAsync({ id: editItem.id, data: { content: cleaned, tags: currentTags.map(name => ({ id: '', name, color: '', sortOrder: 0, bbtalkCount: 0 })), visibility, attachments } })).unwrap();
      } else {
        await dispatch(createBBTalkAsync({ content: cleaned, tags: currentTags, visibility, attachments, context })).unwrap();
      }
      dispatch(loadTags()); navigation.goBack();
    } catch (err: any) { Alert.alert('失败', err.message || '请重试'); }
    finally { setSubmitting(false); }
  };

  const canSubmit = cleanContent(content).length > 0 && !submitting && !uploading;

  const renderToolbarContent = () => (
    <>
      {/* 快速标签展开区 - 紧贴工具栏上方 */}
      {showQuickTags && existingTags.length > 0 && (
        <View style={styles.quickTagBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}>
            {existingTags.filter(t => !currentTags.includes(t.name)).slice(0, 15).map(tag => (
              <TouchableOpacity key={tag.id} style={styles.quickTagChip} onPress={() => insertTag(tag.name)}>
                <Text style={styles.quickTagText}>#{tag.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
      {/* 定位信息条 */}
      {location && (
        <View style={styles.locationBar}>
          <Ionicons name="location" size={14} color="#10B981" />
          <Text style={styles.locationText}>{location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}</Text>
          <TouchableOpacity onPress={() => setLocation(null)}><Ionicons name="close-circle" size={16} color="#C4C4C4" /></TouchableOpacity>
        </View>
      )}
      {/* 工具栏 */}
      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.toolBtn} onPress={() => pickMedia('images')}><Ionicons name="image-outline" size={22} color="#6B7280" /></TouchableOpacity>
        <TouchableOpacity style={styles.toolBtn} onPress={() => pickMedia('videos')}><Ionicons name="videocam-outline" size={22} color="#6B7280" /></TouchableOpacity>
        <TouchableOpacity style={styles.toolBtn} onPress={pickFile}><Ionicons name="attach-outline" size={22} color="#6B7280" /></TouchableOpacity>
        <TouchableOpacity style={styles.toolBtn} onPress={() => setShowQuickTags(!showQuickTags)}><Ionicons name="pricetag-outline" size={20} color={showQuickTags ? '#2563EB' : '#6B7280'} /></TouchableOpacity>
        <TouchableOpacity style={styles.toolBtn} onPress={getLocation}><Ionicons name="location-outline" size={20} color={location ? '#10B981' : '#6B7280'} /></TouchableOpacity>
        <TouchableOpacity style={styles.toolBtn} onPress={() => setVisibility(v => v === 'private' ? 'public' : 'private')}>
          <Ionicons name={visibility === 'private' ? 'lock-closed-outline' : 'globe-outline'} size={20} color={visibility === 'public' ? '#2563EB' : '#6B7280'} />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        {uploading && <ActivityIndicator size="small" color="#6B7280" style={{ marginRight: 4 }} />}
        <Text style={styles.charCount}>{cleanContent(content).length}</Text>
      </View>
    </>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.cancelText}>取消</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>{isEditing ? '编辑' : '发碎碎念'}</Text>
        <TouchableOpacity style={[styles.publishBtn, !canSubmit && { opacity: 0.4 }]} onPress={handleSubmit} disabled={!canSubmit}>
          {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.publishText}>{isEditing ? '更新' : '发布'}</Text>}
        </TouchableOpacity>
      </View>

      {/* 内容滚动区 - flex: 1 占满中间 */}
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
        <TextInput ref={inputRef} style={styles.textInput}
          placeholder="你要BB什么？输入 # 添加标签" placeholderTextColor="#C4C4C4"
          value={content} onChangeText={setContent} multiline textAlignVertical="top" autoFocus={!isEditing}
          inputAccessoryViewID={Platform.OS === 'ios' ? INPUT_ACCESSORY_ID : undefined} />

        {currentTags.length > 0 && (
          <View style={styles.parsedTags}>
            {currentTags.map(tag => (
              <View key={tag} style={styles.parsedTag}>
                <Ionicons name="pricetag" size={11} color="#2563EB" />
                <Text style={styles.parsedTagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {attachments.length > 0 && (
          <View style={styles.attachmentGrid}>
            {attachments.map(att => (
              <View key={att.uid} style={styles.attachmentItem}>
                {att.type === 'image' ? (
                  <Image source={{ uri: att.url }} style={styles.attachmentImage} resizeMode="cover" />
                ) : (
                  <View style={styles.filePlaceholder}>
                    <Ionicons name={att.type === 'video' ? 'videocam' : att.type === 'audio' ? 'musical-notes' : 'document'} size={24} color="#9CA3AF" />
                    <Text style={styles.fileName} numberOfLines={1}>{att.originalFilename || att.filename || '附件'}</Text>
                  </View>
                )}
                <TouchableOpacity style={styles.removeBtn} onPress={() => setAttachments(prev => prev.filter(a => a.uid !== att.uid))}>
                  <Ionicons name="close" size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* 底部区域：快速标签 + 定位 + 工具栏，紧贴底部，统一背景色 */}
      {!keyboardVisible && <View style={[styles.bottomArea, { paddingBottom: insets.bottom || 12 }]}>{renderToolbarContent()}</View>}

      {/* iOS 键盘上方 */}
      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID={INPUT_ACCESSORY_ID}>{renderToolbarContent()}</InputAccessoryView>
      )}
    </View>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#F3F4F6',
    backgroundColor: '#fff',
  },
  cancelText: { fontSize: 16, color: '#6B7280' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#111827' },
  publishBtn: { backgroundColor: '#2563EB', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 8 },
  publishText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  scroll: { flex: 1, backgroundColor: '#fff' },
  bottomArea: { backgroundColor: '#FAFAFA', borderTopWidth: 0.5, borderTopColor: '#E5E7EB' },  textInput: { fontSize: 17, lineHeight: 28, color: '#1F2937', paddingHorizontal: 20, paddingTop: 16, minHeight: 180 },
  parsedTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 20, paddingBottom: 8 },
  parsedTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#EFF6FF', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5,
  },
  parsedTagText: { color: '#2563EB', fontSize: 13, fontWeight: '500' },
  attachmentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, paddingBottom: 12 },
  attachmentItem: { position: 'relative' },
  attachmentImage: { width: 80, height: 80, borderRadius: 10, backgroundColor: '#F3F4F6' },
  filePlaceholder: {
    width: 80, height: 80, borderRadius: 10, backgroundColor: '#F9FAFB',
    borderWidth: 1, borderColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center', padding: 4,
  },
  fileName: { fontSize: 9, color: '#9CA3AF', marginTop: 2, textAlign: 'center' },
  removeBtn: {
    position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center',
  },
  // 快速标签 - 紧贴工具栏上方
  quickTagBar: {
    backgroundColor: '#FAFAFA',
    paddingVertical: 8,
  },
  quickTagChip: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6,
  },
  quickTagText: { fontSize: 13, color: '#6B7280' },
  // 定位条 - 紧贴工具栏上方
  locationBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#FAFAFA',
  },
  locationText: { flex: 1, fontSize: 12, color: '#059669' },
  // 工具栏
  toolbar: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 8, paddingVertical: 8,
    backgroundColor: '#FAFAFA',
  },
  toolBtn: { padding: 8 },
  charCount: { fontSize: 13, color: '#D1D5DB', marginRight: 4 },
});
