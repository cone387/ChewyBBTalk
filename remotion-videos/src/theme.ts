/**
 * ============================================================================
 * ChewyBBTalk 介绍视频 —— 全局视觉与文案常量
 * 想改颜色、字体、文案，只改这个文件就够了。
 * ============================================================================
 */

// ---------- 品牌色（取自 ChewyBBTalk 前端真实视觉：蓝 → 紫渐变 + 白卡片） ----------
export const BRAND = {
  name: 'ChewyBBTalk',
  blue: '#3B82F6',
  indigo: '#6366F1',
  purple: '#8B5CF6',
  blueSoft: '#EFF6FF',
  purpleSoft: '#F5F3FF',
  green: '#10B981',
  gradient: 'linear-gradient(135deg, #3B82F6 0%, #6366F1 48%, #8B5CF6 100%)',
  gradientSoft:
    'linear-gradient(135deg, rgba(59,130,246,0.14) 0%, rgba(139,92,246,0.14) 100%)',

  // 底色（浅色、干净，和产品 UI 一致）
  bg: '#F7F8FC',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F5F9',
  border: '#E2E8F0',

  // 文字
  text: '#0F172A',
  textSub: '#475569',
  textMuted: '#94A3B8',

  // 终端卡片
  terminalBg: '#0B1220',
  terminalBorder: '#1E293B',
  terminalText: '#E2E8F0',
  terminalPrompt: '#60A5FA',
  terminalComment: '#64748B',
};

// ---------- 字体（全部使用系统字体，离线渲染不依赖网络） ----------
export const FONT_SANS =
  '"Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Noto Sans SC", system-ui, sans-serif';
export const FONT_MONO =
  '"Cascadia Mono", "Consolas", "JetBrains Mono", "Courier New", monospace';

// ---------- 画幅与节奏 ----------
export const TIMING = {
  fps: 30,
  width: 1920,
  height: 1080,
  total: 900, // 30 秒
  /** 场景间交叉淡入淡出的重叠帧数 */
  overlap: 15,
};

/**
 * 时间线（帧）
 * 相邻场景重叠 TIMING.overlap 帧，在重叠区完成交叉溶解，避免硬切。
 */
export const SCENES = {
  s1_brand: { from: 0, duration: 75 }, //     0 – 2.50s  品牌开场
  s2_features: { from: 60, duration: 240 }, //   2.0 – 10.0s  核心功能盘点
  s3_privacy: { from: 285, duration: 235 }, //   9.5 – 17.3s  隐私与数据自主
  s4_devices: { from: 505, duration: 205 }, //  16.8 – 23.7s  三端协同
  s5_cta: { from: 695, duration: 205 }, //  23.2 – 30.0s  部署与 CTA
};

// ---------- 文案 ----------
export const COPY = {
  brand: {
    title: 'ChewyBBTalk',
    tagline: '个人碎碎念系统',
    sub: '把每一个想说的瞬间，留在自己的地方',
    badge: 'Open Source · MIT License',
  },

  features: {
    title: '记录，本该更顺手',
    subtitle: '从一句话到一整篇，随手记、随时找',
    items: [
      { title: 'Markdown 编辑', desc: '图文混排、代码块与链接' },
      { title: '标签与分类', desc: '多标签归置，随写随标' },
      { title: '附件与图片', desc: '一键上传，云端或本地' },
      { title: '评论与置顶', desc: '补充想法，重要内容置顶' },
      { title: '搜索与筛选', desc: '关键词 / 标签 / 日期 / 附件' },
      { title: '可见性控制', desc: '私密记录或公开分享，随时切换' },
    ],
    footer: '写、贴、标、聊、找、分享 —— 都在同一个地方',
  },

  privacy: {
    title: '防窥模式',
    bullets: ['离开一会儿，内容自动模糊', '任意键鼠活动，立刻恢复清晰'],
    mock: {
      author: '我',
      time: '刚刚',
      body: '今天把部署脚本又改了一遍，终于一条命令跑通了。',
      tags: ['#开发日记', '#碎碎念'],
    },
    lockHint: '已自动隐藏',
    dataTitle: '数据，始终在你自己手里',
    dataItems: [
      { title: '导出 / 导入', desc: 'JSON / ZIP 完整打包，换服务器也带走' },
      { title: '存储迁移', desc: '本地磁盘 ↔ S3 自由搬家' },
      { title: '备份与恢复', desc: '一键创建备份，校验后完整还原' },
    ],
  },

  devices: {
    title: '同一份记录，三种打开方式',
    items: [
      { title: 'Web 响应式', desc: '浏览器打开就能写', addr: 'localhost:4010' },
      { title: 'iOS · Android', desc: '原生客户端体验', addr: 'ChewyBBTalk' },
      { title: '桌面快捷球', desc: '悬浮入口，随手记一笔', addr: 'Ctrl + Shift + B' },
    ],
    footer: '三端共用一套 API，记录始终一致',
  },

  cta: {
    command: 'docker run -d -p 4010:4010 ghcr.io/cone387/chewy-bbtalk:latest',
    output: 'ChewyBBTalk 已启动 → http://localhost:4010',
    headline: '一条命令，拥有属于你自己的碎碎念空间',
    repo: 'github.com/cone387/ChewyBBTalk',
    license: 'MIT License',
  },
};
