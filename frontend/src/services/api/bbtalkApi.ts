import { apiClient } from './apiClient';
import type { BBTalk, PaginatedResponse } from '../../types';

function transformBBTalk(data: any): BBTalk {
  return {
    id: data.uid,
    content: data.content,
    visibility: data.visibility || 'private',
    tags: data.tags || [],
    media: data.media || [],
    context: data.context || {},
    createdAt: data.create_time,
    updatedAt: data.update_time,
    isDeleted: false,
    deletedAt: null,
  };
}

function transformBBTalkToBackend(bbtalk: Partial<BBTalk>): any {
  const result: any = {
    content: bbtalk.content,
    post_tags: bbtalk.tags?.map((t) => t.name).join(',') || '',
    context: bbtalk.context,
  };

  if (bbtalk.media !== undefined) {
    result.post_media = bbtalk.media.map((m) => m.id);
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
  }): Promise<PaginatedResponse<BBTalk>> {
    const data = await apiClient.get<any>('/v1/bbtalk/', params);
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
    mediaUids?: string[];
    visibility?: 'public' | 'private';
    context?: Record<string, any>;
  }): Promise<BBTalk> {
    const payload: any = {
      content: data.content,
      post_tags: data.tags?.join(',') || undefined,
      post_media: data.mediaUids || [],
      context: data.context,
    };

    if (data.visibility) {
      payload.visibility = data.visibility;
    }

    const response = await apiClient.post<any>('/v1/bbtalk/', payload);
    return transformBBTalk(response);
  },

  async updateBBTalk(id: string, bbtalk: Partial<BBTalk>): Promise<BBTalk> {
    const data = await apiClient.patch<any>(
      `/v1/bbtalk/${id}/`,
      transformBBTalkToBackend(bbtalk)
    );
    return transformBBTalk(data);
  },

  async deleteBBTalk(id: string): Promise<void> {
    await apiClient.delete(`/v1/bbtalk/${id}/`);
  },

  async getPublicBBTalk(id: string): Promise<BBTalk> {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
    const response = await fetch(`${baseUrl}/v1/bbtalk/public/${id}/`, {
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

