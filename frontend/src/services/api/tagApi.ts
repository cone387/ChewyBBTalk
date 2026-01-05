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
  async getTags(params?: { app?: 'bbtalk' | 'todo' }): Promise<Tag[]> {
    const data = await apiClient.get<any[]>('/v1/tags/', params);
    return data.map(transformTag);
  },

  async createTag(tag: Partial<Tag>): Promise<Tag> {
    const payload = {
      name: tag.name,
      color: tag.color,
      sort_order: tag.sortOrder,
    };
    const data = await apiClient.post<any>('/v1/tags/', payload);
    return transformTag(data);
  },

  async updateTag(id: string, tag: Partial<Tag>): Promise<Tag> {
    const payload: any = {};
    if (tag.name !== undefined) payload.name = tag.name;
    if (tag.color !== undefined) payload.color = tag.color;
    if (tag.sortOrder !== undefined) payload.sort_order = tag.sortOrder;
    
    const data = await apiClient.patch<any>(`/v1/tags/${id}/`, payload);
    return transformTag(data);
  },

  async deleteTag(id: string): Promise<void> {
    await apiClient.delete(`/v1/tags/${id}/`);
  },
};
