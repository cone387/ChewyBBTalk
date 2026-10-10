import { apiErrorMessage } from '../apiErrorMessage';
import { getPublicSetting } from '../../config';
import { getAccessToken } from '../auth';

export interface ExportOptions {
  format?: 'json' | 'zip';
  include_attachments?: boolean;
}

export interface ImportOptions {
  overwrite_tags?: boolean;
  skip_duplicates?: boolean;
  import_storage_settings?: boolean;
}

export interface ImportStats {
  tags_created: number;
  tags_skipped: number;
  bbtalks_created: number;
  bbtalks_skipped: number;
  storage_settings_created: number;
  attachments_created: number;
  attachments_skipped: number;
  comments_created: number;
  comments_skipped: number;
  errors: string[];
}

export interface ValidationResult {
  valid: boolean;
  file_type: string | null;
  version: string | null;
  export_time: string | null;
  preview: {
    tags_count: number;
    bbtalks_count: number;
    storage_settings_count: number;
    attachments_count?: number;
    comments_count?: number;
  };
  error: string | null;
}

const API_BASE_URL = getPublicSetting('VITE_API_BASE_URL') || '';

export const dataApi = {
  /**
   * 导出用户数据
   */
  async exportData(options: ExportOptions = {}): Promise<Blob> {
    const params = new URLSearchParams();
    if (options.format) params.append('format', options.format);
    if (options.include_attachments) params.append('include_attachments', 'true');
    
    const url = `${API_BASE_URL}/api/v1/bbtalk/data/export?${params.toString()}`;
    const token = getAccessToken();
    
    if (!token) {
      throw new Error('未登录，请先登录');
    }
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(apiErrorMessage(data, '导出失败'));
    }
    
    return response.blob();
  },

  /**
   * 导入用户数据
   */
  async importData(file: File, options: ImportOptions = {}): Promise<{ success: boolean; partial?: boolean; message: string; stats: ImportStats }> {
    const formData = new FormData();
    formData.append('file', file);
    
    if (options.overwrite_tags !== undefined) {
      formData.append('overwrite_tags', options.overwrite_tags.toString());
    }
    if (options.skip_duplicates !== undefined) {
      formData.append('skip_duplicates', options.skip_duplicates.toString());
    }
    if (options.import_storage_settings !== undefined) {
      formData.append('import_storage_settings', options.import_storage_settings.toString());
    }
    
    const token = getAccessToken();
    
    if (!token) {
      throw new Error('未登录，请先登录');
    }
    
    const response = await fetch(`${API_BASE_URL}/api/v1/bbtalk/data/import`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(apiErrorMessage(data, '导入失败'));
    }
    
    const { imageCacheService } = await import('../cache/imageCache');
    imageCacheService.invalidateProtected();
    return data;
  },

  /**
   * 验证导入文件
   */
  async validateImport(file: File): Promise<ValidationResult> {
    const formData = new FormData();
    formData.append('file', file);
    
    const token = getAccessToken();
    
    if (!token) {
      throw new Error('未登录，请先登录');
    }
    
    const response = await fetch(`${API_BASE_URL}/api/v1/bbtalk/data/validate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(apiErrorMessage(data, '文件验证失败'));
    }
    
    return data;
  },
};
