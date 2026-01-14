import { apiClient } from './api/apiClient';
import { getDevAuthHeaders } from './auth';
import type { Attachment } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

function transformAttachment(data: any): Attachment {
  let url = data.url || data.file;
  
  // 协议转换
  const targetProtocol = import.meta.env.VITE_MEDIA_URL_PROTOCOL || 'https';
  if (url) {
    if (targetProtocol === 'https' && url.startsWith('http://')) {
      url = url.replace('http://', 'https://');
    } else if (targetProtocol === 'http' && url.startsWith('https://')) {
      url = url.replace('https://', 'http://');
    }
  }
  
  return {
    uid: data.uid || data.id || '',
    url: url,
    type: data.media_type || data.type || 'file',
    filename: data.filename,
    originalFilename: data.original_filename,
    fileSize: data.file_size,
    mimeType: data.mime_type,
  };
}

export const attachmentApi = {
  /**
   * 上传文件
   */
  async upload(file: File, params?: {
    media_type?: string;
    description?: string;
  }): Promise<Attachment> {
    const formData = new FormData();
    formData.append('file', file);
    if (params?.media_type) formData.append('media_type', params.media_type);
    if (params?.description) formData.append('description', params.description);

    const headers: Record<string, string> = {
      ...getDevAuthHeaders(),
    };

    const response = await fetch(`${API_BASE_URL}/api/v1/attachments/files/`, {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || '上传失败');
    }

    const data = await response.json();
    return transformAttachment(data);
  },

  /**
   * 删除文件
   */
  async delete(uid: string): Promise<void> {
    await apiClient.delete(`/api/v1/attachments/files/${uid}/`);
  },

  /**
   * 获取文件列表
   */
  async list(): Promise<Attachment[]> {
    const data = await apiClient.get<any>('/api/v1/attachments/files/');
    const results = data.results || data;
    return (Array.isArray(results) ? results : []).map(transformAttachment);
  },
};

// 兼容旧的 mediaApi 导出
export const mediaApi = {
  uploadMedia: attachmentApi.upload,
  deleteMedia: attachmentApi.delete,
};
