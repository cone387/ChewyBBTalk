/**
 * 为图片 URL 构建 expo-image 的 source 对象。
 * 如果是后端 preview/download URL（需要认证），自动附加 Authorization header。
 * 如果是 S3 签名 URL 或其他外部 URL，直接返回字符串。
 */
import { getApiBaseUrl } from '../config';
import { getAccessTokenSync } from '../services/auth';

export function buildImageSource(url: string | undefined | null): string | { uri: string; headers?: Record<string, string> } {
  if (!url) return '';

  const apiBase = getApiBaseUrl();

  // 判断是否是后端 API URL（需要 auth header）
  const isApiUrl = url.startsWith(apiBase) || url.includes('/api/v1/attachments/');

  if (isApiUrl) {
    const token = getAccessTokenSync();
    if (token) {
      return { uri: url, headers: { Authorization: `Bearer ${token}` } };
    }
  }

  return url;
}
