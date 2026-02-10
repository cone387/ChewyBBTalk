import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { settingsApi } from '../services/api/settingsApi';
import type { StorageSettings, StorageSettingsUpdate } from '../types';
import Toast from '../components/ui/Toast';

export default function S3ConfigListPage() {
  const navigate = useNavigate();
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
      setConfigList(configs);
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
      is_active: configList.length === 0,
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={() => navigate('/settings/storage')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-lg sm:text-xl font-semibold text-gray-900">S3 配置管理</h1>
          </div>
          <button
            onClick={handleCreate}
            className="p-2 sm:px-4 sm:py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:shadow-lg transition-all text-sm"
          >
            <svg className="w-5 h-5 sm:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <div className="hidden sm:flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              新建配置
            </div>
          </button>
        </div>
      </header>

      {error && <Toast message={error} type="error" onClose={() => setError(null)} />}
      {success && <Toast message={success} type="success" onClose={() => setSuccess(null)} />}

      <main className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {configList.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 sm:p-12 text-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 sm:w-10 sm:h-10 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
              </svg>
            </div>
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">还没有 S3 配置</h3>
            <p className="text-sm text-gray-500 mb-6">添加 AWS S3、阿里云 OSS、MinIO 等</p>
            <button
              onClick={handleCreate}
              className="px-5 py-2.5 sm:px-6 sm:py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:shadow-lg transition-all text-sm"
            >
              创建第一个配置
            </button>
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {configList.map((config) => (
              <div
                key={config.id}
                className={`bg-white rounded-xl sm:rounded-2xl shadow-sm sm:shadow-lg border-2 transition-all ${
                  config.is_active ? 'border-green-500 shadow-green-100' : 'border-gray-100'
                }`}
              >
                <div className="p-3 sm:p-5">
                  {/* 顶部：图标 + 配置信息 */}
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0 ${
                      config.is_active
                        ? 'bg-gradient-to-br from-green-500 to-emerald-600'
                        : 'bg-gradient-to-br from-gray-400 to-gray-500'
                    }`}>
                      <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                      </svg>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                        <h3 className="text-sm sm:text-base font-semibold text-gray-900 truncate">{config.name}</h3>
                        {config.is_active && (
                          <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] sm:text-xs font-medium rounded-full whitespace-nowrap">
                            当前使用
                          </span>
                        )}
                        {!config.is_s3_configured && (
                          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] sm:text-xs font-medium rounded-full whitespace-nowrap">
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
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-cyan-50 text-cyan-600 rounded-lg hover:bg-cyan-100 active:bg-cyan-200 transition-colors text-xs sm:text-sm font-medium disabled:opacity-50"
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


      </main>

      {/* 编辑/创建 - 移动端全屏页面，桌面端 Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 bg-white sm:bg-transparent">
          {/* 桌面端遮罩 */}
          <div className="hidden sm:block fixed inset-0 bg-black/50" onClick={() => setShowEditModal(false)} />
          
          <div className="relative sm:fixed sm:inset-0 sm:flex sm:items-center sm:justify-center sm:p-4 h-full">
            <div className="relative bg-white sm:rounded-xl sm:shadow-2xl w-full sm:max-w-lg sm:max-h-[90vh] h-full sm:h-auto flex flex-col" onClick={(e) => e.stopPropagation()}>
              {/* 表单头部 */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowEditModal(false)}
                    className="p-1 sm:hidden hover:bg-gray-100 rounded-lg"
                  >
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900">
                    {isCreating ? '创建 S3 配置' : '编辑 S3 配置'}
                  </h3>
                </div>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="hidden sm:block text-gray-400 hover:text-gray-600 p-1"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              {/* 表单内容 - 可滚动 */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    配置名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="例如：阿里云 OSS、MinIO 测试"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Access Key ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.s3_access_key_id || ''}
                    onChange={(e) => setFormData({ ...formData, s3_access_key_id: e.target.value })}
                    placeholder="输入 Access Key ID"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Secret Access Key {isCreating && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="password"
                    value={formData.s3_secret_access_key || ''}
                    onChange={(e) => setFormData({ ...formData, s3_secret_access_key: e.target.value })}
                    placeholder={isCreating ? '输入 Secret Access Key' : '留空则不修改'}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                  {!isCreating && editingConfig?.has_secret_key && (
                    <p className="mt-1 text-xs text-gray-500">已配置密钥，留空则不修改</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Bucket 名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.s3_bucket_name || ''}
                    onChange={(e) => setFormData({ ...formData, s3_bucket_name: e.target.value })}
                    placeholder="输入 Bucket 名称"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">区域</label>
                  <input
                    type="text"
                    value={formData.s3_region_name || ''}
                    onChange={(e) => setFormData({ ...formData, s3_region_name: e.target.value })}
                    placeholder="us-east-1"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">端点 URL</label>
                  <input
                    type="url"
                    value={formData.s3_endpoint_url || ''}
                    onChange={(e) => setFormData({ ...formData, s3_endpoint_url: e.target.value })}
                    placeholder="MinIO / OSS 等自定义端点"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">自定义域名</label>
                  <input
                    type="text"
                    value={formData.s3_custom_domain || ''}
                    onChange={(e) => setFormData({ ...formData, s3_custom_domain: e.target.value })}
                    placeholder="cdn.example.com（可选）"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
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
              
              {/* 底部固定按钮 */}
              <div className="flex gap-3 px-4 py-3 border-t border-gray-200 flex-shrink-0 bg-white safe-area-bottom">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-colors text-sm"
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:shadow-lg active:opacity-90 transition-all disabled:opacity-50 text-sm"
                >
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
