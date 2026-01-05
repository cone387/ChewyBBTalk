import { apiClient } from './api/apiClient';
import { getAuthToken } from './auth';
import type { Media } from '../types';

function transformMedia(data: any): Media {
  let url = data.url || data.file;
  
  const targetProtocol = import.meta.env.VITE_MEDIA_URL_PROTOCOL || 'https';
  if (url) {
    if (targetProtocol === 'https' && url.startsWith('http://')) {
      url = url.replace('http://', 'https://');
    } else if (targetProtocol === 'http' && url.startsWith('https://')) {
      url = url.replace('https://', 'http://');
    }
  }
  
  return {
    id: data.uid,
    mediaType: data.media_type || 'auto',
    url: url,
    filename: data.filename,
    originalFilename: data.original_filename,
    fileSize: data.file_size,
  };
}

export const mediaApi = {
  async uploadMedia(file: File, params?: {
    media_type?: string;
    description?: string;
  }): Promise<Media> {
    const formData = new FormData();
    formData.append('file', file);
    if (params?.media_type) formData.append('media_type', params.media_type);
    if (params?.description) formData.append('description', params.description);

    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/v1/media/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getAuthToken() || ''}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error('上传失败');
    }

    const data = await response.json();
    return transformMedia(data);
  },

  async deleteMedia(id: string): Promise<void> {
    await apiClient.delete(`/v1/media/${id}/`);
  }
};
