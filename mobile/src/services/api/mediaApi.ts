import { getAccessToken } from '../auth';
import { getApiBaseUrl } from '../../config';
import type { Attachment } from '../../types';

function transformAttachment(data: any): Attachment {
  let url = data.preview_url || data.url || data.file;
  if (url && url.startsWith('/')) url = getApiBaseUrl() + url;

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
      throw new Error(error.detail || '上传失败');
    }

    const data = await response.json();
    return transformAttachment(data);
  },

  /** Web-only: upload a File/Blob object directly */
  async uploadFile(file: File): Promise<Attachment> {
    const token = await getAccessToken();
    const formData = new FormData();
    formData.append('file', file);
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
      throw new Error(error.detail || '上传失败');
    }

    const data = await response.json();
    return transformAttachment(data);
  },
};
