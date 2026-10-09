import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import WorkspaceSidebar from './WorkspaceSidebar'
import Button from '../ui/Button'

export default function SettingsLayout({ title, description, active, children, action,
  backTo = '/settings', backLabel = '返回我的' }: {
  title: string; description: string; active: string; children: ReactNode; action?: ReactNode;
  backTo?: string; backLabel?: string
}) {
  const navigate = useNavigate()
  return <div className="app-page workspace-layout">
    <WorkspaceSidebar active={active} />
    <div className="workspace-content">
      <header className="workspace-topbar">
        <Button variant="ghost" className="px-2" onClick={() => navigate(backTo)} aria-label={backLabel}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m14 6-6 6 6 6" /></svg>
          {backTo === '/' ? '返回记录' : '返回设置'}
        </Button>
        <span className="text-xs text-gray-500">BBTalk / 设置</span>
      </header>
      <main className="settings-content">
        <div className="page-heading">
          <div><h1>{title}</h1><p>{description}</p></div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
        {children}
      </main>
    </div>
  </div>
}
