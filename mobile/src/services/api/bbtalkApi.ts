import { apiClient } from './apiClient';
import { getApiBaseUrl } from '../../config';
import type { BBTalk, PaginatedResponse, Attachment, Comment } from '../../types';

function transformAttachment(data: any): Attachment {
  let url = data.url || '';
  if (url && url.startsWith('/')) {
    url = getApiBaseUrl() + url;
  }
  return {
    uid: data.uid || data.id || '',
    url,
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
    isPinned: data.is_pinned || false,
    commentCount: data.comment_count || 0,
    createdAt: data.create_time,
    updatedAt: data.update_time,
  };
}

export const bbtalkApi = {
  async getBBTalks(params?: {
    page?: number;
    search?: string;
    tags__name?: string;
    create_time__date?: string;
    create_time__gte?: string;
    create_time__lte?: string;
  }): Promise<PaginatedResponse<BBTalk>> {
    const data = await apiClient.get<any>('/api/v1/bbtalk/', params);
    return {
      count: data.count,
      next: data.next,
      previous: data.previous,
      results: data.results.map(transformBBTalk),
    };
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
      context: {
        ...data.context,
        source: { client: 'ChewyBBTalk Mobile', version: '1.0', platform: 'mobile' },
      },
    };

    if (data.attachments?.length) {
      payload.attachments = data.attachments.map((a) => ({
        uid: a.uid, url: a.url, type: a.type,
        filename: a.filename, original_filename: a.originalFilename,
        file_size: a.fileSize, mime_type: a.mimeType,
      }));
    }
    if (data.visibility) payload.visibility = data.visibility;

    const response = await apiClient.post<any>('/api/v1/bbtalk/', payload);
    return transformBBTalk(response);
  },

  async updateBBTalk(uid: string, bbtalk: Partial<BBTalk>): Promise<BBTalk> {
    const payload: any = {};
    if (bbtalk.content !== undefined) payload.content = bbtalk.content;
    if (bbtalk.tags !== undefined) payload.post_tags = bbtalk.tags.map(t => t.name).join(',');
    if (bbtalk.visibility) payload.visibility = bbtalk.visibility;
    if (bbtalk.attachments !== undefined) {
      payload.attachments = bbtalk.attachments.map(a => ({
        uid: a.uid, url: a.url, type: a.type,
        filename: a.filename, original_filename: a.originalFilename,
        file_size: a.fileSize, mime_type: a.mimeType,
      }));
    }
    const data = await apiClient.patch<any>(`/api/v1/bbtalk/${uid}/`, payload);
    return transformBBTalk(data);
  },

  async deleteBBTalk(uid: string): Promise<void> {
    await apiClient.delete(`/api/v1/bbtalk/${uid}/`);
  },

  async getPublicBBTalks(params?: { page?: number }): Promise<PaginatedResponse<BBTalk>> {
    const data = await apiClient.get<any>('/api/v1/bbtalk/public/', params);
    return {
      count: data.count, next: data.next, previous: data.previous,
      results: data.results.map(transformBBTalk),
    };
  },

  async togglePin(uid: string): Promise<BBTalk> {
    const data = await apiClient.post<any>(`/api/v1/bbtalk/${uid}/pin/`);
    return transformBBTalk(data);
  },

  async getDateCounts(params?: { year?: number; month?: number }): Promise<{ date: string; count: number }[]> {
    return apiClient.get<{ date: string; count: number }[]>('/api/v1/bbtalk/date-counts/', params);
  },

  async getComments(bbtalkUid: string): Promise<Comment[]> {
    const data = await apiClient.get<any[]>(`/api/v1/bbtalk/${bbtalkUid}/comments/`);
    return data.map((c: any) => ({
      uid: c.uid,
      user: c.user,
      userDisplayName: c.user_display_name || '',
      userAvatar: c.user_avatar || '',
      userUsername: c.user_username || '',
      content: c.content,
      createdAt: c.create_time,
      updatedAt: c.update_time,
    }));
  },

  async createComment(bbtalkUid: string, content: string): Promise<Comment> {
    const data = await apiClient.post<any>(`/api/v1/bbtalk/${bbtalkUid}/comments/`, { content });
    return {
      uid: data.uid,
      user: data.user,
      userDisplayName: data.user_display_name || '',
      userAvatar: data.user_avatar || '',
      userUsername: data.user_username || '',
      content: data.content,
      createdAt: data.create_time,
      updatedAt: data.update_time,
    };
  },

  async deleteComment(bbtalkUid: string, commentUid: string): Promise<void> {
    await apiClient.delete(`/api/v1/bbtalk/${bbtalkUid}/comments/${commentUid}/`);
  },
};
