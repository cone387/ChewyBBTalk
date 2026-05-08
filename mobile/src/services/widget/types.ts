/**
 * Widget 数据契约
 * 与 iOS Swift Codable / Android Kotlin @Serializable 结构保持一致
 * 见 .kiro/specs/mobile-home-widget/design.md
 */

export type WidgetStrategy = 'pinned' | 'recent' | 'tags' | 'manual';
export type WidgetRecentCount = 3 | 5 | 10;

/** 用户在 App 内的小组件配置 */
export interface WidgetConfig {
  strategy: WidgetStrategy;
  recentCount: WidgetRecentCount;
  /** 标签 uid 列表（对应后端 Tag.uid / 前端 Tag.id） */
  tagIds: string[];
  /** manual 策略下用户手动挑选的 BBTalk uid 列表，顺序即展示顺序 */
  manualUids: string[];
  /** 是否允许展示 visibility=private 的条目（默认 false） */
  includePrivate: boolean;
}

/** Widget 主题色（本期固定为默认蓝，后续接入 ThemeSystem） */
export interface WidgetTheme {
  primary: string;
  background: string;
  text: string;
}

/** 写入 widget-data.json 的单条 BBTalk 简化版 */
export interface WidgetItem {
  uid: string;
  content: string;
  updatedAt: string;
  isPinned: boolean;
  visibility: 'public' | 'private' | 'friends';
  tags: Array<{ name: string; color: string }>;
  /** 首张图片附件的 URL；无图时为 null */
  thumbnailUrl: string | null;
}

/** widget-data.json 顶层结构 */
export interface WidgetPayload {
  version: 1;
  generatedAt: string;
  configHash: string;
  /** 防窥锁定中标记 */
  locked: boolean;
  /** 是否已登录 */
  authenticated: boolean;
  theme: WidgetTheme;
  items: WidgetItem[];
  /** items 为空或异常时的占位文案 */
  placeholder: string | null;
}

export const DEFAULT_CONFIG: WidgetConfig = {
  strategy: 'recent',
  recentCount: 5,
  tagIds: [],
  manualUids: [],
  includePrivate: false,
};

/** 默认主题（与 App 默认蓝主题一致） */
export const DEFAULT_THEME: WidgetTheme = {
  primary: '#3B82F6',
  background: '#FFFFFF',
  text: '#1F2937',
};

/** 单条内容最大展示字符数 */
export const MAX_CONTENT_CHARS = 200;
/** 单条最多展示标签数 */
export const MAX_TAGS_PER_ITEM = 3;
/** payload 总字节上限（超出会触发裁剪） */
export const MAX_PAYLOAD_BYTES = 32 * 1024;
/** manual 策略上限 */
export const MANUAL_MAX_ITEMS = 10;
