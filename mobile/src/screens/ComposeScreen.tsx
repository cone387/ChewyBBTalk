import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Image,
  Platform, Keyboard, Dimensions,
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

const SCREEN_H = Dimensions.get('window').height;

export default function ComposeScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const dispatch = useAppDispatch();
  const { tags: existingTags } = useAppSelector(s => s.tag);
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();

  const editItem: BBTalk | undefined = route.params?.editItem;
  const isEditing = !!editItem;

  const [content, setContent] = useState(() => {
    if (!editItem) return '';
    return editItem.tags.map(t => `#${t.name} `).join('') + editItem.content;
  });
  const [cursorPos, setCursorPos] = useState(0);
  const [visibility, setVisibility] = useState<'public' | 'private'>((editItem?.visibility as any) || 'private');
  const [attachments, setAttachments] = useState<Attachment[]>(editItem?.attachments || []);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [showQuickTags, setShowQuickTags] = useState(false);
  const [keyboardH, setKeyboardH] = useState(0);

  useEffect(() => {
    if (existingTags.length === 0) dispatch(loadTags());
    const s1 = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setKeyboardH(e.endCoordinates.height));
    const s2 = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardH(0));
    return () => { s1.remove(); s2.remove(); };
  }, []);

  const parseTags = (t: string): string[] => [...new Set(Array.from(t.matchAll(/(?:^|\s)#([^\s#]+)\s/g)).map(m => m[1]))];
  const cleanContent = (t: string): string => t.replace(/(?:^|\s)#([^\s#]+)\s/g, ' ').trim();
  const currentTags = parseTags(content + ' ');

  const pickMedia = async (type: 'images' | 'videos') => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: type === 'images' ? ['images'] : ['videos'], allowsMultipleSelection: true, quality: 0.8 });
    if (r.canceled || !r.assets.length) return; setUploading(true);
    try { for (const a of r.assets) { const att = await attachmentApi.upload(a.uri, a.fileName || `m${Date.now()}.jpg`, a.mimeType || 'image/jpeg'); setAttachments(p => [...p, att]); } }
    catch (e: any) { Alert.alert('上传失败', e.message); } finally { setUploading(false); }
  };
  const pickFile = async () => {
    try { const r = await DocumentPicker.getDocumentAsync({ multiple: true }); if (r.canceled || !r.assets?.length) return; setUploading(true);
      for (const a of r.assets) { const att = await attachmentApi.upload(a.uri, a.name, a.mimeType || 'application/octet-stream'); setAttachments(p => [...p, att]); }
    } catch (e: any) { Alert.alert('上传失败', e.message); } finally { setUploading(false); }
  };
  const getLocation = async () => {
    if (location) { setLocation(null); return; }
    try { const { status } = await Location.requestForegroundPermissionsAsync(); if (status !== 'granted') { Alert.alert('提示', '需要定位权限'); return; }
      const l = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }); setLocation({ latitude: l.coords.latitude, longitude: l.coords.longitude });
    } catch { Alert.alert('定位失败', '请稍后重试'); }
  };

  const insertText = (s: string) => {
    const pos = cursorPos;
    const before = content.slice(0, pos);
    const after = content.slice(pos);
    setContent(before + s + after);
    setCursorPos(pos + s.length);
    setTimeout(() => inputRef.current?.focus(), 30);
  };
  const insertTag = (n: string) => {
    const pos = cursorPos;
    const before = content.slice(0, pos);
    const after = content.slice(pos);
    const p = before.length > 0 && !before.endsWith(' ') && !before.endsWith('\n') ? ' ' : '';
    const insert = `${p}#${n} `;
    setContent(before + insert + after);
    setCursorPos(pos + insert.length);
    setShowQuickTags(false);
    setTimeout(() => inputRef.current?.focus(), 30);
  };
  const mdInsert = (k: string) => { const m: Record<string, string> = { bold: '**粗体**', italic: '*斜体*', heading: '\n## ', list: '\n- ', code: '`代码`', codeblock: '\n```\n\n```\n', link: '[文字](url)', quote: '\n> ' }; insertText(m[k] || ''); };

  const handleSubmit = async () => {
    const cleaned = cleanContent(content); if (!cleaned) { Alert.alert('提示', '请输入内容'); return; }
    Keyboard.dismiss(); setSubmitting(true);
    try {
      const ctx: Record<string, any> = { source: { client: 'ChewyBBTalk Mobile', version: '1.0', platform: 'mobile' } }; if (location) ctx.location = location;
      if (isEditing && editItem) await dispatch(updateBBTalkAsync({ id: editItem.id, data: { content: cleaned, tags: currentTags.map(n => ({ id: '', name: n, color: '', sortOrder: 0, bbtalkCount: 0 })), visibility, attachments } })).unwrap();
      else await dispatch(createBBTalkAsync({ content: cleaned, tags: currentTags, visibility, attachments, context: ctx })).unwrap();
      dispatch(loadTags()); navigation.goBack();
    } catch (e: any) { Alert.alert('失败', e.message || '请重试'); } finally { setSubmitting(false); }
  };

  const canSubmit = cleanContent(content).length > 0 && !submitting && !uploading;

  // 计算工具栏高度（大约）
  const toolbarHeight = 44 + (showQuickTags ? 40 : 0) + (location ? 28 : 0) + 36; // main + tags + location + md
  const bottomPad = keyboardH > 0 ? 0 : (insets.bottom || 12);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.cancelText}>取消</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>{isEditing ? '编辑' : '发碎碎念'}</Text>
        <TouchableOpacity style={[styles.publishBtn, !canSubmit && { opacity: 0.4 }]} onPress={handleSubmit} disabled={!canSubmit}>
          {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.publishText}>{isEditing ? '更新' : '发布'}</Text>}
        </TouchableOpacity>
      </View>

      {/* 编辑区 - TextInput 自己滚动，填满可用空间 */}
      <View style={styles.editorArea}>
        <TextInput ref={inputRef} style={styles.textInput}
          placeholder="你要BB什么？支持 Markdown，输入 # 添加标签" placeholderTextColor="#C4C4C4"
          value={content} onChangeText={setContent} multiline textAlignVertical="top" autoFocus={!isEditing}
          onSelectionChange={(e) => setCursorPos(e.nativeEvent.selection.start)}
          scrollEnabled={true} />
      </View>

      {/* 附件预览 - 编辑区和工具栏之间 */}
      {attachments.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always"
          style={styles.attachmentBar} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {attachments.map(att => (
            <View key={att.uid} style={styles.attachmentItem}>
              {att.type === 'image' ? <Image source={{ uri: att.url }} style={styles.attachmentImage} resizeMode="cover" /> : (
                <View style={styles.filePlaceholder}><Ionicons name={att.type === 'video' ? 'videocam' : 'document'} size={20} color="#9CA3AF" /><Text style={styles.fileName} numberOfLines={1}>{att.originalFilename || '附件'}</Text></View>
              )}
              <TouchableOpacity style={styles.removeBtn} onPress={() => setAttachments(p => p.filter(a => a.uid !== att.uid))}><Ionicons name="close" size={12} color="#fff" /></TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      {/* 标签栏 + 字数 - 工具栏上方 */}
      <View style={styles.tagsBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always"
          style={{ flex: 1 }} contentContainerStyle={{ paddingLeft: 12, gap: 6 }}>
          {currentTags.map(tag => (
            <View key={tag} style={styles.parsedTag}>
              <Ionicons name="pricetag" size={11} color="#2563EB" />
              <Text style={styles.parsedTagText}>{tag}</Text>
              <TouchableOpacity onPress={() => {
                // 从内容中删除 #tag 
                setContent(prev => prev.replace(new RegExp(`(^|\\s)#${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s`, 'g'), '$1'));
              }} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                <Ionicons name="close-circle" size={14} color="#93C5FD" />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
        <View style={styles.charCountWrap}>
          {uploading && <ActivityIndicator size="small" color="#6B7280" />}
          <Text style={styles.charCount}>{cleanContent(content).length}</Text>
        </View>
      </View>

      {/* 工具栏 */}
      <View style={[styles.toolbarWrap, { paddingBottom: bottomPad, marginBottom: keyboardH }]}>
        {showQuickTags && existingTags.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" style={styles.quickTagBar} contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}>
            {existingTags.filter(t => !currentTags.includes(t.name)).slice(0, 15).map(tag => (
              <TouchableOpacity key={tag.id} style={styles.quickTagChip} onPress={() => insertTag(tag.name)}><Text style={styles.quickTagText}>#{tag.name}</Text></TouchableOpacity>
            ))}
          </ScrollView>
        )}
        {location && (
          <View style={styles.locationBar}><Ionicons name="location" size={14} color="#10B981" /><Text style={styles.locationText}>{location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}</Text>
            <TouchableOpacity onPress={() => setLocation(null)}><Ionicons name="close-circle" size={16} color="#C4C4C4" /></TouchableOpacity></View>
        )}
        <View style={styles.toolbarInner}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always"
            contentContainerStyle={styles.toolbarRow}>
            <TouchableOpacity style={styles.toolBtn} onPress={() => pickMedia('images')}><Ionicons name="image-outline" size={21} color="#6B7280" /></TouchableOpacity>
            <TouchableOpacity style={styles.toolBtn} onPress={() => pickMedia('videos')}><Ionicons name="videocam-outline" size={21} color="#6B7280" /></TouchableOpacity>
            <TouchableOpacity style={styles.toolBtn} onPress={pickFile}><Ionicons name="attach-outline" size={21} color="#6B7280" /></TouchableOpacity>
            <TouchableOpacity style={styles.toolBtn} onPress={() => {
              const pos = cursorPos;
              const before = content.slice(0, pos);
              const after = content.slice(pos);
              const prefix = before.length > 0 && !before.endsWith(' ') && !before.endsWith('\n') ? ' ' : '';
              const newContent = before + prefix + '#' + after;
              const newPos = pos + prefix.length + 1;
              setContent(newContent);
              setCursorPos(newPos);
              setShowQuickTags(true);
              setTimeout(() => inputRef.current?.focus(), 30);
            }}><Ionicons name="pricetag-outline" size={19} color={showQuickTags ? '#2563EB' : '#6B7280'} /></TouchableOpacity>
            <TouchableOpacity style={styles.toolBtn} onPress={getLocation}><Ionicons name="location-outline" size={19} color={location ? '#10B981' : '#6B7280'} /></TouchableOpacity>
            <TouchableOpacity style={styles.toolBtn} onPress={() => setVisibility(v => v === 'private' ? 'public' : 'private')}><Ionicons name={visibility === 'private' ? 'lock-closed-outline' : 'globe-outline'} size={19} color={visibility === 'public' ? '#2563EB' : '#6B7280'} /></TouchableOpacity>
            <View style={styles.toolDivider} />
            <TouchableOpacity style={styles.mdBtn} onPress={() => mdInsert('bold')}><Text style={styles.mdBold}>B</Text></TouchableOpacity>
            <TouchableOpacity style={styles.mdBtn} onPress={() => mdInsert('italic')}><Text style={styles.mdItalic}>I</Text></TouchableOpacity>
            <TouchableOpacity style={styles.mdBtn} onPress={() => mdInsert('heading')}><Text style={styles.mdBtnText}>H</Text></TouchableOpacity>
            <TouchableOpacity style={styles.mdBtn} onPress={() => mdInsert('list')}><Ionicons name="list" size={15} color="#6B7280" /></TouchableOpacity>
            <TouchableOpacity style={styles.mdBtn} onPress={() => mdInsert('quote')}><Ionicons name="chatbox-outline" size={15} color="#6B7280" /></TouchableOpacity>
            <TouchableOpacity style={styles.mdBtn} onPress={() => mdInsert('code')}><Ionicons name="code-slash" size={15} color="#6B7280" /></TouchableOpacity>
            <TouchableOpacity style={styles.mdBtn} onPress={() => mdInsert('link')}><Ionicons name="link-outline" size={15} color="#6B7280" /></TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </View>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#F3F4F6', backgroundColor: '#fff',
  },
  cancelText: { fontSize: 16, color: '#6B7280' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#111827' },
  publishBtn: { backgroundColor: '#2563EB', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 8 },
  publishText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  scroll: { flex: 1, backgroundColor: '#fff' },
  editorArea: { flex: 1, backgroundColor: '#fff' },
  textInput: { flex: 1, fontSize: 17, lineHeight: 28, color: '#1F2937', paddingHorizontal: 20, paddingTop: 16 },
  attachmentBar: { backgroundColor: '#fff', paddingVertical: 8, borderTopWidth: 0.5, borderTopColor: '#F3F4F6' },
  attachmentItem: { position: 'relative' },
  attachmentImage: { width: 60, height: 60, borderRadius: 8, backgroundColor: '#F3F4F6' },
  filePlaceholder: { width: 60, height: 60, borderRadius: 8, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center', padding: 2 },
  fileName: { fontSize: 8, color: '#9CA3AF', marginTop: 1, textAlign: 'center' },
  removeBtn: { position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  tagsBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingVertical: 6 },
  parsedTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EFF6FF', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  parsedTagText: { color: '#2563EB', fontSize: 13, fontWeight: '500' },
  charCountWrap: { paddingHorizontal: 12 },
  charCount: { fontSize: 12, color: '#D1D5DB' },
  toolbarWrap: { backgroundColor: '#FAFAFA', borderTopWidth: 0.5, borderTopColor: '#E5E7EB' },
  toolbarInner: { flexDirection: 'row', alignItems: 'center' },
  quickTagBar: { paddingVertical: 6 },
  quickTagChip: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5 },
  quickTagText: { fontSize: 13, color: '#6B7280' },
  locationBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 4 },
  locationText: { flex: 1, fontSize: 12, color: '#059669' },
  toolbarRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 8, gap: 4 },
  toolBtn: { padding: 7 },
  toolDivider: { width: 1, height: 20, backgroundColor: '#E5E7EB', marginHorizontal: 4 },
  mdBtn: { width: 30, height: 28, borderRadius: 6, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB' },
  mdBold: { fontSize: 13, fontWeight: '800', color: '#374151' },
  mdItalic: { fontSize: 13, fontWeight: '600', fontStyle: 'italic', color: '#374151' },
  mdBtnText: { fontSize: 12, fontWeight: '700', color: '#6B7280' },
});
