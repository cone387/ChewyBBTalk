import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { attachmentApi } from './api/mediaApi';
import { isCurrentSession, type Session } from './session';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { waitForDraftWrites } from './drafts';

export interface PendingMedia { id: string; uri: string; name: string; mime: string; }

export async function retainMedia(uri: string, name: string, mime: string, session: Session): Promise<PendingMedia> {
  if (!session.scope || !isCurrentSession(session)) throw new Error('请重新登录后添加附件');
  const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  let retained: string;
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    if (blob.size > 8 * 1024 * 1024) throw new Error('网页预览暂支持 8MB 内的草稿附件，请使用原生 App 添加大文件');
    retained = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('无法保留附件，请重新选择'));
      reader.readAsDataURL(blob);
    });
  } else {
    const directory = `${FileSystem.documentDirectory}draft-media/${encodeURIComponent(session.scope)}/`;
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    retained = `${directory}${id}.${name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '') || 'bin'}`;
    await FileSystem.copyAsync({ from: uri, to: retained });
  }
  if (!isCurrentSession(session)) throw new Error('账号已切换');
  return { id, uri: retained, name, mime };
}

export async function uploadRetainedMedia(media: PendingMedia, session: Session) {
  if (!isCurrentSession(session)) throw new Error('账号已切换');
  if (Platform.OS === 'web') {
    const blob = await (await fetch(media.uri)).blob();
    if (!isCurrentSession(session)) throw new Error('账号已切换');
    return attachmentApi.uploadFile(new File([blob], media.name, { type: media.mime }));
  }
  return attachmentApi.upload(media.uri, media.name, media.mime);
}

/** Remove only our unreferenced copies, after a grace period for active saves. */
export async function pruneRetainedMedia(session: Session) {
  if (Platform.OS === 'web' || !session.scope) return;
  try {
    const directory = `${FileSystem.documentDirectory}draft-media/${encodeURIComponent(session.scope)}/`;
    const keys = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith(`compose_draft:${session.scope}`));
    const drafts = (await AsyncStorage.multiGet(keys)).map(([, value]) => value || '').join('\n');
    for (const name of await FileSystem.readDirectoryAsync(directory)) {
      if (!isCurrentSession(session)) return;
      if (!/^\d+_[a-z0-9]+\.[a-zA-Z0-9]+$/.test(name)) continue;
      if (Number(name.split('_')[0]) > Date.now() - 86400000 || drafts.includes(name)) continue;
      await FileSystem.deleteAsync(directory + name, { idempotent: true });
    }
  } catch { /* Cleanup must never block recording or remove referenced drafts. */ }
}

/** Used only after the server confirms account deletion. */
export async function removeAccountDrafts(scope: string | null) {
  if (!scope) return;
  await waitForDraftWrites(scope);
  const keys = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith(`compose_draft:${scope}`));
  await AsyncStorage.multiRemove(keys);
  if (Platform.OS !== 'web') {
    await FileSystem.deleteAsync(`${FileSystem.documentDirectory}draft-media/${encodeURIComponent(scope)}/`, { idempotent: true });
  }
}
