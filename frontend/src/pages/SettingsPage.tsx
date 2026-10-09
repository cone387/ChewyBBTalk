import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, logout } from '../services/auth';
import { useActionFeedback } from '../hooks/useActionFeedback';
import Button from '../components/ui/Button';
import AppBrand from '../components/AppBrand';

const settings = [
  { title: '防窥设置', description: '锁定时长、倒计时显示', path: '/settings/privacy',
    icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
  { title: '存储设置', description: '服务器存储、S3 云存储配置', path: '/settings/storage',
    icon: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4' },
  { title: '数据管理', description: '备份、导入导出与迁移', path: '/settings/data',
    icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4' },
  { title: '运行状态', description: '服务连接、当前存储与最近备份', path: '/settings/status',
    icon: 'M3 12h4l3-8 4 16 3-8h4' },
];

export default function SettingsPage() {
  const navigate = useNavigate();
  const [currentUser] = useState(getCurrentUser());
  const feedback = useActionFeedback();

  return (
    <div className="app-page">
      {feedback.feedback}
      <header className="app-header sticky top-0 z-10">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-8">
          <Button variant="ghost" onClick={() => navigate('/')} aria-label="返回记录" className="-ml-2 px-2.5">
            <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            返回记录
          </Button>
          <AppBrand />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">我的</h1>
          <p className="mt-2 text-sm leading-6 text-gray-500">管理记录的隐私、存储与备份。</p>
        </div>
        {currentUser && <section aria-label="当前账户" className="app-surface mb-7 flex items-center gap-4 p-5 sm:p-6">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-50 font-semibold text-blue-700">
            {currentUser.avatar ? <img src={currentUser.avatar} alt={currentUser.display_name || currentUser.username} className="h-full w-full object-cover" />
              : <span className="text-xl">{(currentUser.display_name || currentUser.username).charAt(0).toUpperCase()}</span>}
          </div>
          <div className="min-w-0 flex-1">
            <p className="break-words text-base font-semibold">{currentUser.display_name || currentUser.username}</p>
            <p className="mt-1 break-all text-sm text-gray-500">{currentUser.email || `@${currentUser.username}`}</p>
          </div>
        </section>}
        <section aria-labelledby="settings-title">
          <h2 id="settings-title" className="mb-3 px-1 text-sm font-medium text-gray-500">偏好与数据</h2>
          <div className="app-surface divide-y divide-gray-100">
            {settings.map(item => <button key={item.path} type="button" onClick={() => navigate(item.path)} className="app-setting-row">
              <span className="app-setting-icon">
                <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-gray-900">{item.title}</span>
                <span className="mt-1 block text-sm leading-5 text-gray-500">{item.description}</span>
              </span>
              <svg aria-hidden="true" className="h-4 w-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>)}
          </div>
        </section>
        {currentUser && <div className="mt-7 border-t border-gray-200 pt-5">
          <Button variant="danger" className="w-full sm:w-auto" onClick={() => feedback.confirm({
            title: '退出登录', message: '确定退出当前账号？', confirmLabel: '退出登录',
            action: async () => { await logout(); },
          })}>
            <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            退出登录
          </Button>
        </div>}
      </main>
    </div>
  );
}
