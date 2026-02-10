import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { settingsApi } from '../services/api/settingsApi';
import type { StorageSettings } from '../types';
import Toast from '../components/ui/Toast';

export default function StorageSettingsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // 当前是否有激活的 S3 配置
  const [activeConfig, setActiveConfig] = useState<StorageSettings | null>(null);
  const [s3Count, setS3Count] = useState(0);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      setLoading(true);
      const configs = await settingsApi.listStorageSettings();
      setS3Count(configs.length);
      const active = configs.find(c => c.is_active);
      setActiveConfig(active || null);
    } catch (err) {
      console.error('加载存储状态失败:', err);
    } finally {
      setLoading(false);
    }
  };

  // 当前使用的是服务器存储
  const isServerStorage = !activeConfig;

  const handleSwitchToServer = async () => {
    if (isServerStorage) return;
    try {
      setSwitching(true);
      await settingsApi.deactivateAllStorage();
      setActiveConfig(null);
      setSuccess('已切换为服务器存储');
    } catch (err: any) {
      setError(err.message || '切换失败');
    } finally {
      setSwitching(false);
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
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate('/settings')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-semibold text-gray-900">存储设置</h1>
        </div>
      </header>

      {error && <Toast message={error} type="error" onClose={() => setError(null)} />}
      {success && <Toast message={success} type="success" onClose={() => setSuccess(null)} />}

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-4">
        {/* 服务器存储 */}
        <button
          onClick={handleSwitchToServer}
          disabled={switching}
          className={`w-full p-5 bg-white rounded-2xl shadow-lg border-2 transition-all text-left ${
            isServerStorage
              ? 'border-green-500 shadow-green-100'
              : 'border-gray-100 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
              isServerStorage
                ? 'bg-gradient-to-br from-green-500 to-emerald-600'
                : 'bg-gradient-to-br from-gray-400 to-gray-500'
            }`}>
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-gray-900">服务器存储</span>
                {isServerStorage && (
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                    当前使用
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-1">使用系统默认存储，无需额外配置</p>
            </div>
            {isServerStorage && (
              <svg className="w-6 h-6 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        </button>

        {/* S3 兼容存储 */}
        <button
          onClick={() => navigate('/settings/storage/s3')}
          className={`w-full p-5 bg-white rounded-2xl shadow-lg border-2 transition-all text-left ${
            !isServerStorage
              ? 'border-green-500 shadow-green-100'
              : 'border-gray-100 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
              !isServerStorage
                ? 'bg-gradient-to-br from-green-500 to-emerald-600'
                : 'bg-gradient-to-br from-blue-500 to-purple-600'
            }`}>
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-gray-900">S3 兼容存储</span>
                {!isServerStorage && (
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                    当前使用
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {!isServerStorage && activeConfig
                  ? `正在使用: ${activeConfig.name}`
                  : `AWS S3 / 阿里云 OSS / MinIO 等`}
                {s3Count > 0 && ` (${s3Count} 个配置)`}
              </p>
            </div>
            <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>

        {/* 提示信息 */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-6">
          <div className="flex gap-3">
            <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-amber-800">
              <p className="font-medium">存储类型说明</p>
              <ul className="mt-1 text-amber-700 space-y-1">
                <li><strong>服务器存储</strong> - 文件保存在服务器本地磁盘</li>
                <li><strong>S3 兼容存储</strong> - 文件保存到云存储服务，支持 AWS S3、阿里云 OSS、腾讯云 COS、MinIO 等</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
