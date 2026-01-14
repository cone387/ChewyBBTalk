import { apiClient } from './apiClient';
import type { Tag } from '../../types';

function transformTag(data: any): Tag {
  return {
    id: data.uid,
    name: data.name,
    color: data.color,
    sortOrder: data.sort_order,
    bbtalkCount: data.bbtalk_count,
  };
}

export const tagApi = {
  async getTags(): Promise<Tag[]> {
    const data = await apiClient.get<any>('/api/v1/bbtalk/tags/');
    // API 返回分页结果
    const results = data.results || data;
    return (Array.isArray(results) ? results : []).map(transformTag);
  },

  async createTag(tag: Partial<Tag>): Promise<Tag> {
    const payload = {
      name: tag.name,
      color: tag.color,
      sort_order: tag.sortOrder,
    };
    const data = await apiClient.post<any>('/api/v1/bbtalk/tags/', payload);
    return transformTag(data);
  },

  async updateTag(uid: string, tag: Partial<Tag>): Promise<Tag> {
    const payload: any = {};
    if (tag.name !== undefined) payload.name = tag.name;
    if (tag.color !== undefined) payload.color = tag.color;
    if (tag.sortOrder !== undefined) payload.sort_order = tag.sortOrder;
    
    const data = await apiClient.patch<any>(`/api/v1/bbtalk/tags/${uid}/`, payload);
    return transformTag(data);
  },

  async deleteTag(uid: string): Promise<void> {
    await apiClient.delete(`/api/v1/bbtalk/tags/${uid}/`);
  },
};
