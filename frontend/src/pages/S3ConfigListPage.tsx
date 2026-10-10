import Modal from '../components/ui/Modal';
import SettingsLayout from '../components/layout/SettingsLayout';
import { useState, useEffect } from 'react';
import { settingsApi } from '../services/api/settingsApi';
import type { StorageSettings, StorageSettingsUpdate } from '../types';
import Toast from '../components/ui/Toast';

export default function S3ConfigListPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const [configList, setConfigList] = useState<StorageSettings[]>([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<StorageSettings | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  
  const [formData, setFormData] = useState<StorageSettingsUpdate>({
    name: '',
    storage_type: 's3',
    s3_access_key_id: '',
    s3_secret_access_key: '',
    s3_bucket_name: '',
    s3_region_name: 'us-east-1',
    s3_endpoint_url: '',
    s3_custom_domain: '',
    is_active: false,
  });
  
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      setLoading(true);
      const configs = await settingsApi.listStorageSettings();
      setConfigList(configs.filter(config => config.storage_type === 's3'));
    } catch (err) {
      console.error('加载配置列表失败:', err);
      setError('加载配置列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setIsCreating(true);
    setEditingConfig(null);
    setFormData({
      name: '',
      storage_type: 's3',
      s3_access_key_id: '',
      s3_secret_access_key: '',
      s3_bucket_name: '',
      s3_region_name: 'us-east-1',
      s3_endpoint_url: '',
      s3_custom_domain: '',
      is_active: false,
    });
    setShowEditModal(true);
  };

  const handleEdit = (config: StorageSettings) => {
    setIsCreating(false);
    setEditingConfig(config);
    setFormData({
      name: config.name,
      storage_type: config.storage_type,
      s3_access_key_id: config.s3_access_key_id,
      s3_secret_access_key: '',
      s3_bucket_name: config.s3_bucket_name,
      s3_region_name: config.s3_region_name,
      s3_endpoint_url: config.s3_endpoint_url,
      s3_custom_domain: config.s3_custom_domain,
      is_active: config.is_active,
    });
    setShowEditModal(true);
  };

  const handleSave = async () => {
    if (!formData.name?.trim()) {
      setError('请输入配置名称');
      return;
    }
    if (!formData.s3_access_key_id?.trim() || !formData.s3_bucket_name?.trim()) {
      setError('请填写完整的 S3 配置信息');
      return;
    }
    if (isCreating && !formData.s3_secret_access_key?.trim()) {
      setError('创建配置时必须提供 Secret Access Key');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const cleanData: StorageSettingsUpdate = { ...formData };
      if (!cleanData.s3_secret_access_key) {
        delete cleanData.s3_secret_access_key;
      }
      
      if (isCreating) {
        await settingsApi.createStorageSettings(cleanData);
        setSuccess('配置创建成功');
      } else if (editingConfig) {
        await settingsApi.updateStorageSettings(editingConfig.id, cleanData);
        setSuccess('配置更新成功');
      }
      
      setShowEditModal(false);
      await loadConfigs();
    } catch (err: any) {
      console.error('保存配置失败:', err);
      setError(err.message || '保存配置失败');
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async (config: StorageSettings) => {
    try {
      await settingsApi.activateStorageSettings(config.id);
      setSuccess(`已激活配置: ${config.name}`);
      await loadConfigs();
    } catch (err: any) {
      setError(err.message || '激活配置失败');
    }
  };

  const handleDelete = async (config: StorageSettings) => {
    if (!confirm(`确定要删除配置 "${config.name}" 吗？`)) return;
    try {
      await settingsApi.deleteStorageSettings(config.id);
      setSuccess('配置已删除');
      await loadConfigs();
    } catch (err: any) {
      setError(err.message || '删除配置失败');
    }
  };

  const handleTestConnection = async (config: StorageSettings) => {
    try {
      setTestingId(config.id);
      setError(null);
      const result = await settingsApi.testStorageConnectionById(config.id);
      if (result.success) {
        setSuccess(result.message);
      } else {
        setError(result.message);
      }
    } catch (err: any) {
      setError(err.message || '测试连接失败');
    } finally {
      setTestingId(null);
    }
  };

  if (loading) {
    return (
      <SettingsLayout title="S3 配置管理" description="添加和验证云存储连接。" active="/settings/storage" backTo="/settings/storage" backLabel="返回存储设置">
        <p role="status" className="settings-panel p-6 text-sm text-gray-500">加载中...</p>
      </SettingsLayout>
    );
  }

  return (
    <SettingsLayout title="S3 配置管理" description="添加和验证云存储连接。" active="/settings/storage" backTo="/settings/storage" backLabel="返回存储设置" action={<button type="button" onClick={handleCreate} className="app-button app-button--primary">新建配置</button>}>

      {error && <Toast message={error} type="error" onClose={() => setError(null)} />}
      {success && <Toast message={success} type="success" onClose={() => setSuccess(null)} />}

      <div className="settings-body">
        {configList.length === 0 ? (
          <div className="settings-panel p-8 sm:p-12 text-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 sm:w-10 sm:h-10 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
              </svg>
            </div>
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">还没有 S3 配置</h3>
            <p className="text-sm text-gray-500 mb-6">添加 AWS S3、阿里云 OSS、MinIO 等</p>
            <button
              onClick={handleCreate}
              className="app-button app-button--primary"
            >
              创建第一个配置
            </button>
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {configList.map((config) => (
              <div
                key={config.id}
                className={`bg-white rounded-xl sm:rounded-xl shadow-sm sm:shadow-none border-2 transition-all ${
                  config.is_active ? 'border-green-500 shadow-green-100' : 'border-gray-100'
                }`}
              >
                <div className="p-3 sm:p-5">
                  {/* 顶部：图标 + 配置信息 */}
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0 bg-gray-100`}>
                      <svg className="w-5 h-5 sm:w-6 sm:h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                      </svg>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                        <h3 className="text-sm sm:text-base font-semibold text-gray-900 truncate">{config.name}</h3>
                        {config.is_active && (
                          <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs sm:text-xs font-medium rounded-full whitespace-nowrap">
                            当前使用
                          </span>
                        )}
                        {!config.is_s3_configured && (
                          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs sm:text-xs font-medium rounded-full whitespace-nowrap">
                            未完成
                          </span>
                        )}
                      </div>
                      
                      <div className="mt-1 text-xs sm:text-sm text-gray-500">
                        <span>{config.s3_bucket_name || '-'}</span>
                        {config.s3_endpoint_url && (
                          <span className="ml-1.5 truncate"> · {config.s3_endpoint_url}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 底部：操作按钮 */}
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                    {!config.is_active && (
                      <button
                        onClick={() => handleActivate(config)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 active:bg-green-200 transition-colors text-xs sm:text-sm font-medium"
                      >
                        <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        激活
                      </button>
                    )}
                    {config.is_s3_configured && (
                      <button
                        onClick={() => handleTestConnection(config)}
                        disabled={testingId === config.id}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 active:bg-gray-200 transition-colors text-xs sm:text-sm font-medium disabled:opacity-50"
                      >
                        {testingId === config.id ? (
                          <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                        )}
                        {testingId === config.id ? '测试中...' : '测试'}
                      </button>
                    )}
                    <button
                      onClick={() => handleEdit(config)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 active:bg-blue-200 transition-colors text-xs sm:text-sm font-medium"
                    >
                      <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      编辑
                    </button>
                    <button
                      onClick={() => handleDelete(config)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 active:bg-red-200 transition-colors text-xs sm:text-sm font-medium"
                    >
                      <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      删除
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}


      </div>

      {/* 编辑与创建共用可访问对话框 */}
      {showEditModal && (
        <Modal visible title={isCreating ? '创建 S3 配置' : '编辑 S3 配置'} onClose={() => { if (!saving) setShowEditModal(false); }}
          footer={
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowEditModal(false)}
                  disabled={saving}
                  className="app-button app-button--secondary"
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="app-button app-button--primary"
                >
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>}>
              {/* 表单内容 - 可滚动 */}
              <div className="space-y-4">
                <div>
                  <label htmlFor="s3-name" className="block text-sm font-medium text-gray-700 mb-1.5">
                    配置名称 <span className="text-red-500">*</span>
                  </label>
                  <input id="s3-name"
                    type="text"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="例如：阿里云 OSS、MinIO 测试"
                    className="app-input"
                  />
                </div>
                <div>
                  <label htmlFor="s3-s3_access_key_id" className="block text-sm font-medium text-gray-700 mb-1.5">
                    Access Key ID <span className="text-red-500">*</span>
                  </label>
                  <input id="s3-s3_access_key_id"
                    type="text"
                    value={formData.s3_access_key_id || ''}
                    onChange={(e) => setFormData({ ...formData, s3_access_key_id: e.target.value })}
                    placeholder="输入 Access Key ID"
                    className="app-input"
                  />
                </div>
                <div>
                  <label htmlFor="s3-s3_secret_access_key" className="block text-sm font-medium text-gray-700 mb-1.5">
                    Secret Access Key {isCreating && <span className="text-red-500">*</span>}
                  </label>
                  <input id="s3-s3_secret_access_key"
                    type="password"
                    value={formData.s3_secret_access_key || ''}
                    onChange={(e) => setFormData({ ...formData, s3_secret_access_key: e.target.value })}
                    placeholder={isCreating ? '输入 Secret Access Key' : '留空则不修改'}
                    className="app-input"
                  />
                  {!isCreating && editingConfig?.has_secret_key && (
                    <p className="mt-1 text-xs text-gray-500">已配置密钥，留空则不修改</p>
                  )}
                </div>
                <div>
                  <label htmlFor="s3-s3_bucket_name" className="block text-sm font-medium text-gray-700 mb-1.5">
                    Bucket 名称 <span className="text-red-500">*</span>
                  </label>
                  <input id="s3-s3_bucket_name"
                    type="text"
                    value={formData.s3_bucket_name || ''}
                    onChange={(e) => setFormData({ ...formData, s3_bucket_name: e.target.value })}
                    placeholder="输入 Bucket 名称"
                    className="app-input"
                  />
                </div>
                <div>
                  <label htmlFor="s3-s3_region_name" className="block text-sm font-medium text-gray-700 mb-1.5">区域</label>
                  <input id="s3-s3_region_name"
                    type="text"
                    value={formData.s3_region_name || ''}
                    onChange={(e) => setFormData({ ...formData, s3_region_name: e.target.value })}
                    placeholder="us-east-1"
                    className="app-input"
                  />
                </div>
                <div>
                  <label htmlFor="s3-s3_endpoint_url" className="block text-sm font-medium text-gray-700 mb-1.5">端点 URL</label>
                  <input id="s3-s3_endpoint_url"
                    type="url"
                    value={formData.s3_endpoint_url || ''}
                    onChange={(e) => setFormData({ ...formData, s3_endpoint_url: e.target.value })}
                    placeholder="MinIO / OSS 等自定义端点"
                    className="app-input"
                  />
                </div>
                <div>
                  <label htmlFor="s3-s3_custom_domain" className="block text-sm font-medium text-gray-700 mb-1.5">自定义域名</label>
                  <input id="s3-s3_custom_domain"
                    type="text"
                    value={formData.s3_custom_domain || ''}
                    onChange={(e) => setFormData({ ...formData, s3_custom_domain: e.target.value })}
                    placeholder="cdn.example.com（可选）"
                    className="app-input"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={formData.is_active || false}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="is_active" className="text-sm font-medium text-gray-700">
                    激活此配置
                  </label>
                </div>
              </div>
              
        </Modal>
      )}
    </SettingsLayout>
  );
}
