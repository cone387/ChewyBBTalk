import { getPublicSetting } from '../../config';
import { apiClient } from './apiClient';
import type { BBTalk, PaginatedResponse, Attachment, Comment, CommentPage } from '../../types';

const API_BASE_URL = getPublicSetting('VITE_API_BASE_URL') || '';

function transformAttachment(data: any): Attachment {
  let url = data.url || '';
  
  // 处理相对路径：如果 URL 以 / 开头，拼接基础 URL
  if (url && url.startsWith('/')) {
    url = API_BASE_URL + url;
  }
  
  // 协议转换：仅在显式配置 VITE_MEDIA_URL_PROTOCOL 时生效
  const targetProtocol = getPublicSetting('VITE_MEDIA_URL_PROTOCOL');
  if (targetProtocol && url) {
    if (targetProtocol === 'https' && url.startsWith('http://')) {
      url = url.replace('http://', 'https://');
    } else if (targetProtocol === 'http' && url.startsWith('https://')) {
      url = url.replace('https://', 'http://');
    }
  }
  
  return {
    uid: data.uid || data.id || '',
    url: url,
    type: data.type || 'file',
    filename: data.filename,
    originalFilename: data.original_filename || data.filename,
    fileSize: data.file_size,
    mimeType: data.mime_type,
  };
}

export function transformBBTalk(data: any): BBTalk {
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
    commentPreview: Array.isArray(data.comment_preview) ? data.comment_preview.map(transformComment) : undefined,
    commentsRevision: data.comments_revision,
    createdAt: data.create_time,
    updatedAt: data.update_time,
  };
}

function transformComment(data: any): Comment {
  return {
    uid: data.uid, user: data.user, userDisplayName: data.user_display_name || '',
    userAvatar: data.user_avatar || '', userUsername: data.user_username || '',
    content: data.content, createdAt: data.create_time, updatedAt: data.update_time,
  };
}

function transformBBTalkToBackend(bbtalk: Partial<BBTalk>): any {
  const result: any = {};

  if (bbtalk.content !== undefined) {
    result.content = bbtalk.content;
  }

  if (bbtalk.tags !== undefined) {
    result.tags = bbtalk.tags.map((t) => t.name);
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
  if (bbtalk.isPinned !== undefined) result.is_pinned = bbtalk.isPinned;

  return result;
}

export const bbtalkApi = {
  async getBBTalks(params?: {
    page?: number;
    search?: string;
    tags?: string[];
    visibility?: string;
    has_attachments?: boolean;
    created_date_from?: string;
    created_date_to?: string;
    ordering?: string;
  }): Promise<PaginatedResponse<BBTalk>> {
    const data = await apiClient.get<any>('/api/v1/bbtalk', params);
    return {
      totalCount: data.total_count,
      count: data.count,
      next: data.next,
      previous: data.previous,
      results: data.results.map(transformBBTalk),
    };
  },

  async getBBTalk(uid: string): Promise<BBTalk> {
    const data = await apiClient.get<any>(`/api/v1/bbtalk/${uid}`);
    return transformBBTalk(data);
  },

  async createBBTalk(data: {
    content: string;
    submissionKey?: string;
    tags?: string[];
    attachments?: Attachment[];
    visibility?: 'public' | 'private' | 'friends';
    context?: Record<string, any>;
  }): Promise<BBTalk> {
    const payload: any = {
      content: data.content,
      tags: data.tags?.length ? data.tags : undefined,
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

    const response = await apiClient.post<any>('/api/v1/bbtalk', payload, data.submissionKey ? { 'Idempotency-Key': data.submissionKey } : undefined);
    return transformBBTalk(response);
  },

  async updateBBTalk(uid: string, bbtalk: Partial<BBTalk>, expectedUpdatedAt?: string): Promise<BBTalk> {
    const data = await apiClient.patch<any>(
      `/api/v1/bbtalk/${uid}`,
      transformBBTalkToBackend(bbtalk),
      expectedUpdatedAt ? { 'If-Match': expectedUpdatedAt } : undefined
    );
    if (bbtalk.visibility !== undefined || bbtalk.attachments !== undefined) {
      const { imageCacheService } = await import('../cache/imageCache');
      imageCacheService.invalidateProtected();
    }
    return transformBBTalk(data);
  },

  async submissionStatus(key: string): Promise<BBTalk> {
    return transformBBTalk(await apiClient.get<any>('/api/v1/bbtalk/submission-status', { key }));
  },

  async deleteBBTalk(uid: string): Promise<void> {
    await apiClient.delete(`/api/v1/bbtalk/${uid}`);
    const { imageCacheService } = await import('../cache/imageCache');
    imageCacheService.invalidateProtected();
  },

  async getPublicBBTalks(params?: {
    page?: number; search?: string; tags?: string[]; has_attachments?: boolean; created_date_from?: string; created_date_to?: string; ordering?: string;
  }): Promise<PaginatedResponse<BBTalk>> {
    const data = await apiClient.get<any>('/api/v1/bbtalk/public', params);
    return {
      totalCount: data.total_count,
      count: data.count,
      next: data.next,
      previous: data.previous,
      results: data.results.map(transformBBTalk),
    };
  },

  async getPublicBBTalk(uid: string): Promise<BBTalk> {
    const baseUrl = getPublicSetting('VITE_API_BASE_URL') || '';
    const response = await fetch(`${baseUrl}/api/v1/bbtalk/public/${uid}`, {
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

  async getComments(bbtalkUid: string, isPublic = false): Promise<Comment[]> {
    const data = await apiClient.get<any[]>(`/api/v1/bbtalk/${isPublic ? 'public/' : ''}${bbtalkUid}/comments`);
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

  async getCommentPage(bbtalkUid: string, page = 1, isPublic = false): Promise<CommentPage> {
    const data = await apiClient.get<any>(`/api/v1/bbtalk/${isPublic ? 'public/' : ''}${bbtalkUid}/comments`, { page, page_size: 20 });
    // Older servers ignore pagination parameters and return the complete array.
    if (Array.isArray(data)) return { count: data.length, next: null, previous: null, results: data.map(transformComment), revision: '' };
    return { count: data.count, next: data.next, previous: data.previous, results: data.results.map(transformComment), revision: data.revision };
  },

  async createComment(bbtalkUid: string, content: string): Promise<Comment> {
    const data = await apiClient.post<any>(`/api/v1/bbtalk/${bbtalkUid}/comments`, { content });
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
    await apiClient.delete(`/api/v1/bbtalk/${bbtalkUid}/comments/${commentUid}`);
  },
};

