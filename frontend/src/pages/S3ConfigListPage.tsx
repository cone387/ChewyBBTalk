import Icon from '../components/ui/Icon'
import Input from '../components/ui/Input';
import Checkbox from '../components/ui/Checkbox';
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
  
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof StorageSettingsUpdate, string>>>({});
  const setField = (key: keyof StorageSettingsUpdate, value: string | boolean) => {
    setFormData(previous => ({ ...previous, [key]: value }));
    setFieldErrors(previous => ({ ...previous, [key]: undefined }));
  };
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
    setFieldErrors({});
    setError(null);
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
    setFieldErrors({});
    setError(null);
    setShowEditModal(true);
  };

  const handleSave = async () => {
    const errors: Partial<Record<keyof StorageSettingsUpdate, string>> = {};
    if (!formData.name?.trim()) errors.name = '请输入配置名称';
    if (!formData.s3_access_key_id?.trim()) errors.s3_access_key_id = '请输入 Access Key ID';
    if (!formData.s3_bucket_name?.trim()) errors.s3_bucket_name = '请输入 Bucket 名称';
    if (isCreating && !formData.s3_secret_access_key?.trim()) errors.s3_secret_access_key = '创建配置时必须提供 Secret Access Key';
    if (formData.s3_endpoint_url?.trim()) {
      try {
        const endpoint = new URL(formData.s3_endpoint_url);
        if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error('protocol');
      } catch { errors.s3_endpoint_url = '请输入完整的 http:// 或 https:// 端点 URL'; }
    }
    setFieldErrors(errors);
    const firstError = Object.keys(errors)[0];
    if (firstError) {
      requestAnimationFrame(() => document.getElementById('s3-' + firstError)?.focus());
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
              <Icon className="w-8 h-8 sm:w-10 sm:h-10 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
              </Icon>
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
                      <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                      </Icon>
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
                  <div className="flex flex-wrap items-center justify-end gap-2 mt-2">
                    {!config.is_active && (
                      <button
                        onClick={() => handleActivate(config)}
                        className="storage-action"
                      >
                        激活
                      </button>
                    )}
                    {config.is_s3_configured && (
                      <button
                        onClick={() => handleTestConnection(config)}
                        disabled={testingId === config.id}
                        className="storage-action"
                      >
                        {testingId === config.id ? (
                          <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        ) : null}
                        {testingId === config.id ? '测试中...' : '测试'}
                      </button>
                    )}
                    <button
                      onClick={() => handleEdit(config)}
                      className="storage-action"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleDelete(config)}
                      className="storage-action storage-action--danger"
                    >
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
              <div className="space-y-4">
                <Input id="s3-name" label="配置名称 *" required disabled={saving} error={fieldErrors.name}
                  value={formData.name || ''} onChange={e => setField('name', e.target.value)} placeholder="例如：阿里云 OSS、MinIO 测试" />
                <Input id="s3-s3_access_key_id" label="Access Key ID *" required disabled={saving} error={fieldErrors.s3_access_key_id}
                  value={formData.s3_access_key_id || ''} onChange={e => setField('s3_access_key_id', e.target.value)} placeholder="输入 Access Key ID" />
                <Input id="s3-s3_secret_access_key" label={isCreating ? 'Secret Access Key *' : 'Secret Access Key'} type="password" required={isCreating} disabled={saving}
                  autoComplete="new-password" error={fieldErrors.s3_secret_access_key}
                  aria-describedby={!isCreating && editingConfig?.has_secret_key ? 's3-secret-help' : undefined}
                  value={formData.s3_secret_access_key || ''} onChange={e => setField('s3_secret_access_key', e.target.value)} placeholder={isCreating ? '输入 Secret Access Key' : '留空则不修改'} />
                {!isCreating && editingConfig?.has_secret_key && <p id="s3-secret-help" className="text-sm text-gray-600">已配置密钥，留空则不修改</p>}
                <Input id="s3-s3_bucket_name" label="Bucket 名称 *" required disabled={saving} error={fieldErrors.s3_bucket_name}
                  value={formData.s3_bucket_name || ''} onChange={e => setField('s3_bucket_name', e.target.value)} placeholder="输入 Bucket 名称" />
                <Input id="s3-s3_region_name" label="区域" disabled={saving}
                  value={formData.s3_region_name || ''} onChange={e => setField('s3_region_name', e.target.value)} placeholder="us-east-1" />
                <Input id="s3-s3_endpoint_url" label="端点 URL" type="url" disabled={saving} error={fieldErrors.s3_endpoint_url}
                  value={formData.s3_endpoint_url || ''} onChange={e => setField('s3_endpoint_url', e.target.value)} placeholder="MinIO / OSS 等自定义端点" />
                <Input id="s3-s3_custom_domain" label="自定义域名" disabled={saving}
                  value={formData.s3_custom_domain || ''} onChange={e => setField('s3_custom_domain', e.target.value)} placeholder="cdn.example.com（可选）" />
                <Checkbox label="激活此配置" disabled={saving} checked={formData.is_active || false} onChange={e => setField('is_active', e.target.checked)} />
              </div>
        </Modal>
      )}
    </SettingsLayout>
  );
}
