import { apiClient } from './apiClient';
import type { User } from '../../types';

export const userApi = {
  async updateProfile(data: { display_name?: string; bio?: string; email?: string; avatar?: string }): Promise<User> {
    return apiClient.patch<User>('/api/v1/bbtalk/user/me/', data);
  },

  async deleteAccount(password: string): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>('/api/v1/bbtalk/user/delete-account/', { password });
  },
};
