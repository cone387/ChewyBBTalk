import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { settingsApi } from '../services/api/settingsApi';
import type { StorageSettings } from '../types';
import Toast from '../components/ui/Toast';
import Modal from '../components/ui/Modal';

export default function StorageSettingsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // 当前是否有激活的 S3 配置
  const [activeConfig, setActiveConfig] = useState<StorageSettings | null>(null);
  const [allConfigs, setAllConfigs] = useState<StorageSettings[]>([]);
  const [s3Count, setS3Count] = useState(0);
  const [switching, setSwitching] = useState(false);

  // 迁移相关状态
  const [showMigrationModal, setShowMigrationModal] = useState(false);
  const [migrationTarget, setMigrationTarget] = useState<number | null>(null);
  const [migrationTargetName, setMigrationTargetName] = useState('服务器存储');
  const [migrationPreview, setMigrationPreview] = useState<{
    total: number;
    need_migrate: number;
    already_on_target: number;
  } | null>(null);
  const [migrationLoading, setMigrationLoading] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<{
    success: boolean;
    stats: { total: number; migrated: number; skipped: number; failed: number; errors: string[] };
  } | null>(null);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      setLoading(true);
      const configs = await settingsApi.listStorageSettings();
      setAllConfigs(configs);
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

  // 打开迁移弹窗
  const handleOpenMigration = async (targetId: number | null, targetName: string) => {
    setMigrationTarget(targetId);
    setMigrationTargetName(targetName);
    setMigrationResult(null);
    setMigrationPreview(null);
    setShowMigrationModal(true);

    try {
      setMigrationLoading(true);
      const preview = await settingsApi.migrationPreview(targetId);
      setMigrationPreview(preview);
    } catch (err: any) {
      setError(err.message || '获取迁移预览失败');
      setShowMigrationModal(false);
    } finally {
      setMigrationLoading(false);
    }
  };

  // 执行迁移
  const handleExecuteMigration = async () => {
    try {
      setMigrating(true);
      const result = await settingsApi.migrationExecute(migrationTarget);
      setMigrationResult(result);
      if (result.success) {
        setSuccess(`迁移完成！成功迁移 ${result.stats.migrated} 个文件`);
      }
    } catch (err: any) {
      setError(err.message || '迁移失败');
    } finally {
      setMigrating(false);
    }
  };

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

        {/* 数据迁移 */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-3 px-1">数据迁移</h2>
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 divide-y divide-gray-100">
            {/* 迁移到当前存储 */}
            <button
              onClick={() => handleOpenMigration(
                activeConfig ? activeConfig.id : null,
                activeConfig ? activeConfig.name : '服务器存储'
              )}
              className="w-full p-4 flex items-center gap-4 text-left hover:bg-gray-50 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              </div>
              <div className="flex-1">
                <span className="text-sm font-medium text-gray-900">将旧数据迁移到当前存储</span>
                <p className="text-xs text-gray-500 mt-0.5">
                  将其他存储中的附件迁移到「{activeConfig ? activeConfig.name : '服务器存储'}」
                </p>
              </div>
              <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {/* 迁移到指定 S3 配置 */}
            {allConfigs.filter(c => c.id !== activeConfig?.id).map(config => (
              <button
                key={config.id}
                onClick={() => handleOpenMigration(config.id, config.name)}
                className="w-full p-4 flex items-center gap-4 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-cyan-500 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                </div>
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-900">迁移到 {config.name}</span>
                  <p className="text-xs text-gray-500 mt-0.5">将其他存储中的附件迁移到此配置</p>
                </div>
                <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}

            {/* 迁移到本地（仅在当前使用 S3 时显示） */}
            {!isServerStorage && (
              <button
                onClick={() => handleOpenMigration(null, '服务器存储')}
                className="w-full p-4 flex items-center gap-4 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                </div>
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-900">迁移到服务器存储</span>
                  <p className="text-xs text-gray-500 mt-0.5">将 S3 中的附件迁回服务器本地</p>
                </div>
                <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* 迁移弹窗 */}
        <Modal
          visible={showMigrationModal}
          onClose={() => { if (!migrating) setShowMigrationModal(false); }}
          title={`迁移数据到「${migrationTargetName}」`}
        >
          <div className="space-y-4">
            {migrationLoading && (
              <div className="text-center py-6 text-gray-500">正在分析附件数据...</div>
            )}

            {migrationPreview && !migrationResult && (
              <>
                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">附件总数</span>
                    <span className="font-medium text-gray-900">{migrationPreview.total}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">需要迁移</span>
                    <span className="font-medium text-indigo-600">{migrationPreview.need_migrate}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">已在目标存储</span>
                    <span className="font-medium text-green-600">{migrationPreview.already_on_target}</span>
                  </div>
                </div>

                {migrationPreview.need_migrate === 0 ? (
                  <div className="text-center py-2 text-green-600 text-sm">所有附件已在目标存储，无需迁移</div>
                ) : (
                  <>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                      将会把 {migrationPreview.need_migrate} 个附件从旧存储复制到「{migrationTargetName}」，过程中请勿关闭页面。
                    </div>
                    <button
                      onClick={handleExecuteMigration}
                      disabled={migrating}
                      className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {migrating ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          迁移中...
                        </span>
                      ) : (
                        `开始迁移 ${migrationPreview.need_migrate} 个文件`
                      )}
                    </button>
                  </>
                )}
              </>
            )}

            {migrationResult && (
              <div className="space-y-3">
                <div className={`rounded-xl p-4 ${migrationResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {migrationResult.success ? (
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                    <span className={`font-medium ${migrationResult.success ? 'text-green-800' : 'text-red-800'}`}>
                      {migrationResult.success ? '迁移成功' : '迁移完成（部分失败）'}
                    </span>
                  </div>
                  <div className="text-sm space-y-1">
                    <div>成功迁移: {migrationResult.stats.migrated}</div>
                    <div>跳过 (已在目标): {migrationResult.stats.skipped}</div>
                    {migrationResult.stats.failed > 0 && (
                      <div className="text-red-600">失败: {migrationResult.stats.failed}</div>
                    )}
                  </div>
                </div>
                {migrationResult.stats.errors.length > 0 && (
                  <div className="bg-red-50 rounded-lg p-3 text-xs text-red-700 max-h-32 overflow-y-auto">
                    {migrationResult.stats.errors.map((err, i) => (
                      <div key={i}>{err}</div>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => setShowMigrationModal(false)}
                  className="w-full py-2 bg-gray-100 text-gray-700 rounded-xl text-sm hover:bg-gray-200 transition-colors"
                >
                  关闭
                </button>
              </div>
            )}
          </div>
        </Modal>

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
