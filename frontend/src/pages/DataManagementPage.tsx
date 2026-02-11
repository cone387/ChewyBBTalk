import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Checkbox from '../components/ui/Checkbox';
import Toast, { type ToastType } from '../components/ui/Toast';
import { dataApi, type ImportOptions, type ValidationResult } from '../services/api/dataApi';

export default function DataManagementPage() {
  const navigate = useNavigate();
  const [exportFormat, setExportFormat] = useState<'json' | 'zip'>('json');
  const [includeAttachments, setIncludeAttachments] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  const [importFile, setImportFile] = useState<File | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [importOptions, setImportOptions] = useState<ImportOptions>({
    overwrite_tags: false,
    skip_duplicates: true,
    import_storage_settings: false,
  });
  const [isImporting, setIsImporting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type });
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const blob = await dataApi.exportData({
        format: exportFormat,
        include_attachments: includeAttachments,
      });
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chewybbtalk_export_${new Date().toISOString().slice(0, 10)}.${exportFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      showToast('数据导出成功', 'success');
    } catch (error) {
      console.error('导出失败:', error);
      showToast('导出失败，请重试', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setImportFile(file);
    
    try {
      const result = await dataApi.validateImport(file);
      setValidationResult(result);
      
      if (result.valid) {
        setShowImportModal(true);
      } else {
        showToast(`文件验证失败: ${result.error}`, 'error');
      }
    } catch (error) {
      console.error('文件验证失败:', error);
      showToast('文件验证失败', 'error');
    }
  };

  const handleImport = async () => {
    if (!importFile) return;
    
    setIsImporting(true);
    try {
      const result = await dataApi.importData(importFile, importOptions);
      
      showToast(
        `导入成功！创建 ${result.stats.bbtalks_created} 条内容，${result.stats.tags_created} 个标签`,
        'success'
      );
      
      setShowImportModal(false);
      setImportFile(null);
      setValidationResult(null);
      
      // 刷新页面以显示新导入的数据
      setTimeout(() => {
        navigate('/');
      }, 1000);
    } catch (error: any) {
      console.error('导入失败:', error);
      showToast(error.message || '导入失败，请重试', 'error');
    } finally {
      setIsImporting(false);
    }
  };

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
          <h1 className="text-xl font-semibold text-gray-900">数据管理</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* 数据导出 */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">导出数据</h2>
              <p className="text-sm text-gray-500 mb-4">
                将您的所有数据导出为备份文件，便于迁移到其他服务器
              </p>
              
              <div className="space-y-3 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">导出格式</label>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setExportFormat('json')}
                      className={`flex-1 px-4 py-2 rounded-lg border-2 transition-all ${
                        exportFormat === 'json'
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      JSON 文件
                    </button>
                    <button
                      onClick={() => setExportFormat('zip')}
                      className={`flex-1 px-4 py-2 rounded-lg border-2 transition-all ${
                        exportFormat === 'zip'
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      ZIP 压缩包
                    </button>
                  </div>
                </div>
                
                <Checkbox
                  label="包含附件文件（仅 ZIP 格式，文件较大）"
                  checked={includeAttachments}
                  onChange={(e) => setIncludeAttachments(e.target.checked)}
                  disabled={exportFormat === 'json'}
                />
              </div>
              
              <Button
                onClick={handleExport}
                loading={isExporting}
                className="w-full"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {isExporting ? '正在导出...' : '导出数据'}
              </Button>
            </div>
          </div>
        </div>

        {/* 数据导入 */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">导入数据</h2>
              <p className="text-sm text-gray-500 mb-4">
                从备份文件恢复数据，支持 JSON 和 ZIP 格式
              </p>
              
              <div className="mb-4">
                <label className="flex items-center justify-center w-full px-4 py-8 border-2 border-dashed border-gray-300 rounded-xl hover:border-gray-400 transition-colors cursor-pointer bg-gray-50">
                  <div className="text-center">
                    <svg className="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-sm text-gray-600">
                      {importFile ? importFile.name : '点击选择文件或拖拽到此处'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">支持 JSON 和 ZIP 格式</p>
                  </div>
                  <input
                    type="file"
                    accept=".json,.zip"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* 说明 */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex gap-3">
            <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-blue-800 space-y-1">
              <p className="font-medium">注意事项：</p>
              <ul className="list-disc list-inside space-y-1 text-blue-700">
                <li>导出的数据不包含密码和密钥等敏感信息</li>
                <li>导入时会创建新内容，不会覆盖已有数据</li>
                <li>建议定期备份数据，确保数据安全</li>
                <li>迁移服务器时，请确保目标服务器版本兼容</li>
              </ul>
            </div>
          </div>
        </div>
      </main>

      {/* 导入确认弹窗 */}
      {showImportModal && validationResult && (
        <Modal
          visible={showImportModal}
          onClose={() => setShowImportModal(false)}
          title="确认导入"
        >
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">文件类型：</span>
                <span className="font-medium">{validationResult.file_type?.toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">导出时间：</span>
                <span className="font-medium">
                  {validationResult.export_time ? new Date(validationResult.export_time).toLocaleString() : '-'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">内容数量：</span>
                <span className="font-medium">{validationResult.preview.bbtalks_count} 条</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">标签数量：</span>
                <span className="font-medium">{validationResult.preview.tags_count} 个</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">存储配置：</span>
                <span className="font-medium">{validationResult.preview.storage_settings_count} 个</span>
              </div>
            </div>

            <div className="space-y-3">
              <Checkbox
                label="跳过重复内容"
                checked={importOptions.skip_duplicates ?? true}
                onChange={(e) => setImportOptions({ ...importOptions, skip_duplicates: e.target.checked })}
              />
              <Checkbox
                label="覆盖同名标签"
                checked={importOptions.overwrite_tags ?? false}
                onChange={(e) => setImportOptions({ ...importOptions, overwrite_tags: e.target.checked })}
              />
              <Checkbox
                label="导入存储配置（需手动填写密钥）"
                checked={importOptions.import_storage_settings ?? false}
                onChange={(e) => setImportOptions({ ...importOptions, import_storage_settings: e.target.checked })}
              />
            </div>

            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => setShowImportModal(false)}
                className="flex-1"
                disabled={isImporting}
              >
                取消
              </Button>
              <Button
                onClick={handleImport}
                loading={isImporting}
                className="flex-1"
              >
                {isImporting ? '导入中...' : '开始导入'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
      
      {/* Toast 提示 */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
