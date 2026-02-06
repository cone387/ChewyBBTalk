import { apiClient } from './apiClient';
import type { StorageSettings, StorageSettingsUpdate, StorageTestResult } from '../../types';

export const settingsApi = {
  /**
   * 获取当前用户的存储设置
   */
  async getStorageSettings(): Promise<StorageSettings> {
    return apiClient.get<StorageSettings>('/api/v1/bbtalk/settings/storage/');
  },

  /**
   * 更新存储设置
   */
  async updateStorageSettings(data: StorageSettingsUpdate): Promise<StorageSettings> {
    return apiClient.patch<StorageSettings>('/api/v1/bbtalk/settings/storage/update/', data);
  },

  /**
   * 测试 S3 存储连接
   */
  async testStorageConnection(): Promise<StorageTestResult> {
    return apiClient.post<StorageTestResult>('/api/v1/bbtalk/settings/storage/test/');
  },
};
