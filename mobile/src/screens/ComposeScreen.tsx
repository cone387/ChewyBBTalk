import DraftStatus from '../components/DraftStatus';
import { beginSubmission, readSubmission, confirmSubmission, forgetConfirmedSubmission, type SubmissionIntent } from '../services/submissions';
import { bbtalkApi, transformBBTalk } from '../services/api/bbtalkApi';
import { getSession, isCurrentSession } from '../services/session';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator,
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
import { useNavigation, useRoute, usePreventRemove } from '@react-navigation/native';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { createBBTalkAsync, updateBBTalkAsync } from '../store/slices/bbtalkSlice';
import { loadTags } from '../store/slices/tagSlice';
import { attachmentApi } from '../services/api/mediaApi';
import { getMarkdownStyles } from '../utils/markdownStyles';
import { useTheme } from '../theme/ThemeContext';
import type { Attachment, BBTalk } from '../types';
import { buildImageSource } from '../utils/imageSource';
import VoiceRecordingOverlay from '../components/VoiceRecordingOverlay';
import { useHoldToRecord } from '../hooks/useHoldToRecord';
import { xAlert, xConfirm, xActionSheet } from '../utils/crossAlert';
import { useDraftAutosave } from '../hooks/useDraftAutosave';
import { readDraft, writeDraft } from '../services/drafts';
import { retainMedia, uploadRetainedMedia, pruneRetainedMedia, type PendingMedia } from '../services/pendingMedia';
import { confirmPublicVisibility } from '../utils/confirmPublicVisibility';
import { COMPOSE_TOOLBAR_LABELS } from '../utils/composeToolbarLabels';

// expo-audio hook — 在 native 端使用，web 端返回 null
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
function useNativeAudioPlayer(url: string) {
  // useAudioPlayer 在所有平台都可调用，但 web 上行为可能不一致
  // 这里统一调用以满足 hooks 规则，web 端不使用返回值
  return useAudioPlayer(url);
}

const SCREEN_H = Dimensions.get('window').height;

/** 60×60 音频卡片，点击播放/暂停 */
function CompactAudioCard({ attachment, colors: c }: { attachment: Attachment; colors: any }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<any>(null); // Web fallback

  // Native: 使用 expo-audio 的 useAudioPlayer
  // Web: 用 HTML5 Audio（useAudioPlayer 在 web 上也可用但行为不一致）
  const nativePlayer = useNativeAudioPlayer(attachment.url);

  useEffect(() => {
    return () => { audioRef.current?.pause?.(); };
  }, []);

  const toggle = async () => {
    if (Platform.OS === 'web') {
      if (!audioRef.current) {
        const audio = new window.Audio(attachment.url);
        audio.onended = () => setPlaying(false);
        audio.onerror = () => setPlaying(false);
        audioRef.current = audio;
      }
      if (playing) { audioRef.current.pause(); setPlaying(false); }
      else { audioRef.current.play().catch(() => setPlaying(false)); setPlaying(true); }
    } else if (nativePlayer) {
      try {
        await setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
        if (playing) { nativePlayer.pause(); setPlaying(false); }
        else { nativePlayer.play(); setPlaying(true); }
      } catch (e) {
        console.warn('Audio playback error:', e);
        setPlaying(false);
      }
    }
  };

  return (
    <TouchableOpacity
      style={[compactStyles.card, { backgroundColor: c.borderLight, borderColor: c.border }]}
      activeOpacity={0.7} onPress={toggle}
    >
      <Ionicons name={playing ? 'pause' : 'play'} size={22} color={c.primary} />
      <Text style={[compactStyles.label, { color: c.textTertiary }]} numberOfLines={1}>录音</Text>
    </TouchableOpacity>
  );
}

/** 60×60 视频卡片，点击打开播放 */
function CompactVideoCard({ attachment, colors: c }: { attachment: Attachment; colors: any }) {
  return (
    <TouchableOpacity
      style={[compactStyles.card, { backgroundColor: c.borderLight, borderColor: c.border }]}
      activeOpacity={0.7}
      onPress={() => {
        if (Platform.OS === 'web') {
          window.open(attachment.url, '_blank');
        } else {
          const { Linking } = require('react-native');
          Linking.openURL(attachment.url);
        }
      }}
    >
      <Ionicons name="videocam" size={22} color={c.primary} />
      <Text style={[compactStyles.label, { color: c.textTertiary }]} numberOfLines={1}>视频</Text>
    </TouchableOpacity>
  );
}

const compactStyles = StyleSheet.create({
  card: {
    width: 60, height: 60, borderRadius: 8, borderWidth: 1,
    justifyContent: 'center', alignItems: 'center', gap: 2,
  },
  label: { fontSize: 9 },
});

export default function ComposeScreen({ lockedCapture = false, onRequestUnlock }: { lockedCapture?: boolean; onRequestUnlock?: () => void } = {}) {
  const session = useRef(getSession()).current;
  const regularDraftKey = `compose_draft:${session.scope ?? 'signed-out'}`;
  const captureId = useRef(`${Date.now()}_${Math.random().toString(36).slice(2)}`).current;
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const dispatch = useAppDispatch();
  const { tags: existingTags } = useAppSelector(s => s.tag);
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const c = theme.colors;

  const editItem: BBTalk | undefined = lockedCapture ? undefined : route.params?.editItem;
  const isEditing = !!editItem;
  useEffect(() => { void pruneRetainedMedia(session); }, [session]);
  const [draftKey, setDraftKey] = useState(lockedCapture ? `${regularDraftKey}:locked:${captureId}` : editItem ? `${regularDraftKey}:edit:${editItem.id}` : regularDraftKey);
  const [pendingMedia, setPendingMedia] = useState<PendingMedia[]>([]);
  const [uploadError, setUploadError] = useState('');
  const uploadBusy = useRef(false);
  const [showMoreTools, setShowMoreTools] = useState(false);
  const leavingRef = useRef(false);

  const [content, setContent] = useState(() => {
    if (!editItem) return '';
    return editItem.tags.map(t => `#${t.name} `).join('') + editItem.content;
  });
  const [cursorPos, setCursorPos] = useState(0);
  const [visibility, setVisibility] = useState<'public' | 'private'>((editItem?.visibility as any) || 'private');
  const [attachments, setAttachments] = useState<Attachment[]>(editItem?.attachments || []);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>((editItem?.context?.location as { latitude: number; longitude: number }) || null);
  const [showQuickTags, setShowQuickTags] = useState(false);
  const [keyboardH, setKeyboardH] = useState(0);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const holdRecording = useHoldToRecord(() => { Keyboard.dismiss(); setVoiceRecording(true); }, voiceRecording || uploading || submitting, () => { Keyboard.dismiss(); setVoiceRecording(true); });
  const [editMode, setEditMode] = useState<'edit' | 'preview'>('edit');
  const publishedRef = useRef(false);
  const submittingRef = useRef(false);
  const [submission, setSubmission] = useState<SubmissionIntent>();
  const [submissionReady, setSubmissionReady] = useState(isEditing || lockedCapture);
  const [draftReady, setDraftReady] = useState(lockedCapture);
  const [submissionMessage, setSubmissionMessage] = useState('');
  const [baseUpdatedAt, setBaseUpdatedAt] = useState(editItem?.updatedAt);
  useEffect(() => {
    if (isEditing || lockedCapture) return;
    let cancelled = false;
    readSubmission(session).then(saved => {
      if (!cancelled && isCurrentSession(session)) { setSubmission(saved); setSubmissionReady(true); }
    }).catch(() => {
      if (!cancelled) setSubmissionMessage('无法读取原提交，请保留输入并重新打开编辑器。');
    });
    return () => { cancelled = true; };
  }, [isEditing, session]);

  const recoverSubmission = async (retry: boolean) => {
    if (!submission || !draftReady || submittingRef.current || !isCurrentSession(session)) return;
    submittingRef.current = true; setSubmitting(true);
    try {
      // Persist the current editor separately before resolving the original submission.
      await writeDraft(draftKey, { version: 1, content, visibility, attachments, location, pendingMedia, baseUpdatedAt }, session);
      if (!isCurrentSession(session)) return;
      if (retry) await dispatch(createBBTalkAsync({ ...submission.payload, submissionKey: submission.key })).unwrap();
      else await bbtalkApi.submissionStatus(submission.key);
      await confirmSubmission(submission.key, session);
      setSubmission({ ...submission, state: 'confirmed' });
      setSubmissionMessage('已确认原提交发布成功，当前输入仍保留。修改后可发布新记录。');
      dispatch(loadTags());
    } catch (error: any) {
      if (!isCurrentSession(session)) return;
      if (error.status === 410) {
        try {
          await confirmSubmission(submission.key, session);
          setSubmission({ ...submission, state: 'confirmed' });
        } catch { /* Retain the original identity on storage failure. */ }
        setSubmissionMessage('原提交的记录已删除，不会重新创建。');
      } else setSubmissionMessage(error.status === 404
        ? '暂未查到结果，可重试原提交；当前输入仍保留。'
        : '保存当前草稿或核对失败，原提交仍保留。请保留编辑器中的输入后重试。');
    } finally { submittingRef.current = false; setSubmitting(false); }
  };

  const draftValue = React.useMemo(() => isEditing || content.trim() || attachments.length || pendingMedia.length ? { version: 1, content, visibility, attachments, location, pendingMedia, baseUpdatedAt } : null, [content, visibility, attachments, location, pendingMedia, baseUpdatedAt, isEditing]);
  const latestDraft = useRef(draftValue); latestDraft.current = draftValue;
  const autosave = useDraftAutosave(draftKey, draftValue, draftReady, session);

  // 判断是否有未保存修改
  const hasUnsavedChanges = useCallback(() => {
    if (isEditing && editItem) {
      const originalContent = editItem.tags.map(t => `#${t.name} `).join('') + editItem.content;
      return content !== originalContent ||
             visibility !== editItem.visibility ||
             JSON.stringify(attachments.map(a => a.uid)) !== JSON.stringify(editItem.attachments.map(a => a.uid)) || pendingMedia.length > 0 || JSON.stringify(location) !== JSON.stringify(editItem.context?.location || null);
    }
    return content.trim().length > 0 || attachments.length > 0 || pendingMedia.length > 0;
  }, [content, visibility, attachments, editItem, isEditing, pendingMedia, location]);

  useEffect(() => {
    if (!lockedCapture && existingTags.length === 0) dispatch(loadTags());
    const s1 = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setKeyboardH(e.endCoordinates.height));
    const s2 = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardH(0));

    // 新建模式：加载草稿，兼容旧版纯正文。
    let cancelled = false;
    if (!lockedCapture) {
      (async () => {
        const regular = await readDraft(draftKey);
        if (regular || isEditing) return regular;
        // Recover locked captures only inside the regular, unlocked editor.
        const keys = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith(`${regularDraftKey}:locked:`)).sort();
        if (!keys.length || cancelled || !isCurrentSession(session)) return null;
        setDraftKey(keys[0]);
        return readDraft(keys[0]);
      })().then(draft => {
        if (cancelled || !isCurrentSession(session)) return;
        if (draft) {
          let saved: any;
          try { saved = JSON.parse(draft); } catch { /* Legacy plain text. */ }
          if (saved?.version === 1 && typeof saved.content === 'string' && Array.isArray(saved.attachments)) {
            setContent(saved.content);
            setVisibility(saved.visibility === 'public' ? 'public' : 'private');
            setAttachments(saved.attachments);
            setLocation(saved.location || null);
            setPendingMedia(Array.isArray(saved.pendingMedia) ? saved.pendingMedia.filter((item: any) => typeof item?.id === 'string' && typeof item?.uri === 'string' && typeof item?.name === 'string' && typeof item?.mime === 'string') : []);
            if (saved.baseUpdatedAt) setBaseUpdatedAt(saved.baseUpdatedAt);
          } else setContent(draft);
        }
        setDraftReady(true);
      }).catch(() => {
        if (!cancelled) setSubmissionMessage('无法读取草稿，请重新打开编辑器后重试。');
      });
    }

    return () => { cancelled = true; s1.remove(); s2.remove(); };
  }, []);

  usePreventRemove(!lockedCapture && (submitting || uploading || hasUnsavedChanges()), ({ data }) => {
    if (publishedRef.current || leavingRef.current || !isCurrentSession(session)) { navigation.dispatch(data.action); return; }
    if (submittingRef.current || uploadBusy.current) return;
    xActionSheet('离开编辑器', [{ text: '保存草稿并退出' }, { text: '丢弃修改', destructive: true }], async index => {
      if (index === 2 || !isCurrentSession(session)) return;
      try {
        if (index === 0) await autosave.save();
        else await autosave.clear();
        leavingRef.current = true;
        navigation.dispatch(data.action);
      } catch { xAlert('草稿保存失败', '当前内容仍保留，请重试后再退出。'); }
    }, '继续编辑');
  });

  const requestUnlock = async () => {
    if (submittingRef.current || uploading || !isCurrentSession(session)) return;
    try {
      if (hasUnsavedChanges()) {
        await writeDraft(draftKey, { version: 1, content, visibility, attachments, location, pendingMedia, baseUpdatedAt }, session);
      } else await writeDraft(draftKey, null, session);
      if (isCurrentSession(session)) onRequestUnlock?.();
    } catch {
      setSubmissionMessage('草稿保存失败，请重试；当前输入仍保留。');
    }
  };

  const parseTags = (t: string): string[] => [...new Set(Array.from(t.matchAll(/(?:^|\s)#([^\s#]+)\s/g)).map(m => m[1]))];
  const cleanContent = (t: string): string => t.replace(/(?:^|\s)#([^\s#]+)\s/g, ' ').trim();
  const currentTags = parseTags(content + ' ');

  const uploadPending = async (items: PendingMedia[] = pendingMedia) => {
    if (uploadBusy.current || !isCurrentSession(session)) return;
    uploadBusy.current = true; setUploading(true); setUploadError('');
    try {
      for (const item of items) {
        const att = await uploadRetainedMedia(item, session);
        if (!isCurrentSession(session)) return;
        const snapshot = latestDraft.current;
        if (!snapshot) throw new Error('草稿不可用');
        const next = { ...snapshot, attachments: [...snapshot.attachments, att], pendingMedia: snapshot.pendingMedia.filter(p => p.id !== item.id) };
        await writeDraft(draftKey, next, session);
        latestDraft.current = next;
        setAttachments(next.attachments);
        setPendingMedia(next.pendingMedia);
      }
    } catch { setUploadError('上传未完成，附件已保留在本机。联网后可重试。'); }
    finally { uploadBusy.current = false; setUploading(false); }
  };
  const addMedia = async (assets: { uri: string; name: string; mime: string }[]) => {
    if (uploadBusy.current) return;
    uploadBusy.current = true; setUploading(true);
    const retained: PendingMedia[] = [];
    try {
      for (const asset of assets) {
        const item = await retainMedia(asset.uri, asset.name, asset.mime, session);
        retained.push(item);
        const next = { ...latestDraft.current, version: 1, content: latestDraft.current?.content ?? content, visibility, attachments: latestDraft.current?.attachments || attachments, location, pendingMedia: [...pendingMedia, ...retained], baseUpdatedAt };
        latestDraft.current = next;
        setPendingMedia(next.pendingMedia);
        await writeDraft(draftKey, next, session);
      }
    } catch (error: any) { setUploadError(error.message || '无法保存附件，请重试'); return; }
    finally { uploadBusy.current = false; setUploading(false); }
    if (retained.length) await uploadPending(retained);
  };
  const pickMedia = async (type: 'images' | 'videos') => {
    try {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: type === 'images' ? ['images'] : ['videos'], allowsMultipleSelection: true, quality: 0.8 });
      if (!r.canceled && r.assets.length) await addMedia(r.assets.map(a => ({ uri: a.uri, name: a.fileName || `media_${Date.now()}.${type === 'images' ? 'jpg' : 'mp4'}`, mime: a.mimeType || (type === 'images' ? 'image/jpeg' : 'video/mp4') })));
    } catch { xAlert('无法打开相册', '请检查照片权限后重试'); }
  };
  const takePhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { xAlert('需要相机权限', '可在系统设置中允许相机访问，也可以从相册添加照片。'); return; }
      const r = await ImagePicker.launchCameraAsync({ quality: 0.8 });
      if (!r.canceled) await addMedia(r.assets.map(a => ({ uri: a.uri, name: a.fileName || `photo_${Date.now()}.jpg`, mime: a.mimeType || 'image/jpeg' })));
    } catch { xAlert('无法拍照', '请稍后重试'); }
  };
  const pickFile = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      if (!r.canceled) await addMedia(r.assets.map(a => ({ uri: a.uri, name: a.name, mime: a.mimeType || 'application/octet-stream' })));
    } catch { xAlert('无法打开文件', '请重新选择文件'); }
  };
  const getLocation = async () => {
    if (location) { setLocation(null); return; }
    try { const { status } = await Location.requestForegroundPermissionsAsync(); if (status !== 'granted') { xAlert('提示', '需要定位权限'); return; }
      const l = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }); setLocation({ latitude: l.coords.latitude, longitude: l.coords.longitude });
    } catch { xAlert('定位失败', '请稍后重试'); }
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

    if (audioUri) {
      const ext = Platform.OS === 'ios' ? 'm4a' : Platform.OS === 'web' ? 'webm' : '3gp';
      await addMedia([{ uri: audioUri, name: `voice_${Date.now()}.${ext}`, mime: Platform.OS === 'ios' ? 'audio/mp4' : Platform.OS === 'web' ? 'audio/webm' : 'audio/3gpp' }]);
    }
  };

  const incomingVoice = useRef(false);
  useEffect(() => {
    if (!draftReady || lockedCapture || incomingVoice.current || !route.params?.voiceResult) return;
    incomingVoice.current = true;
    void handleVoiceFinish(route.params.voiceResult).then(() => navigation.setParams?.({ voiceResult: undefined }));
  }, [draftReady]);

  const handleSubmit = async () => {
    if (submittingRef.current || uploading || pendingMedia.length > 0 || !submissionReady || !draftReady || !isCurrentSession(session)) return;
    const cleaned = cleanContent(content) || (attachments.length ? '附件记录' : ''); if (!cleaned) { xAlert('提示', '请输入内容'); return; }
    submittingRef.current = true; Keyboard.dismiss(); setSubmitting(true);
    try {
      await autosave.save();
      const ctx: Record<string, any> = { ...editItem?.context, source: { client: 'ChewyBBTalk Mobile', version: '1.0', platform: 'mobile' } }; if (location) ctx.location = location; else delete ctx.location;
      let intent: SubmissionIntent | undefined;
      if (isEditing && editItem) {
        await dispatch(updateBBTalkAsync({ id: editItem.id, expectedUpdatedAt: baseUpdatedAt, data: { content: cleaned, tags: currentTags.map(n => ({ id: '', name: n, color: '', sortOrder: 0, bbtalkCount: 0 })), visibility, attachments, context: ctx } })).unwrap();
      } else {
        intent = await beginSubmission({ content: cleaned, tags: currentTags, visibility, attachments, context: ctx }, session);
        setSubmission(intent);
        if (!isCurrentSession(session)) return;
        await dispatch(createBBTalkAsync({ ...intent.payload, submissionKey: intent.key })).unwrap();
      }
      if (!isCurrentSession(session)) return;
      dispatch(loadTags());
      try {
        if (intent) {
          await confirmSubmission(intent.key, session);
          setSubmission({ ...intent, state: 'confirmed' });
        }
        await autosave.clear();
        if (intent) await forgetConfirmedSubmission(intent.key, session);
      } catch {
        setSubmissionMessage('发布成功，但本地清理失败。请核对原提交，避免重复发布。');
        return;
      }
      if (lockedCapture) {
        setContent(''); setAttachments([]); setPendingMedia([]); autosave.resume(); setLocation(null); setVisibility('private');
        setCursorPos(0); setEditMode('edit'); setSubmission(undefined);
        setSubmissionMessage('已保存');
        inputRef.current?.focus();
      } else { publishedRef.current = true; navigation.goBack(); }
    } catch (error: any) {
      if (!isCurrentSession(session)) return;
      if (error.code === 'edit_conflict' && error.current) {
        const latest = transformBBTalk(error.current);
        xConfirm('记录已有新版本',
          `你的输入仍保留。服务器最新内容：

${latest.content}

标签：${latest.tags.map(t => t.name).join('、') || '无'}
可见性：${latest.visibility}
附件：${latest.attachments.map(a => a.filename || a.uid).join('、') || '无'}`,
          () => { if (isCurrentSession(session)) { setBaseUpdatedAt(latest.updatedAt); setSubmissionMessage('已核对最新版本，可继续修改后再次保存。'); } },
          undefined, { confirmText: '保留修改继续编辑', cancelText: '暂不处理' });
      } else {
        setSubmissionMessage(`发布或更新失败，内容已保留。${error.message || (typeof error === 'string' ? error : '请重试')}`);
      }
    } finally { submittingRef.current = false; setSubmitting(false); }
  };

  const canSubmit = (cleanContent(content).length > 0 || attachments.length > 0) && pendingMedia.length === 0 && submissionReady && draftReady && !submitting && !uploading;

  // 计算工具栏高度（大约）
  const toolbarHeight = 44 + (showQuickTags ? 40 : 0) + (location ? 28 : 0) + 36; // main + tags + location + md
  const bottomPad = keyboardH > 0 ? 0 : (insets.bottom || 12);

  return (
    <View pointerEvents={submitting ? 'none' : 'auto'} style={[styles.container, { paddingTop: insets.top, backgroundColor: c.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: c.headerBg, borderBottomColor: c.border }]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={lockedCapture ? '解锁查看历史' : '取消'}
          disabled={lockedCapture && uploading} style={{ minHeight: 44, justifyContent: 'center' }}
          onPress={lockedCapture ? requestUnlock : () => navigation.goBack()}>
          <Text style={[styles.cancelText, { color: c.textSecondary }]}>{lockedCapture ? '解锁查看历史' : '取消'}</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: c.text }]}>{lockedCapture ? '快速记录' : isEditing ? '编辑记录' : '写一条'}</Text>
          <TouchableOpacity
            style={styles.modeToggleBtn}
            onPress={() => {
              if (editMode === 'edit') {
                Keyboard.dismiss();
              }
              setEditMode(m => m === 'edit' ? 'preview' : 'edit');
            }}
            accessibilityRole="button"
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
          {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.publishText}>{lockedCapture ? '保存' : isEditing ? '更新' : visibility === 'private' ? '保存' : '发布'}</Text>}
        </TouchableOpacity>
      </View>

      {(submission || submissionMessage) && <View style={{ padding: 12, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <Text accessibilityLiveRegion="polite" style={{ color: c.text, fontSize: 14 }}>{submissionMessage || (submission?.state === 'pending' ? '有一份发布结果待核对' : '原提交已确认，当前输入仍保留')}</Text>
        {submission && <TouchableOpacity accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }} onPress={() => xAlert('原提交内容', submission.payload.content)}>
          <Text style={{ color: c.primary }}>查看原提交内容</Text>
        </TouchableOpacity>}
        {submission?.state === 'pending' && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <TouchableOpacity accessibilityRole="button" disabled={submitting} style={{ minHeight: 44, justifyContent: 'center' }} onPress={() => { void recoverSubmission(false); }}>
            <Text style={{ color: c.primary }}>核对发布结果</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" disabled={submitting} style={{ minHeight: 44, justifyContent: 'center' }} onPress={() => { void recoverSubmission(true); }}>
            <Text style={{ color: c.primary }}>重试原提交</Text>
          </TouchableOpacity>
        </View>}
      </View>}
      <DraftStatus visibility={visibility} onVisibility={() => visibility === 'public' ? setVisibility('private') : confirmPublicVisibility(() => { if (isCurrentSession(session)) setVisibility('public'); })}
        status={autosave.status} onSave={() => { void autosave.save().catch(() => {}); }} pending={pendingMedia} uploading={uploading} error={uploadError}
        onRetry={() => { void uploadPending(); }} onRemove={id => { setPendingMedia(prev => prev.filter(item => item.id !== id)); setUploadError(''); }} />
      {/* 编辑区 / 预览区 */}
      {editMode === 'edit' ? (
        <View style={[styles.editorArea, { backgroundColor: c.surface }]}>
          <TextInput ref={inputRef} style={[styles.textInput, { color: c.text }]}
            placeholder="此刻，有什么想记下来的？" placeholderTextColor={c.textTertiary}
            editable={!submitting && draftReady} value={content} onChangeText={setContent} multiline textAlignVertical="top" autoFocus
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
                {att.type === 'image' ? (
                  <Image source={buildImageSource(att.url)} style={[styles.attachmentImage, { backgroundColor: c.borderLight }]} contentFit="cover" />
                ) : att.type === 'audio' ? (
                  <CompactAudioCard attachment={att} colors={c} />
                ) : att.type === 'video' ? (
                  <CompactVideoCard attachment={att} colors={c} />
                ) : (
                  <View style={[styles.filePlaceholder, { backgroundColor: c.borderLight, borderColor: c.border }]}>
                    <Ionicons name="document" size={20} color={c.textTertiary} />
                    <Text style={[styles.fileName, { color: c.textTertiary }]} numberOfLines={1}>{att.originalFilename || '附件'}</Text>
                  </View>
                )}
                <TouchableOpacity style={styles.removeBtn} onPress={() => setAttachments(p => p.filter(a => a.uid !== att.uid))} hitSlop={{ top: 11, bottom: 11, left: 11, right: 11 }} accessibilityRole="button" accessibilityLabel="删除附件"><Ionicons name="close" size={12} color="#fff" /></TouchableOpacity>
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
              }} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }} accessibilityRole="button" accessibilityLabel={`移除标签 ${tag}`}>
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
        {!lockedCapture && showQuickTags && existingTags.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" style={styles.quickTagBar} contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}>
            {existingTags.filter(t => !currentTags.includes(t.name)).slice(0, 15).map(tag => (
              <TouchableOpacity key={tag.id} style={[styles.quickTagChip, { backgroundColor: c.surface, borderColor: c.border }]} onPress={() => insertTag(tag.name)}><Text style={[styles.quickTagText, { color: c.textSecondary }]}>#{tag.name}</Text></TouchableOpacity>
            ))}
          </ScrollView>
        )}
        {location && (
          <View style={styles.locationBar}><Ionicons name="location" size={14} color="#10B981" /><Text style={styles.locationText}>{location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}</Text>
            <TouchableOpacity onPress={() => setLocation(null)} accessibilityRole="button" accessibilityLabel="移除位置"><Ionicons name="close-circle" size={16} color="#C4C4C4" /></TouchableOpacity></View>
        )}
        <View style={styles.toolbarInner}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always"
            contentContainerStyle={styles.toolbarRow}>
            <TouchableOpacity style={styles.toolBtn} onPress={() => pickMedia('images')} accessibilityRole="button" accessibilityLabel={COMPOSE_TOOLBAR_LABELS.addImage}><Ionicons name="image-outline" size={21} color={c.textSecondary} /></TouchableOpacity>
            <View style={[styles.toolBtn, { opacity: holdRecording.pressed ? 0.2 : 1 }]} {...holdRecording.handlers} accessibilityRole="button" accessibilityLabel={COMPOSE_TOOLBAR_LABELS.recordAudio}><Ionicons name="mic-outline" size={21} color={c.textSecondary} /></View>
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
            }} accessibilityRole="button" accessibilityLabel={COMPOSE_TOOLBAR_LABELS.insertTag}><Ionicons name="pricetag-outline" size={19} color={showQuickTags ? c.primary : c.textSecondary} /></TouchableOpacity>
            <TouchableOpacity style={styles.toolBtn} onPress={() => setShowMoreTools(!showMoreTools)} accessibilityRole="button" accessibilityLabel="更多工具" accessibilityState={{ expanded: showMoreTools }}><Ionicons name="ellipsis-horizontal" size={22} color={c.textSecondary} /></TouchableOpacity>
          </ScrollView>
        </View>
        {showMoreTools && <View>
          <Text style={{ color: c.textSecondary, fontSize: 12, paddingHorizontal: 16 }}>附件与文字格式</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={styles.toolbarRow}>
            <TouchableOpacity style={styles.toolBtn} onPress={takePhoto} accessibilityRole="button" accessibilityLabel={COMPOSE_TOOLBAR_LABELS.takePhoto}><Ionicons name="camera-outline" size={21} color={c.textSecondary} /></TouchableOpacity>
            <TouchableOpacity style={styles.toolBtn} onPress={() => pickMedia('videos')} accessibilityRole="button" accessibilityLabel={COMPOSE_TOOLBAR_LABELS.addVideo}><Ionicons name="videocam-outline" size={21} color={c.textSecondary} /></TouchableOpacity>
            <TouchableOpacity style={styles.toolBtn} onPress={pickFile} accessibilityRole="button" accessibilityLabel={COMPOSE_TOOLBAR_LABELS.addFile}><Ionicons name="attach-outline" size={21} color={c.textSecondary} /></TouchableOpacity>
            <TouchableOpacity style={styles.toolBtn} onPress={getLocation} accessibilityRole="button" accessibilityLabel={COMPOSE_TOOLBAR_LABELS.addLocation}><Ionicons name="location-outline" size={19} color={location ? '#10B981' : c.textSecondary} /></TouchableOpacity>
            <View style={[styles.toolDivider, { backgroundColor: c.border }]} />
            <TouchableOpacity style={[styles.mdBtn, { backgroundColor: c.surface, borderColor: c.border }]} onPress={() => mdInsert('bold')} accessibilityRole="button" accessibilityLabel={COMPOSE_TOOLBAR_LABELS.bold}><Text style={[styles.mdBold, { color: c.text }]}>B</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.mdBtn, { backgroundColor: c.surface, borderColor: c.border }]} onPress={() => mdInsert('italic')} accessibilityRole="button" accessibilityLabel={COMPOSE_TOOLBAR_LABELS.italic}><Text style={[styles.mdItalic, { color: c.text }]}>I</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.mdBtn, { backgroundColor: c.surface, borderColor: c.border }]} onPress={() => mdInsert('heading')} accessibilityRole="button" accessibilityLabel={COMPOSE_TOOLBAR_LABELS.heading}><Text style={[styles.mdBtnText, { color: c.textSecondary }]}>H</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.mdBtn, { backgroundColor: c.surface, borderColor: c.border }]} onPress={() => mdInsert('list')} accessibilityRole="button" accessibilityLabel={COMPOSE_TOOLBAR_LABELS.list}><Ionicons name="list" size={15} color={c.textSecondary} /></TouchableOpacity>
            <TouchableOpacity style={[styles.mdBtn, { backgroundColor: c.surface, borderColor: c.border }]} onPress={() => mdInsert('quote')} accessibilityRole="button" accessibilityLabel={COMPOSE_TOOLBAR_LABELS.quote}><Ionicons name="chatbox-outline" size={15} color={c.textSecondary} /></TouchableOpacity>
            <TouchableOpacity style={[styles.mdBtn, { backgroundColor: c.surface, borderColor: c.border }]} onPress={() => mdInsert('code')} accessibilityRole="button" accessibilityLabel={COMPOSE_TOOLBAR_LABELS.code}><Ionicons name="code-slash" size={15} color={c.textSecondary} /></TouchableOpacity>
            <TouchableOpacity style={[styles.mdBtn, { backgroundColor: c.surface, borderColor: c.border }]} onPress={() => mdInsert('link')} accessibilityRole="button" accessibilityLabel={COMPOSE_TOOLBAR_LABELS.link}><Ionicons name="link-outline" size={15} color={c.textSecondary} /></TouchableOpacity>
          </ScrollView>
        </View>}
      </View>
        </>
      )}

      <VoiceRecordingOverlay
        visible={voiceRecording}
        holdMode={holdRecording.holdMode} cancelHint={holdRecording.cancelHint} stopAction={holdRecording.stopAction}
        onFinish={handleVoiceFinish}
        onCancel={() => setVoiceRecording(false)}
      />
    </View>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, width: '100%', maxWidth: 1000, alignSelf: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5,
  },
  cancelText: { fontSize: 16 },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modeToggleBtn: { padding: 4, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
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
  removeBtn: { position: 'absolute', top: -4, right: -4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
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
  toolBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  toolDivider: { width: 1, height: 20, marginHorizontal: 4 },
  mdBtn: { width: 44, height: 44, borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  mdBold: { fontSize: 13, fontWeight: '800' },
  mdItalic: { fontSize: 13, fontWeight: '600', fontStyle: 'italic' },
  mdBtnText: { fontSize: 12, fontWeight: '700' },
});
