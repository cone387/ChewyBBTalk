import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { settingsApi } from '../services/api/settingsApi';
import type { StorageSettings, StorageSettingsUpdate } from '../types';
import Toast from '../components/ui/Toast';
import Modal from '../components/ui/Modal';

export default function SettingsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // 表单状态
  const [storageType, setStorageType] = useState<'local' | 's3'>('local');
  const [s3AccessKeyId, setS3AccessKeyId] = useState('');
  const [s3SecretAccessKey, setS3SecretAccessKey] = useState('');
  const [s3BucketName, setS3BucketName] = useState('');
  const [s3RegionName, setS3RegionName] = useState('us-east-1');
  const [s3EndpointUrl, setS3EndpointUrl] = useState('');
  const [s3CustomDomain, setS3CustomDomain] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [hasSecretKey, setHasSecretKey] = useState(false);
  const [isS3Configured, setIsS3Configured] = useState(false);
  const [showS3Modal, setShowS3Modal] = useState(false);

  // 加载设置
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const settings = await settingsApi.getStorageSettings();
      setStorageType(settings.storage_type);
      setS3AccessKeyId(settings.s3_access_key_id || '');
      setS3BucketName(settings.s3_bucket_name || '');
      setS3RegionName(settings.s3_region_name || 'us-east-1');
      setS3EndpointUrl(settings.s3_endpoint_url || '');
      setS3CustomDomain(settings.s3_custom_domain || '');
      setIsActive(settings.is_active);
      setHasSecretKey(settings.has_secret_key);
      setIsS3Configured(settings.is_s3_configured);
    } catch (err) {
      console.error('加载设置失败:', err);
      setError('加载设置失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      
      const data: StorageSettingsUpdate = {
        storage_type: storageType,
        s3_access_key_id: s3AccessKeyId,
        s3_bucket_name: s3BucketName,
        s3_region_name: s3RegionName,
        s3_endpoint_url: s3EndpointUrl,
        s3_custom_domain: s3CustomDomain,
        is_active: isActive,
      };
      
      // 只有当用户输入了新密钥时才更新
      if (s3SecretAccessKey) {
        data.s3_secret_access_key = s3SecretAccessKey;
      }
      
      const settings = await settingsApi.updateStorageSettings(data);
      setHasSecretKey(settings.has_secret_key);
      setIsS3Configured(settings.is_s3_configured);
      setS3SecretAccessKey(''); // 清空密钥输入
      setSuccess('设置已保存');
    } catch (err: any) {
      console.error('保存设置失败:', err);
      setError(err.message || '保存设置失败');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setTesting(true);
      setError(null);
      
      const result = await settingsApi.testStorageConnection();
      if (result.success) {
        setSuccess(result.message);
      } else {
        setError(result.message);
      }
    } catch (err: any) {
      console.error('测试连接失败:', err);
      setError(err.message || '测试连接失败');
    } finally {
      setTesting(false);
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
      {/* 顶部导航 */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-semibold text-gray-900">设置</h1>
        </div>
      </header>

      {/* Toast 提示 */}
      {error && (
        <Toast 
          message={error} 
          type="error" 
          onClose={() => setError(null)} 
        />
      )}
      {success && (
        <Toast 
          message={success} 
          type="success" 
          onClose={() => setSuccess(null)} 
        />
      )}

      {/* 主内容 */}
      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* 存储设置卡片 */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          {/* 卡片头部 */}
          <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-purple-50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">存储设置</h2>
                <p className="text-sm text-gray-500">配置文件存储方式，支持本地存储或 S3 兼容存储</p>
              </div>
            </div>
          </div>

          {/* 表单内容 */}
          <div className="p-6 space-y-6">
            {/* 存储类型选择 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">存储类型</label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setStorageType('local')}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    storageType === 'local'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      storageType === 'local' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'
                    }`}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                      </svg>
                    </div>
                    <div className="text-left">
                      <div className={`font-medium ${storageType === 'local' ? 'text-blue-700' : 'text-gray-700'}`}>
                        本地存储
                      </div>
                      <div className="text-xs text-gray-500">使用服务器本地存储</div>
                    </div>
                  </div>
                </button>
                
                <button
                  type="button"
                  onClick={() => setStorageType('s3')}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    storageType === 's3'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      storageType === 's3' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'
                    }`}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                      </svg>
                    </div>
                    <div className="text-left">
                      <div className={`font-medium ${storageType === 's3' ? 'text-blue-700' : 'text-gray-700'}`}>
                        S3 存储
                      </div>
                      <div className="text-xs text-gray-500">AWS S3 / MinIO / OSS</div>
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* S3 配置列表 */}
            {storageType === 's3' && (
              <div className="space-y-4 pt-2">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="flex gap-3">
                    <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="text-sm text-amber-800">
                      <p className="font-medium">支持的 S3 兼容服务</p>
                      <p className="mt-1 text-amber-700">AWS S3、阿里云 OSS、腾讯云 COS、MinIO 等支持 S3 协议的存储服务</p>
                    </div>
                  </div>
                </div>

                {/* S3 配置卡片 */}
                <button
                  onClick={() => setShowS3Modal(true)}
                  className="w-full p-4 bg-white border-2 border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50/50 transition-all text-left group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <div>
                        <div className="font-medium text-gray-900 group-hover:text-blue-700 transition-colors">S3 存储配置</div>
                        <div className="text-sm text-gray-500 mt-0.5">
                          {isS3Configured ? (
                            <span className="text-green-600 flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              已配置
                            </span>
                          ) : (
                            <span className="text-amber-600">未配置</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <svg className="w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>

                {/* 配置状态摘要 */}
                {isS3Configured && (
                  <div className="p-4 bg-gray-50 rounded-xl">
                    <div className="text-sm text-gray-600 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500">存储桶:</span>
                        <span className="font-medium text-gray-900">{s3BucketName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500">区域:</span>
                        <span className="font-medium text-gray-900">{s3RegionName}</span>
                      </div>
                      {s3EndpointUrl && (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">端点:</span>
                          <span className="font-medium text-gray-900 truncate">{s3EndpointUrl}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500">状态:</span>
                        <span className={`font-medium ${isActive ? 'text-green-600' : 'text-gray-400'}`}>
                          {isActive ? '已启用' : '已禁用'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 操作按钮 */}
          {storageType === 'local' && (
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-medium hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    保存中...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    保存设置
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </main>

      {/* S3 配置弹窗 */}
      <Modal
        visible={showS3Modal}
        title="S3 存储配置"
        onClose={() => setShowS3Modal(false)}
        width="40rem"
        footer={
          <div className="flex items-center justify-between">
            <div>
              {isS3Configured && (
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testing || saving}
                  className="px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {testing ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      测试中...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      测试连接
                    </>
                  )}
                </button>
              )}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowS3Modal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={async () => {
                  await handleSave();
                  if (!error) {
                    setShowS3Modal(false);
                  }
                }}
                disabled={saving || testing}
                className="px-6 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg font-medium hover:from-blue-700 hover:to-blue-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    保存中...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    保存
                  </>
                )}
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-2">
          {/* Access Key ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Access Key ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={s3AccessKeyId}
              onChange={(e) => setS3AccessKeyId(e.target.value)}
              placeholder="请输入 Access Key ID"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          {/* Secret Access Key */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Secret Access Key <span className="text-red-500">*</span>
              {hasSecretKey && (
                <span className="ml-2 text-xs text-green-600 font-normal">（已配置，留空保持不变）</span>
              )}
            </label>
            <input
              type="password"
              value={s3SecretAccessKey}
              onChange={(e) => setS3SecretAccessKey(e.target.value)}
              placeholder={hasSecretKey ? '留空保持原密钥不变' : '请输入 Secret Access Key'}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          {/* Bucket Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              存储桶名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={s3BucketName}
              onChange={(e) => setS3BucketName(e.target.value)}
              placeholder="请输入存储桶名称"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          {/* Region */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              区域
            </label>
            <input
              type="text"
              value={s3RegionName}
              onChange={(e) => setS3RegionName(e.target.value)}
              placeholder="us-east-1"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
            <p className="mt-1.5 text-xs text-gray-500">AWS S3 默认为 us-east-1，其他服务请参考对应文档</p>
          </div>

          {/* Endpoint URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              端点 URL
              <span className="ml-2 text-xs text-gray-400 font-normal">（可选，用于非 AWS S3 服务）</span>
            </label>
            <input
              type="url"
              value={s3EndpointUrl}
              onChange={(e) => setS3EndpointUrl(e.target.value)}
              placeholder="https://oss-cn-hangzhou.aliyuncs.com"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
            <p className="mt-1.5 text-xs text-gray-500">
              MinIO: http://localhost:9000 | 阿里云 OSS: https://oss-cn-hangzhou.aliyuncs.com
            </p>
          </div>

          {/* Custom Domain */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              自定义域名
              <span className="ml-2 text-xs text-gray-400 font-normal">（可选，用于 CDN 加速）</span>
            </label>
            <input
              type="text"
              value={s3CustomDomain}
              onChange={(e) => setS3CustomDomain(e.target.value)}
              placeholder="cdn.example.com"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          {/* 启用开关 */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
            <div>
              <div className="font-medium text-gray-900">启用 S3 存储</div>
              <div className="text-sm text-gray-500">开启后，新上传的文件将存储到 S3</div>
            </div>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                isActive ? 'bg-blue-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  isActive ? 'translate-x-6' : ''
                }`}
              />
            </button>
          </div>

          {/* 配置状态 */}
          <div className={`flex items-center gap-2 p-3 rounded-lg ${
            isS3Configured ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'
          }`}>
            {isS3Configured ? (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-medium">S3 配置完整</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="text-sm">请填写必填项完成配置</span>
              </>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
