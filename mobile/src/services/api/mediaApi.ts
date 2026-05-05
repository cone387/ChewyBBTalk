import { Platform } from 'react-native';
import { getAccessToken } from '../auth';
import { getApiBaseUrl } from '../../config';
import type { Attachment } from '../../types';

function transformAttachment(data: any): Attachment {
  // file_url 对本地存储返回的是存储路径（非 URL），需要用 preview_url
  // preview_url 的 host 可能是后端内网地址，需要替换成用户配置的 apiBaseUrl
  const rawUrl = data.preview_url || data.download_url || data.url || data.file || '';
  let url = rawUrl;

  if (url) {
    const apiBase = getApiBaseUrl();
    if (url.startsWith('/')) {
      // 相对路径：拼接 apiBase
      url = apiBase + url;
    } else if (url.startsWith('http://') || url.startsWith('https://')) {
      // 绝对 URL：替换 host 为用户配置的 apiBase（防止后端返回内网/localhost 地址）
      try {
        const parsed = new URL(url);
        const base = new URL(apiBase);
        parsed.protocol = base.protocol;
        parsed.host = base.host;
        url = parsed.toString();
      } catch {}
    } else {
      // 裸路径（如 "2026/05/05/xxx.jpg"）：不是可访问 URL，跳过
      url = '';
    }
  }

  let type = data.media_type || data.type || 'file';
  const mimeType = data.mime_type || '';
  if (!data.media_type && !data.type && mimeType) {
    if (mimeType.startsWith('image/')) type = 'image';
    else if (mimeType.startsWith('video/')) type = 'video';
    else if (mimeType.startsWith('audio/')) type = 'audio';
  }

  return {
    uid: data.uid || data.id || '',
    url,
    type,
    filename: data.filename || data.original_name,
    originalFilename: data.original_filename || data.original_name,
    fileSize: data.file_size || data.size,
    mimeType,
  };
}

export const attachmentApi = {
  async upload(uri: string, fileName: string, mimeType: string): Promise<Attachment> {
    // Web 平台：RN 风格的 { uri, name, type } 对象不被浏览器 FormData 识别，
    // 会被 toString() 成 "[object Object]"。需要先 fetch 成 Blob 再用 File 包装。
    if (Platform.OS === 'web') {
      const resp = await fetch(uri);
      const blob = await resp.blob();
      const file = new File([blob], fileName, { type: mimeType || blob.type });
      return this.uploadFile(file);
    }

    const token = await getAccessToken();
    const formData = new FormData();

    formData.append('file', {
      uri,
      name: fileName,
      type: mimeType,
    } as any);
    formData.append('is_public', 'true');

    const response = await fetch(`${getApiBaseUrl()}/api/v1/attachments/files/`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || JSON.stringify(error) || '上传失败');
    }

    const data = await response.json();
    return transformAttachment(data);
  },

  /** Web-only: upload a File/Blob object directly */
  async uploadFile(file: File): Promise<Attachment> {
    const token = await getAccessToken();
    const formData = new FormData();
    formData.append('file', file, file.name || 'upload');
    formData.append('is_public', 'true');

    const response = await fetch(`${getApiBaseUrl()}/api/v1/attachments/files/`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      // DRF 字段级错误格式: {"file": ["错误信息"]}
      let message = error.detail;
      if (!message) {
        const firstKey = Object.keys(error)[0];
        if (firstKey) {
          const val = error[firstKey];
          message = Array.isArray(val) ? val.join('; ') : String(val);
        }
      }
      throw new Error(message || '上传失败');
    }

    const data = await response.json();
    return transformAttachment(data);
  },
};
