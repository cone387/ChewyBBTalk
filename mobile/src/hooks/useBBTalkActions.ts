import { useCallback, useRef, useState } from 'react';
import { Alert, ActionSheetIOS, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import type { BBTalk, Attachment } from '../types';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { updateBBTalkAsync, togglePinAsync, createBBTalkAsync, optimisticDelete, undoDelete } from '../store/slices/bbtalkSlice';
import { bbtalkApi } from '../services/api/bbtalkApi';
import { attachmentApi } from '../services/api/mediaApi';
import { logError } from '../utils/errorHandler';
import { shareBBTalk as shareService } from '../services/shareService';

interface UseBBTalkActionsOptions {
  showError: (title: string, msg: string) => void;
  onNavigateCompose: (item?: BBTalk) => void;
}

export function useBBTalkActions({ showError, onNavigateCompose }: UseBBTalkActionsOptions) {
  const dispatch = useAppDispatch();
  const { bbtalks } = useAppSelector(s => s.bbtalk);
  const [pendingDelete, setPendingDelete] = useState<{ bbtalk: BBTalk; index: number } | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shareBBTalk = useCallback(async (item: BBTalk) => {
    if (isSharing) return;
    setIsSharing(true);
    try {
      await shareService(item);
    } catch (e) {
      logError(e, 'shareBBTalk');
    } finally {
      setIsSharing(false);
    }
  }, [isSharing]);

  const handleDelete = useCallback((item: BBTalk) => {
    const index = bbtalks.findIndex(b => b.id === item.id);
    if (index === -1) return;
    setPendingDelete({ bbtalk: item, index });
    dispatch(optimisticDelete(item.id));
    deleteTimerRef.current = setTimeout(async () => {
      try { await bbtalkApi.deleteBBTalk(item.id); }
      catch (error: any) { dispatch(undoDelete({ bbtalk: item, index })); showError('删除失败', error.message || '请稍后重试'); }
      setPendingDelete(null);
    }, 3000);
  }, [bbtalks, dispatch, showError]);

  const handleUndo = useCallback(() => {
    if (deleteTimerRef.current) { clearTimeout(deleteTimerRef.current); deleteTimerRef.current = null; }
    if (pendingDelete) { dispatch(undoDelete(pendingDelete)); setPendingDelete(null); }
  }, [pendingDelete, dispatch]);

  const handleDismiss = useCallback(() => { setPendingDelete(null); }, []);

  const showMenu = useCallback((item: BBTalk) => {
    const pinLabel = item.isPinned ? '取消置顶' : '置顶';
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['编辑', pinLabel, '分享', '复制', '删除', '取消'], destructiveButtonIndex: 4, cancelButtonIndex: 5 },
        (idx) => {
          if (idx === 0) onNavigateCompose(item);
          if (idx === 1) dispatch(togglePinAsync(item.id));
          if (idx === 2) shareBBTalk(item);
          if (idx === 3) Clipboard.setStringAsync(item.content);
          if (idx === 4) handleDelete(item);
        }
      );
    } else {
      Alert.alert('操作', '', [
        { text: '编辑', onPress: () => onNavigateCompose(item) },
        { text: pinLabel, onPress: () => dispatch(togglePinAsync(item.id)) },
        { text: '分享', onPress: () => shareBBTalk(item) },
        { text: '复制', onPress: () => Clipboard.setStringAsync(item.content) },
        { text: '删除', style: 'destructive', onPress: () => handleDelete(item) },
        { text: '取消', style: 'cancel' },
      ]);
    }
  }, [dispatch, handleDelete, onNavigateCompose, shareBBTalk]);

  const toggleVisibility = useCallback((item: BBTalk) => {
    const newVis = item.visibility === 'public' ? 'private' : 'public';
    Alert.alert('切换可见性', `确定设为${newVis === 'public' ? '公开' : '私密'}？`, [
      { text: '取消', style: 'cancel' },
      { text: '确定', onPress: () => dispatch(updateBBTalkAsync({ id: item.id, data: { visibility: newVis } as any })) },
    ]);
  }, [dispatch]);

  const handleVoiceFinish = useCallback(async (result: { text: string; audioUri: string | null; audioDuration: number }) => {
    const { text, audioUri } = result;
    if (!text && !audioUri) return;
    try {
      let audioAttachment: Attachment | undefined;
      if (audioUri) {
        if (Platform.OS === 'web') {
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
      await dispatch(createBBTalkAsync({
        content: text || '🎙️ 语音记录', attachments: audioAttachment ? [audioAttachment] : [],
        visibility: 'private',
        context: { source: { client: 'ChewyBBTalk Mobile', version: '1.0', platform: 'mobile', input: 'voice' } },
      }));
    } catch (e: any) { showError('保存失败', e.message || '请稍后重试'); }
  }, [dispatch, showError]);

  return {
    pendingDelete,
    isSharing,
    handleDelete,
    handleUndo,
    handleDismiss,
    showMenu,
    toggleVisibility,
    handleVoiceFinish,
  };
}
