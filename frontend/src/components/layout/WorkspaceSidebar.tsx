import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import AppBrand from '../AppBrand'

const destinations = [
  { path: '/', label: '记录', icon: 'M5 4h14v16H5zM8 8h8M8 12h8M8 16h5' },
  { path: '/settings', label: '账户', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM4 21v-2a8 8 0 0116 0v2' },
  { path: '/settings/privacy', label: '隐私', icon: 'M5 11h14v10H5zM8 11V7a4 4 0 018 0v4' },
  { path: '/settings/storage', label: '存储', icon: 'M4 5h16v6H4zM4 13h16v6H4zM8 8h.01M8 16h.01' },
  { path: '/settings/data', label: '数据', icon: 'M12 3v12m-4-4l4 4 4-4M4 16v5h16v-5' },
  { path: '/settings/status', label: '状态', icon: 'M3 12h4l3-8 4 16 3-8h4' },
]

export default function WorkspaceSidebar({ active, children, footer, isPublic = false }: {
  active: string; children?: ReactNode; footer?: ReactNode; isPublic?: boolean
}) {
  const navigate = useNavigate()
  return <aside aria-label="桌面侧栏" className="workspace-sidebar">
    <div className="workspace-brand"><AppBrand /></div>
    <nav aria-label="工作区导航" className="workspace-nav">
      {(isPublic ? destinations.slice(0, 1) : destinations).map(item => <button key={item.path} type="button"
        aria-current={active === item.path ? 'page' : undefined}
        onClick={() => navigate(isPublic && item.path === '/' ? '/public' : item.path)}
        className="workspace-nav-link">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={item.icon} /></svg>
        {item.label}
      </button>)}
    </nav>
    <div className="workspace-sidebar-content subtle-scrollbar">{children}</div>
    <div className="workspace-sidebar-footer">{footer || <span>BBTalk · 记录与回顾</span>}</div>
  </aside>
}
