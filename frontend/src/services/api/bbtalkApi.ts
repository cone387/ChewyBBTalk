import { apiClient } from './apiClient';
import type { BBTalk, PaginatedResponse, Attachment } from '../../types';

function transformAttachment(data: any): Attachment {
  return {
    uid: data.uid || data.id || '',
    url: data.url || '',
    type: data.type || 'file',
    filename: data.filename,
    originalFilename: data.original_filename,
    fileSize: data.file_size,
    mimeType: data.mime_type,
  };
}

function transformBBTalk(data: any): BBTalk {
  return {
    id: data.uid,
    content: data.content,
    visibility: data.visibility || 'private',
    tags: (data.tags || []).map((t: any) => ({
      id: t.uid,
      name: t.name,
      color: t.color,
      sortOrder: t.sort_order,
      bbtalkCount: t.bbtalk_count,
    })),
    attachments: (data.attachments || []).map(transformAttachment),
    context: data.context || {},
    createdAt: data.create_time,
    updatedAt: data.update_time,
  };
}

function transformBBTalkToBackend(bbtalk: Partial<BBTalk>): any {
  const result: any = {};

  if (bbtalk.content !== undefined) {
    result.content = bbtalk.content;
  }

  if (bbtalk.tags !== undefined) {
    result.post_tags = bbtalk.tags.map((t) => t.name).join(',');
  }

  if (bbtalk.context !== undefined) {
    result.context = bbtalk.context;
  }

  if (bbtalk.attachments !== undefined) {
    // attachments 直接传递元信息列表
    result.attachments = bbtalk.attachments.map((a) => ({
      uid: a.uid,
      url: a.url,
      type: a.type,
      filename: a.filename,
      original_filename: a.originalFilename,
      file_size: a.fileSize,
      mime_type: a.mimeType,
    }));
  }

  if (bbtalk.visibility) {
    result.visibility = bbtalk.visibility;
  }

  return result;
}

export const bbtalkApi = {
  async getBBTalks(params?: {
    page?: number;
    search?: string;
    tags__name?: string;
    visibility?: string;
  }): Promise<PaginatedResponse<BBTalk>> {
    const data = await apiClient.get<any>('/api/v1/bbtalk/', params);
    return {
      count: data.count,
      next: data.next,
      previous: data.previous,
      results: data.results.map(transformBBTalk),
    };
  },

  async getBBTalk(uid: string): Promise<BBTalk> {
    const data = await apiClient.get<any>(`/api/v1/bbtalk/${uid}/`);
    return transformBBTalk(data);
  },

  async createBBTalk(data: {
    content: string;
    tags?: string[];
    attachments?: Attachment[];
    visibility?: 'public' | 'private' | 'friends';
    context?: Record<string, any>;
  }): Promise<BBTalk> {
    const payload: any = {
      content: data.content,
      post_tags: data.tags?.join(',') || undefined,
      context: data.context,
    };

    if (data.attachments && data.attachments.length > 0) {
      payload.attachments = data.attachments.map((a) => ({
        uid: a.uid,
        url: a.url,
        type: a.type,
        filename: a.filename,
        original_filename: a.originalFilename,
        file_size: a.fileSize,
        mime_type: a.mimeType,
      }));
    }

    if (data.visibility) {
      payload.visibility = data.visibility;
    }

    const response = await apiClient.post<any>('/api/v1/bbtalk/', payload);
    return transformBBTalk(response);
  },

  async updateBBTalk(uid: string, bbtalk: Partial<BBTalk>): Promise<BBTalk> {
    const data = await apiClient.patch<any>(
      `/api/v1/bbtalk/${uid}/`,
      transformBBTalkToBackend(bbtalk)
    );
    return transformBBTalk(data);
  },

  async deleteBBTalk(uid: string): Promise<void> {
    await apiClient.delete(`/api/v1/bbtalk/${uid}/`);
  },

  async getPublicBBTalks(params?: {
    page?: number;
  }): Promise<PaginatedResponse<BBTalk>> {
    const data = await apiClient.get<any>('/api/v1/bbtalk/public/', params);
    return {
      count: data.count,
      next: data.next,
      previous: data.previous,
      results: data.results.map(transformBBTalk),
    };
  },

  async getPublicBBTalk(uid: string): Promise<BBTalk> {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
    const response = await fetch(`${baseUrl}/api/v1/bbtalk/public/${uid}/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('BBTalk 不存在或不是公开的');
    }

    const data = await response.json();
    return transformBBTalk(data);
  },
};

