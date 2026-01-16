import { apiClient } from './api/apiClient';
import { getAuthToken } from './auth';
import type { Attachment } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

function transformAttachment(data: any): Attachment {
  // 后端返回字段映射:
  // id -> uid
  // preview_url/url/file -> url
  // original_name/filename -> filename
  // mime_type -> mimeType
  // size/file_size -> fileSize
  let url = data.preview_url || data.url || data.file;
  
  // 处理相对路径：如果 URL 以 / 开头，拼接基础 URL
  if (url && url.startsWith('/')) {
    url = API_BASE_URL + url;
  }
  
  // 协议转换
  const targetProtocol = import.meta.env.VITE_MEDIA_URL_PROTOCOL || 'https';
  if (url) {
    if (targetProtocol === 'https' && url.startsWith('http://')) {
      url = url.replace('http://', 'https://');
    } else if (targetProtocol === 'http' && url.startsWith('https://')) {
      url = url.replace('https://', 'http://');
    }
  }

  // 根据 mime_type 判断类型
  let type = data.media_type || data.type || 'file';
  const mimeType = data.mime_type || '';
  if (!data.media_type && !data.type && mimeType) {
    if (mimeType.startsWith('image/')) {
      type = 'image';
    } else if (mimeType.startsWith('video/')) {
      type = 'video';
    } else if (mimeType.startsWith('audio/')) {
      type = 'audio';
    }
  }
  
  return {
    uid: data.uid || data.id || '',
    url: url,
    type: type,
    filename: data.filename || data.original_name,
    originalFilename: data.original_filename || data.original_name,
    fileSize: data.file_size || data.size,
    mimeType: mimeType,
  };
}

export const attachmentApi = {
  /**
   * 上传文件
   */
  async upload(file: File, params?: {
    media_type?: string;
    description?: string;
    is_public?: boolean;
  }): Promise<Attachment> {
    const formData = new FormData();
    formData.append('file', file);
    if (params?.media_type) formData.append('media_type', params.media_type);
    if (params?.description) formData.append('description', params.description);
    // 默认公开，浏览器可以直接通过 <img> 加载，利用 HTTP 缓存
    // 私密性通过 BBTalk 的 visibility 控制，而不是附件级别
    formData.append('is_public', String(params?.is_public ?? true));

    const headers: Record<string, string> = {};
    const token = getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

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
