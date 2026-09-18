import React from 'react';

/**
 * 内联矢量图标（不依赖字体 / 网络，渲染稳定）。
 * 统一 24x24 viewBox，线性描边风格。
 */
export type IconName =
  | 'pencil'
  | 'tag'
  | 'paperclip'
  | 'comment'
  | 'search'
  | 'eye'
  | 'lock'
  | 'archive'
  | 'swap'
  | 'shield'
  | 'monitor'
  | 'smartphone'
  | 'zap'
  | 'chat'
  | 'github'
  | 'check';

const PATHS: Record<IconName, React.ReactNode> = {
  pencil: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ),
  tag: (
    <>
      <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8Z" />
      <circle cx="7" cy="7" r="1.4" />
    </>
  ),
  paperclip: (
    <path d="M21.4 11 12.2 20.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.9l8.5-8.5" />
  ),
  comment: (
    <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6A8.4 8.4 0 0 1 12.5 3h.5a8.5 8.5 0 0 1 8 8v.5Z" />
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  archive: (
    <>
      <rect x="3" y="4" width="18" height="5" rx="1.5" />
      <path d="M5 9v10a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V9" />
      <path d="M10 13.5h4" />
    </>
  ),
  swap: (
    <>
      <path d="M4 8h13l-3.2-3.2" />
      <path d="M20 16H7l3.2 3.2" />
    </>
  ),
  shield: (
    <>
      <path d="M12 22s8-3.6 8-10V5.5L12 2.5 4 5.5V12c0 6.4 8 10 8 10Z" />
      <path d="m9 12 2.2 2.2L15.4 10" />
    </>
  ),
  monitor: (
    <>
      <rect x="2" y="3.5" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17.5V21" />
    </>
  ),
  smartphone: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="3" />
      <path d="M10.5 5.5h3" />
    </>
  ),
  zap: <path d="M13 2 4.5 13.5H11l-1 8.5 9-11.5h-6.5L13 2Z" />,
  chat: (
    <path d="M21 12a8 8 0 0 1-8 8H7l-4 3 1.2-5A8 8 0 0 1 12 4h1a8 8 0 0 1 8 8Z" />
  ),
  github: (
    <path d="M9 19c-4 1.2-4-2.2-5.6-2.7M15 21v-3.6a3 3 0 0 0-.8-2.3c2.7-.3 5.4-1.3 5.4-6a4.7 4.7 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1.4-.4-4.6 1.7a11.4 11.4 0 0 0-6 0C4.4 2.3 3 2.7 3 2.7a4.3 4.3 0 0 0-.1 3.2A4.7 4.7 0 0 0 1.6 9.1c0 4.7 2.7 5.7 5.4 6a3 3 0 0 0-.8 2.3V21" />
  ),
  check: <path d="m4.5 12.5 5 5 10-11" />,
};

export const Icon: React.FC<{
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}> = ({ name, size = 24, color = '#0F172A', strokeWidth = 1.9, style }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={style}
  >
    {PATHS[name]}
  </svg>
);

/** 品牌 Logo 图形：渐变圆角方块 + 对话框 */
export const LogoMark: React.FC<{
  size?: number;
  radius?: number;
  iconSize?: number;
  style?: React.CSSProperties;
}> = ({ size = 96, radius = 28, iconSize = 48, style }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: radius,
      background: 'linear-gradient(135deg, #3B82F6 0%, #6366F1 48%, #8B5CF6 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 20px 46px rgba(99,102,241,0.34)',
      ...style,
    }}
  >
    <Icon name="chat" size={iconSize} color="#FFFFFF" strokeWidth={2.1} />
  </div>
);
