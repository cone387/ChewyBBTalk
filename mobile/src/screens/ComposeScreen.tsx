import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
  Platform, Keyboard, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import Markdown from 'react-native-markdown-display';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { createBBTalkAsync, updateBBTalkAsync } from '../store/slices/bbtalkSlice';
import { loadTags } from '../store/slices/tagSlice';
import { attachmentApi } from '../services/api/mediaApi';
import { getMarkdownStyles } from '../utils/markdownStyles';
import { useTheme } from '../theme/ThemeContext';
import type { Attachment, BBTalk } from '../types';
import VoiceRecordingOverlay from '../components/VoiceRecordingOverlay';

const SCREEN_H = Dimensions.get('window').height;

export default function ComposeScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const dispatch = useAppDispatch();
  const { tags: existingTags } = useAppSelector(s => s.tag);
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const c = theme.colors;

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
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [editMode, setEditMode] = useState<'edit' | 'preview'>('edit');
  const publishedRef = useRef(false);

  // 判断是否有未保存修改
  const hasUnsavedChanges = useCallback(() => {
    if (isEditing && editItem) {
      const originalContent = editItem.tags.map(t => `#${t.name} `).join('') + editItem.content;
      return content !== originalContent ||
             visibility !== editItem.visibility ||
             JSON.stringify(attachments.map(a => a.uid)) !== JSON.stringify(editItem.attachments.map(a => a.uid));
    }
    return content.trim().length > 0 || attachments.length > 0;
  }, [content, visibility, attachments, editItem, isEditing]);

  useEffect(() => {
    if (existingTags.length === 0) dispatch(loadTags());
    const s1 = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setKeyboardH(e.endCoordinates.height));
    const s2 = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardH(0));

    // 新建模式：加载草稿
    if (!isEditing) {
      AsyncStorage.getItem('compose_draft').then(draft => {
        if (draft) setContent(draft);
      });
    }

    return () => { s1.remove(); s2.remove(); };
  }, []);

  // 新建模式：离开时自动保存草稿（发布成功后不保存）
  // 编辑退出确认：有未保存修改时拦截返回操作
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      // 已发布成功，跳过确认，清理草稿
      if (publishedRef.current) return;

      // 无未保存修改，保存/清理草稿后直接返回
      if (!hasUnsavedChanges()) {
        if (!isEditing) {
          AsyncStorage.removeItem('compose_draft');
        }
        return;
      }

      // 有未保存修改，拦截返回并显示确认对话框
      e.preventDefault();
      Alert.alert('放弃编辑？', '你有未保存的内容，确定要放弃吗？', [
        { text: '继续编辑', style: 'cancel' },
        {
          text: '放弃',
          style: 'destructive',
          onPress: () => {
            // 新建模式下放弃时保存草稿
            if (!isEditing) {
              if (content.trim()) {
                AsyncStorage.setItem('compose_draft', content);
              } else {
                AsyncStorage.removeItem('compose_draft');
              }
            }
            navigation.dispatch(e.data.action);
          },
        },
      ]);
    });
    return unsubscribe;
  }, [navigation, hasUnsavedChanges, content, isEditing]);

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

  const handleVoiceFinish = async (result: { text: string; audioUri: string | null; audioDuration: number }) => {
    setVoiceRecording(false);
    const { text, audioUri } = result;

    // Append transcribed text to content
    if (text) {
      const sep = content.trim() ? '\n' : '';
      setContent(prev => prev + sep + text);
    }

    // Upload audio as attachment
    if (audioUri) {
      setUploading(true);
      try {
        const ext = Platform.OS === 'ios' ? 'm4a' : (Platform.OS === 'web' ? 'webm' : '3gp');
        const mime = Platform.OS === 'ios' ? 'audio/mp4' : (Platform.OS === 'web' ? 'audio/webm' : 'audio/3gpp');
        let att: Attachment;
        if (Platform.OS === 'web') {
          const blob = await (await fetch(audioUri)).blob();
          const file = new File([blob], `voice_${Date.now()}.${ext}`, { type: mime });
          att = await attachmentApi.uploadFile(file);
        } else {
          att = await attachmentApi.upload(audioUri, `voice_${Date.now()}.${ext}`, mime);
        }
        setAttachments(prev => [...prev, att]);
      } catch (e: any) {
        Alert.alert('上传失败', e.message || '音频上传失败');
      } finally {
        setUploading(false);
      }
    }
  };

  const handleSubmit = async () => {
    const cleaned = cleanContent(content); if (!cleaned) { Alert.alert('提示', '请输入内容'); return; }
    Keyboard.dismiss(); setSubmitting(true);
    try {
      const ctx: Record<string, any> = { source: { client: 'ChewyBBTalk Mobile', version: '1.0', platform: 'mobile' } }; if (location) ctx.location = location;
      if (isEditing && editItem) await dispatch(updateBBTalkAsync({ id: editItem.id, data: { content: cleaned, tags: currentTags.map(n => ({ id: '', name: n, color: '', sortOrder: 0, bbtalkCount: 0 })), visibility, attachments } })).unwrap();
      else await dispatch(createBBTalkAsync({ content: cleaned, tags: currentTags, visibility, attachments, context: ctx })).unwrap();
      dispatch(loadTags()); await AsyncStorage.removeItem('compose_draft'); publishedRef.current = true; navigation.goBack();
    } catch (e: any) { Alert.alert('失败', e.message || '请重试'); } finally { setSubmitting(false); }
  };

  const canSubmit = cleanContent(content).length > 0 && !submitting && !uploading;

  // 计算工具栏高度（大约）
  const toolbarHeight = 44 + (showQuickTags ? 40 : 0) + (location ? 28 : 0) + 36; // main + tags + location + md
  const bottomPad = keyboardH > 0 ? 0 : (insets.bottom || 12);

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: c.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: c.headerBg, borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={[styles.cancelText, { color: c.textSecondary }]}>取消</Text></TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: c.text }]}>{isEditing ? '编辑' : '发碎碎念'}</Text>
          <TouchableOpacity
            style={styles.modeToggleBtn}
            onPress={() => {
              if (editMode === 'edit') {
                Keyboard.dismiss();
              }
              setEditMode(m => m === 'edit' ? 'preview' : 'edit');
            }}
            accessibilityLabel={editMode === 'edit' ? '切换到预览模式' : '切换到编辑模式'}
          >
            <Ionicons
              name={editMode === 'edit' ? 'eye-outline' : 'create-outline'}
              size={20}
              color={theme.colors.primary}
            />
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={[styles.publishBtn, { backgroundColor: c.primary }, !canSubmit && { opacity: 0.4 }]} onPress={handleSubmit} disabled={!canSubmit}>
          {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.publishText}>{isEditing ? '更新' : '发布'}</Text>}
        </TouchableOpacity>
      </View>

      {/* 编辑区 / 预览区 */}
      {editMode === 'edit' ? (
        <View style={[styles.editorArea, { backgroundColor: c.surface }]}>
          <TextInput ref={inputRef} style={[styles.textInput, { color: c.text }]}
            placeholder="你要BB什么？支持 Markdown，输入 # 添加标签" placeholderTextColor={c.textTertiary}
            value={content} onChangeText={setContent} multiline textAlignVertical="top" autoFocus={!isEditing}
            onSelectionChange={(e) => setCursorPos(e.nativeEvent.selection.start)}
            scrollEnabled={true} />
        </View>
      ) : (
        <ScrollView style={[styles.previewArea, { backgroundColor: c.surface }]} contentContainerStyle={styles.previewContent}>
          {content.trim().length > 0 ? (
            <Markdown style={getMarkdownStyles(theme.colors)}>
              {content}
            </Markdown>
          ) : (
            <Text style={[styles.previewPlaceholder, { color: theme.colors.textTertiary }]}>
              暂无内容可预览
            </Text>
          )}
        </ScrollView>
      )}

      {/* 附件 + 标签 + 字数 + 工具栏 - 仅编辑模式显示 */}
      {editMode === 'edit' && (
        <>
        <View style={[styles.bottomInfo, { backgroundColor: c.surface }]}>
        {/* 附件预览 */}
        {attachments.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always"
            contentContainerStyle={{ paddingHorizontal: 12, gap: 8, paddingVertical: 6 }}>
            {attachments.map(att => (
              <View key={att.uid} style={styles.attachmentItem}>
                {att.type === 'image' ? <Image source={att.url} style={[styles.attachmentImage, { backgroundColor: c.borderLight }]} contentFit="cover" /> : (
                  <View style={[styles.filePlaceholder, { backgroundColor: c.borderLight, borderColor: c.border }]}><Ionicons name={att.type === 'video' ? 'videocam' : 'document'} size={20} color={c.textTertiary} /><Text style={[styles.fileName, { color: c.textTertiary }]} numberOfLines={1}>{att.originalFilename || '附件'}</Text></View>
                )}
                <TouchableOpacity style={styles.removeBtn} onPress={() => setAttachments(p => p.filter(a => a.uid !== att.uid))}><Ionicons name="close" size={12} color="#fff" /></TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        {/* 标签 + 字数 */}
        <View style={styles.tagsRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always"
          style={{ flex: 1 }} contentContainerStyle={{ paddingLeft: 12, gap: 6 }}>
          {currentTags.map(tag => (
            <View key={tag} style={[styles.parsedTag, { backgroundColor: c.primaryLight }]}>
              <Ionicons name="pricetag" size={11} color={c.primary} />
              <Text style={[styles.parsedTagText, { color: c.primary }]}>{tag}</Text>
              <TouchableOpacity onPress={() => {
                // 从内容中删除 #tag 
                setContent(prev => prev.replace(new RegExp(`(^|\\s)#${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s`, 'g'), '$1'));
              }} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                <Ionicons name="close-circle" size={14} color={c.primary + '80'} />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
        <View style={styles.charCountWrap}>
          {uploading && <ActivityIndicator size="small" color={c.textSecondary} />}
          <Text style={[styles.charCount, { color: c.textTertiary }]}>{cleanContent(content).length}</Text>
        </View>
        </View>
      </View>

      {/* 工具栏 */}
      <View style={[styles.toolbarWrap, { backgroundColor: c.surfaceSecondary, borderTopColor: c.border, paddingBottom: bottomPad, marginBottom: keyboardH }]}>
        {showQuickTags && existingTags.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" style={styles.quickTagBar} contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}>
            {existingTags.filter(t => !currentTags.includes(t.name)).slice(0, 15).map(tag => (
              <TouchableOpacity key={tag.id} style={[styles.quickTagChip, { backgroundColor: c.surface, borderColor: c.border }]} onPress={() => insertTag(tag.name)}><Text style={[styles.quickTagText, { color: c.textSecondary }]}>#{tag.name}</Text></TouchableOpacity>
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
            <TouchableOpacity style={styles.toolBtn} onPress={() => pickMedia('images')}><Ionicons name="image-outline" size={21} color={c.textSecondary} /></TouchableOpacity>
            <TouchableOpacity style={styles.toolBtn} onPress={() => pickMedia('videos')}><Ionicons name="videocam-outline" size={21} color={c.textSecondary} /></TouchableOpacity>
            <TouchableOpacity style={styles.toolBtn} onPress={pickFile}><Ionicons name="attach-outline" size={21} color={c.textSecondary} /></TouchableOpacity>
            <TouchableOpacity style={styles.toolBtn} onPress={() => setVoiceRecording(true)}><Ionicons name="mic-outline" size={21} color={c.textSecondary} /></TouchableOpacity>
            <TouchableOpacity style={styles.toolBtn} onPress={() => {
              if (showQuickTags) {
                // 第二次点击：隐藏快速标签
                setShowQuickTags(false);
              } else {
                // 第一次点击：插入 # + 显示快速标签
                const pos = cursorPos;
                const before = content.slice(0, pos);
                const after = content.slice(pos);
                const prefix = before.length > 0 && !before.endsWith(' ') && !before.endsWith('\n') ? ' ' : '';
                const newContent = before + prefix + '#' + after;
                setContent(newContent);
                setCursorPos(pos + prefix.length + 1);
                setShowQuickTags(true);
              }
              setTimeout(() => inputRef.current?.focus(), 30);
            }}><Ionicons name="pricetag-outline" size={19} color={showQuickTags ? c.primary : c.textSecondary} /></TouchableOpacity>
            <TouchableOpacity style={styles.toolBtn} onPress={getLocation}><Ionicons name="location-outline" size={19} color={location ? '#10B981' : c.textSecondary} /></TouchableOpacity>
            <TouchableOpacity style={styles.toolBtn} onPress={() => setVisibility(v => v === 'private' ? 'public' : 'private')}><Ionicons name={visibility === 'private' ? 'lock-closed-outline' : 'globe-outline'} size={19} color={visibility === 'public' ? c.primary : c.textSecondary} /></TouchableOpacity>
            <View style={[styles.toolDivider, { backgroundColor: c.border }]} />
            <TouchableOpacity style={[styles.mdBtn, { backgroundColor: c.surface, borderColor: c.border }]} onPress={() => mdInsert('bold')}><Text style={[styles.mdBold, { color: c.text }]}>B</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.mdBtn, { backgroundColor: c.surface, borderColor: c.border }]} onPress={() => mdInsert('italic')}><Text style={[styles.mdItalic, { color: c.text }]}>I</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.mdBtn, { backgroundColor: c.surface, borderColor: c.border }]} onPress={() => mdInsert('heading')}><Text style={[styles.mdBtnText, { color: c.textSecondary }]}>H</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.mdBtn, { backgroundColor: c.surface, borderColor: c.border }]} onPress={() => mdInsert('list')}><Ionicons name="list" size={15} color={c.textSecondary} /></TouchableOpacity>
            <TouchableOpacity style={[styles.mdBtn, { backgroundColor: c.surface, borderColor: c.border }]} onPress={() => mdInsert('quote')}><Ionicons name="chatbox-outline" size={15} color={c.textSecondary} /></TouchableOpacity>
            <TouchableOpacity style={[styles.mdBtn, { backgroundColor: c.surface, borderColor: c.border }]} onPress={() => mdInsert('code')}><Ionicons name="code-slash" size={15} color={c.textSecondary} /></TouchableOpacity>
            <TouchableOpacity style={[styles.mdBtn, { backgroundColor: c.surface, borderColor: c.border }]} onPress={() => mdInsert('link')}><Ionicons name="link-outline" size={15} color={c.textSecondary} /></TouchableOpacity>
          </ScrollView>
        </View>
      </View>
        </>
      )}

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
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5,
  },
  cancelText: { fontSize: 16 },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modeToggleBtn: { padding: 4 },
  publishBtn: { borderRadius: 20, paddingHorizontal: 18, paddingVertical: 8 },
  publishText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  scroll: { flex: 1 },
  editorArea: { flex: 1 },
  textInput: { flex: 1, fontSize: 17, lineHeight: 28, paddingHorizontal: 20, paddingTop: 16 },
  previewArea: { flex: 1 },
  previewContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  previewPlaceholder: { fontSize: 16, fontStyle: 'italic', textAlign: 'center', marginTop: 60 },
  bottomInfo: { },
  tagsRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  attachmentItem: { position: 'relative' },
  attachmentImage: { width: 60, height: 60, borderRadius: 8 },
  filePlaceholder: { width: 60, height: 60, borderRadius: 8, borderWidth: 1, justifyContent: 'center', alignItems: 'center', padding: 2 },
  fileName: { fontSize: 8, marginTop: 1, textAlign: 'center' },
  removeBtn: { position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  parsedTag: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  parsedTagText: { fontSize: 13, fontWeight: '500' },
  charCountWrap: { paddingHorizontal: 12 },
  charCount: { fontSize: 12 },
  toolbarWrap: { borderTopWidth: 0.5 },
  toolbarInner: { flexDirection: 'row', alignItems: 'center' },
  quickTagBar: { paddingVertical: 6 },
  quickTagChip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5 },
  quickTagText: { fontSize: 13 },
  locationBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 4 },
  locationText: { flex: 1, fontSize: 12, color: '#059669' },
  toolbarRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 8, gap: 4 },
  toolBtn: { padding: 7 },
  toolDivider: { width: 1, height: 20, marginHorizontal: 4 },
  mdBtn: { width: 30, height: 28, borderRadius: 6, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  mdBold: { fontSize: 13, fontWeight: '800' },
  mdItalic: { fontSize: 13, fontWeight: '600', fontStyle: 'italic' },
  mdBtnText: { fontSize: 12, fontWeight: '700' },
});
