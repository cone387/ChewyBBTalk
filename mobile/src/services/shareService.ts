/**
 * 分享服务模块
 * 负责将 BBTalk 内容组装并调用系统分享接口
 * - 纯文本组装（正文 + 标签）
 * - 图片下载到本地缓存
 * - 平台判断 + 系统分享面板 + 剪贴板降级
 */
import { Alert, Platform, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { BBTalk } from '../types';
import { logError } from '../utils/errorHandler';

/**
 * 组装 BBTalk 的分享文本
 * 格式：正文内容 + 换行 + #标签1 #标签2
 * 纯函数，不包含非图片附件信息
 */
export function buildShareText(item: BBTalk): string {
  let text = item.content;
  if (item.tags.length > 0) {
    text += '\n\n' + item.tags.map(t => `#${t.name}`).join(' ');
  }
  return text;
}

/**
 * 下载远程图片到本地临时目录
 * 返回成功下载的本地 URI 列表（失败的跳过）
 */
export async function downloadImages(urls: string[]): Promise<string[]> {
  const localUris: string[] = [];
  for (const url of urls) {
    try {
      const filename = url.split('/').pop() || `share_${Date.now()}.jpg`;
      const localUri = `${FileSystem.cacheDirectory}share_${filename}`;
      const result = await FileSystem.downloadAsync(url, localUri);
      if (result.status === 200) {
        localUris.push(result.uri);
      }
    } catch (e) {
      logError(e, 'downloadImages');
    }
  }
  return localUris;
}

/**
 * 复制文本到剪贴板并显示提示
 */
export async function copyToClipboard(text: string): Promise<void> {
  await Clipboard.setStringAsync(text);
  Alert.alert('已复制', '内容已复制到剪贴板');
}

/**
 * 分享 BBTalk 主函数
 * 整合平台判断、图片下载、系统分享面板调用、降级剪贴板复制
 *
 * Web 平台：优先 navigator.share，不可用时直接复制
 * iOS/Android：使用 expo-sharing 分享本地文件（文本+首张图片），失败/取消时降级为剪贴板
 */
export async function shareBBTalk(item: BBTalk): Promise<void> {
  const text = buildShareText(item);

  // 筛选图片附件
  const imageAttachments = item.attachments.filter(a => a.type === 'image');

  try {
    if (Platform.OS === 'web') {
      await shareOnWeb(text);
    } else {
      await shareOnNative(text, imageAttachments.map(a => a.url));
    }
  } catch (e) {
    logError(e, 'shareBBTalk');
    // 最终降级：复制到剪贴板
    await copyToClipboard(text);
  }
}

/**
 * Web 平台分享
 * 优先使用 Web Share API，不可用时直接复制到剪贴板
 */
async function shareOnWeb(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch (e: any) {
      // 用户取消分享不算错误
      if (e?.name === 'AbortError') {
        return;
      }
      logError(e, 'Web Share API');
    }
  }
  // Web Share API 不可用或调用失败，降级为剪贴板
  await copyToClipboard(text);
}

/**
 * iOS/Android 原生平台分享
 * 有图片时：下载首张图片到本地，使用 expo-sharing 分享文件
 * 无图片或下载失败时：使用 RN Share 分享纯文本
 * 分享失败/取消时：降级为剪贴板复制
 */
async function shareOnNative(text: string, imageUrls: string[]): Promise<void> {
  // 尝试下载图片
  let localImageUris: string[] = [];
  if (imageUrls.length > 0) {
    try {
      localImageUris = await downloadImages(imageUrls);
    } catch (e) {
      logError(e, 'download images for share');
    }
  }

  // 有本地图片时，使用 expo-sharing 分享首张图片
  if (localImageUris.length > 0) {
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(localImageUris[0], {
          dialogTitle: text,
          mimeType: 'image/*',
        });
        return;
      }
    } catch (e) {
      logError(e, 'expo-sharing');
    }
  }

  // 无图片或 expo-sharing 失败，使用 RN Share 分享纯文本
  try {
    const result = await Share.share({ message: text });
    if (result.action === Share.dismissedAction) {
      // 用户取消分享，提供复制选项
      Alert.alert('分享', '已取消分享，是否复制到剪贴板？', [
        { text: '取消' },
        { text: '复制', onPress: () => copyToClipboard(text) },
      ]);
    }
  } catch (e) {
    logError(e, 'RN Share');
    // 降级为剪贴板
    await copyToClipboard(text);
  }
}
