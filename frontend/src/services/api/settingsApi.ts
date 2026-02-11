import { apiClient } from './apiClient';
import type { StorageSettings, StorageSettingsUpdate, StorageTestResult } from '../../types';

export const settingsApi = {
  /**
   * 获取当前用户的所有存储配置
   */
  async listStorageSettings(): Promise<StorageSettings[]> {
    return apiClient.get<StorageSettings[]>('/api/v1/bbtalk/settings/storage/');
  },

  /**
   * 获取当前激活的存储配置
   */
  async getActiveStorageSettings(): Promise<StorageSettings> {
    return apiClient.get<StorageSettings>('/api/v1/bbtalk/settings/storage/active/');
  },

  /**
   * 创建新的存储配置
   */
  async createStorageSettings(data: StorageSettingsUpdate): Promise<StorageSettings> {
    return apiClient.post<StorageSettings>('/api/v1/bbtalk/settings/storage/create/', data);
  },

  /**
   * 更新存储配置
   */
  async updateStorageSettings(id: number, data: StorageSettingsUpdate): Promise<StorageSettings> {
    return apiClient.patch<StorageSettings>(`/api/v1/bbtalk/settings/storage/${id}/`, data);
  },

  /**
   * 删除存储配置
   */
  async deleteStorageSettings(id: number): Promise<void> {
    return apiClient.delete(`/api/v1/bbtalk/settings/storage/${id}/delete/`);
  },

  /**
   * 激活指定的存储配置
   */
  async activateStorageSettings(id: number): Promise<StorageSettings> {
    return apiClient.post<StorageSettings>(`/api/v1/bbtalk/settings/storage/${id}/activate/`);
  },

  /**
   * 取消所有 S3 配置激活，切换为服务器存储
   */
  async deactivateAllStorage(): Promise<void> {
    return apiClient.post('/api/v1/bbtalk/settings/storage/deactivate-all/');
  },

  /**
   * 测试 S3 存储连接（当前激活配置）
   */
  async testStorageConnection(): Promise<StorageTestResult> {
    return apiClient.post<StorageTestResult>('/api/v1/bbtalk/settings/storage/test/');
  },

  /**
   * 测试指定 S3 配置的连接
   */
  async testStorageConnectionById(id: number): Promise<StorageTestResult> {
    return apiClient.post<StorageTestResult>(`/api/v1/bbtalk/settings/storage/${id}/test/`);
  },

  /**
   * 预览存储迁移：查看需要迁移的附件数量
   */
  async migrationPreview(targetConfigId: number | null): Promise<{
    total: number;
    need_migrate: number;
    already_on_target: number;
  }> {
    return apiClient.post('/api/v1/bbtalk/storage/migration/preview/', {
      target_config_id: targetConfigId,
    });
  },

  /**
   * 执行存储迁移
   */
  async migrationExecute(targetConfigId: number | null): Promise<{
    success: boolean;
    stats: {
      total: number;
      migrated: number;
      skipped: number;
      failed: number;
      errors: string[];
    };
    error?: string;
  }> {
    return apiClient.post('/api/v1/bbtalk/storage/migration/execute/', {
      target_config_id: targetConfigId,
    });
  },
};
