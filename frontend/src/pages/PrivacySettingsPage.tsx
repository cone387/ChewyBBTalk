import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function PrivacySettingsPage() {
  const navigate = useNavigate();

  const [privacyTimeoutMinutes, setPrivacyTimeoutMinutes] = useState(() => {
    const saved = localStorage.getItem('privacy_timeout_minutes');
    return saved ? parseInt(saved, 10) : parseInt(import.meta.env.VITE_PRIVACY_TIMEOUT_MINUTES || '5', 10);
  });

  const [showCountdown, setShowCountdown] = useState(() => {
    const saved = localStorage.getItem('show_privacy_countdown');
    return saved ? saved === 'true' : import.meta.env.VITE_SHOW_PRIVACY_COUNTDOWN === 'true';
  });

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
          <h1 className="text-xl font-semibold text-gray-900">防窥设置</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-purple-50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">防窥模式</h2>
                <p className="text-sm text-gray-500">长时间不操作后自动模糊内容，保护隐私</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* 超时时长 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                防窥超时时长
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="1"
                  max="60"
                  value={privacyTimeoutMinutes}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10);
                    setPrivacyTimeoutMinutes(value);
                    localStorage.setItem('privacy_timeout_minutes', value.toString());
                  }}
                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <span className="text-sm font-medium text-gray-900 w-16 text-right">
                  {privacyTimeoutMinutes} 分钟
                </span>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                长时间不活动后，内容将自动模糊以保护隐私
              </p>
            </div>

            {/* 显示倒计时 */}
            <div className="pt-4 border-t border-gray-200">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <div className="text-sm font-medium text-gray-700">
                    显示防窥倒计时
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    在页面底部显示倒计时提示
                  </p>
                </div>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={showCountdown}
                    onChange={(e) => {
                      const value = e.target.checked;
                      setShowCountdown(value);
                      localStorage.setItem('show_privacy_countdown', value.toString());
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </div>
              </label>
            </div>

            {/* 保存提示 */}
            <div className="flex items-center gap-1.5 text-xs text-green-600">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>设置自动保存，立即生效</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
