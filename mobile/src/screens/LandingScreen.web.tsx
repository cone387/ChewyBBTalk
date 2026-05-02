import React, { useEffect } from 'react';
import { View } from 'react-native';

/**
 * Web 专用：BBTalk 产品官网（公开路由 /）。
 *
 * 设计原则：
 * - 不依赖 Tailwind 自定义 config（直接用 arbitrary value `bg-[#hex]` 或 inline style），避免 CDN 时序问题
 * - 单页 + 平滑滚动锚点
 * - 点击带 `data-nav-login` 的元素 → React Navigation 跳到 Login 屏
 *
 * Native 平台使用同名 `.tsx`（占位 null）。
 */

const EXTRA_CSS = `
.landing-root {
  font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
  color: #1C1C1E;
  background: #FFFFFF;
  min-height: 100vh;
  /* FOUC 防护：Tailwind CDN 加载完成前先隐藏，避免一闪未样式化的内容 */
  opacity: 0;
  transition: opacity .25s ease;
}
.landing-root[data-tw-ready="1"] { opacity: 1; }
/* 加载占位（不依赖 Tailwind） */
.landing-loader {
  position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
  background: #FFFFFF; z-index: 9999; transition: opacity .3s ease;
}
.landing-loader.is-hidden { opacity: 0; pointer-events: none; }
.landing-loader .dot {
  width: 40px; height: 40px; border-radius: 12px;
  background: linear-gradient(135deg,#0A84FF,#5E5CE6);
  box-shadow: 0 12px 40px -6px rgba(10,132,255,0.45);
  animation: lpFloat 1.6s ease-in-out infinite;
}
.landing-root .grid-bg {
  background-image:
    radial-gradient(60% 50% at 15% 10%, rgba(10,132,255,0.10), transparent 70%),
    radial-gradient(50% 40% at 85% 25%, rgba(168,85,247,0.10), transparent 70%);
}
.landing-root .glass {
  background: rgba(255,255,255,0.72);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
}
.landing-root .text-gradient {
  background: linear-gradient(135deg, #0A84FF 0%, #5E5CE6 60%, #BF5AF2 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.landing-root .shadow-soft { box-shadow: 0 20px 60px -12px rgba(0,0,0,0.18); }
.landing-root .shadow-glow { box-shadow: 0 12px 40px -6px rgba(10,132,255,0.45); }
.landing-root .hover-lift { transition: transform .25s ease, box-shadow .25s ease, border-color .25s ease; }
.landing-root .hover-lift:hover { transform: translateY(-4px); }
.landing-root a { cursor: pointer; }
.landing-root details > summary { list-style: none; }
.landing-root details > summary::-webkit-details-marker { display: none; }
@keyframes lpFadeUp { from { opacity: 0; transform: translateY(20px) } to { opacity: 1; transform: none } }
@keyframes lpFloat  { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-10px) } }
.landing-root .anim-fade-up { animation: lpFadeUp .7s ease-out both; }
.landing-root .anim-float   { animation: lpFloat 6s ease-in-out infinite; }
.landing-root .blob { position: absolute; border-radius: 9999px; filter: blur(48px); opacity: .45; pointer-events: none; }
.landing-root .feature-icon-wrap { transition: transform .25s ease, background-color .25s ease, color .25s ease; }
.landing-root .group:hover .feature-icon-wrap { transform: scale(1.06); }
`;

const LANDING_HTML = `
<!-- Nav -->
<header class="glass sticky top-0 z-50 border-b border-black/5">
  <nav class="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
    <a class="flex items-center gap-2.5">
      <span class="w-9 h-9 rounded-2xl shadow-glow flex items-center justify-center text-white font-bold text-lg" style="background:linear-gradient(135deg,#0A84FF,#5E5CE6);">B</span>
      <span class="text-lg font-semibold tracking-tight">BBTalk</span>
    </a>
    <div class="hidden md:flex items-center gap-8 text-sm" style="color:rgba(28,28,30,0.75);">
      <a href="#features" class="hover:text-[#0A84FF] transition">特色</a>
      <a href="#privacy" class="hover:text-[#0A84FF] transition">隐私</a>
      <a href="#deploy" class="hover:text-[#0A84FF] transition">自托管</a>
      <a href="#faq" class="hover:text-[#0A84FF] transition">FAQ</a>
    </div>
    <a data-nav-login class="text-sm font-medium text-white px-4 py-2 rounded-full hover:opacity-90 transition" style="background:#0B0B0E;">
      登录 / 注册
    </a>
  </nav>
</header>

<!-- Hero -->
<section class="grid-bg relative overflow-hidden">
  <div class="max-w-6xl mx-auto px-6 pt-16 md:pt-24 pb-20 md:pb-28 grid md:grid-cols-2 gap-10 lg:gap-16 items-center">
    <div class="anim-fade-up">
      <span class="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full ring-1" style="color:#0052A3;background:#EFF6FF;border-color:#DBEAFE;">
        <span class="w-1.5 h-1.5 rounded-full" style="background:#0A84FF;"></span>
        多端 · 私密 · 自托管
      </span>
      <h1 class="mt-6 text-4xl sm:text-5xl md:text-[52px] lg:text-[60px] font-bold tracking-tight leading-[1.1]">
        <span class="block whitespace-nowrap">你的<span class="text-gradient">私人碎碎念</span></span>
        <span class="block">都值得被记住</span>
      </h1>
      <p class="mt-6 text-base md:text-lg leading-relaxed max-w-xl" style="color:rgba(28,28,30,0.65);">
        BBTalk 是一款现代化的个人微博应用 —— 灵感、读书、心情、代码片段，
        随手一记，永久属于自己。
        支持 Markdown、图音视频附件、智能标签、防偷窥锁屏。
      </p>
      <div class="mt-8 flex flex-wrap gap-3">
        <a data-nav-login class="inline-flex items-center gap-2 text-white px-5 py-3 rounded-2xl font-medium shadow-glow hover:opacity-90 transition" style="background:#0B0B0E;">
          立即开始
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M13 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </a>
        <a href="https://github.com/cone387/ChewyBBTalk" target="_blank" rel="noopener" class="inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-medium border border-black/10 hover:border-[#0A84FF] hover:text-[#0A84FF] transition" style="background:#fff;color:#1C1C1E;">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.4.7-4.1-1.6-4.1-1.6-.5-1.4-1.4-1.8-1.4-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.9 1.3 1.9 1.3 1.1 1.9 2.9 1.4 3.6 1 .1-.8.4-1.4.8-1.7-2.7-.3-5.6-1.4-5.6-6 0-1.3.5-2.4 1.3-3.3-.1-.4-.6-1.6.1-3.3 0 0 1-.3 3.3 1.3a11.5 11.5 0 0 1 6 0c2.3-1.6 3.3-1.3 3.3-1.3.7 1.7.2 2.9.1 3.3.8.9 1.3 2 1.3 3.3 0 4.6-2.9 5.6-5.6 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3"/></svg>
          GitHub 开源
        </a>
      </div>
      <div class="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs" style="color:rgba(28,28,30,0.6);">
        <span class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> 100% 开源</span>
        <span class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> 无广告无追踪</span>
        <span class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> 数据自托管</span>
        <span class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> 永久免费</span>
      </div>
    </div>

    <!-- Phone mockup —— 还原真实 App 的 Feed 界面 -->
    <div class="relative anim-fade-up" style="animation-delay:.15s">
      <div class="blob" style="width:240px;height:240px;background:#BFDBFE;top:-30px;right:-20px;"></div>
      <div class="blob" style="width:240px;height:240px;background:#E9D5FF;bottom:-30px;left:-20px;"></div>
      <div class="relative mx-auto w-[280px] md:w-[320px] aspect-[9/19] rounded-[3rem] p-3 shadow-soft anim-float" style="background:#0B0B0E;">
        <!-- notch -->
        <div class="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-6 rounded-b-2xl z-10" style="background:#0B0B0E;"></div>
        <div class="w-full h-full rounded-[2.5rem] overflow-hidden relative" style="background:#F2F2F7;">
          <!-- App header: hamburger + search （和 HomeScreen 一致） -->
          <div class="px-4 pt-10 pb-2 flex items-center justify-between" style="background:#F2F2F7;">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="#1C1C1E" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            <svg class="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="#1C1C1E" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>
          </div>
          <!-- Tag tabs -->
          <div class="px-4 pt-1 pb-2 flex items-center gap-2 overflow-hidden">
            <span class="text-[10px] px-2.5 py-1 rounded-full text-white" style="background:#0A84FF;">全部</span>
            <span class="text-[10px] px-2.5 py-1 rounded-full" style="background:#FFFFFF;color:rgba(28,28,30,0.6);">读书</span>
            <span class="text-[10px] px-2.5 py-1 rounded-full" style="background:#FFFFFF;color:rgba(28,28,30,0.6);">日常</span>
            <span class="text-[10px] px-2.5 py-1 rounded-full" style="background:#FFFFFF;color:rgba(28,28,30,0.6);">灵感</span>
          </div>
          <!-- Feed cards —— 完全还原 BBTalkCard 的结构 -->
          <div class="px-3 pb-3 space-y-3">
            <!-- Card 1 -->
            <div class="bg-white rounded-2xl p-3 relative">
              <span class="absolute top-2 right-2 text-[12px] leading-none" style="color:rgba(28,28,30,0.35);">···</span>
              <div class="text-[11px] leading-relaxed pr-4" style="color:#1C1C1E;">下午的咖啡，配一本《禅与摩托车维修艺术》📖</div>
              <div class="mt-2 flex flex-wrap gap-1.5">
                <span class="text-[9px] px-2 py-0.5 rounded-xl text-white" style="background:#A855F7;">读书</span>
              </div>
              <div class="mt-2 flex items-center justify-between">
                <span class="text-[9px]" style="color:rgba(28,28,30,0.4);">10 分钟前</span>
                <div class="flex items-center gap-1" style="color:rgba(28,28,30,0.4);">
                  <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  <span class="text-[9px]">2</span>
                </div>
              </div>
            </div>
            <!-- Card 2 with images -->
            <div class="bg-white rounded-2xl p-3 relative">
              <span class="absolute top-2 right-2 text-[12px] leading-none" style="color:rgba(28,28,30,0.35);">···</span>
              <div class="text-[11px] leading-relaxed pr-4" style="color:#1C1C1E;">今天写完了 BBTalk 的隐私锁功能 🔒 终于可以放心地把它装在自己的设备上了。</div>
              <div class="mt-2 flex flex-wrap gap-1.5">
                <span class="text-[9px] px-2 py-0.5 rounded-xl text-white" style="background:#3B82F6;">开发</span>
                <span class="text-[9px] px-2 py-0.5 rounded-xl text-white" style="background:#10B981;">BBTalk</span>
              </div>
              <div class="mt-2 flex gap-1.5">
                <div class="w-[52px] h-[52px] rounded-lg" style="background:linear-gradient(135deg,#BFDBFE,#60A5FA);"></div>
                <div class="w-[52px] h-[52px] rounded-lg" style="background:linear-gradient(135deg,#FBCFE8,#FDBA74);"></div>
              </div>
              <div class="mt-2 flex items-center justify-between">
                <span class="text-[9px]" style="color:rgba(28,28,30,0.4);">2 小时前</span>
                <div class="flex items-center gap-2" style="color:rgba(28,28,30,0.4);">
                  <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 5.65-7 10-7 10z"/></svg>
                  <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                </div>
              </div>
            </div>
            <!-- Card 3 -->
            <div class="bg-white rounded-2xl p-3 relative">
              <span class="absolute top-2 right-2 text-[12px] leading-none" style="color:rgba(28,28,30,0.35);">···</span>
              <div class="text-[11px] leading-relaxed pr-4" style="color:#1C1C1E;">想到的小灵感：碎碎念也可以是私密日记 💭</div>
              <div class="mt-2 flex items-center justify-between">
                <span class="text-[9px]" style="color:rgba(28,28,30,0.4);">昨天</span>
              </div>
            </div>
          </div>
          <!-- FAB -->
          <div class="absolute bottom-5 right-5 w-11 h-11 rounded-full flex items-center justify-center shadow-glow" style="background:#0A84FF;">
            <svg class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14" stroke-linecap="round"/></svg>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- Trust strip -->
<section class="border-y border-black/5" style="background:#F9FAFB;">
  <div class="max-w-6xl mx-auto px-6 py-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs" style="color:rgba(28,28,30,0.5);">
    <span>iOS 14+</span><span>·</span>
    <span>Android 8+</span><span>·</span>
    <span>Web / PWA</span><span>·</span>
    <span>Docker 自部署</span><span>·</span>
    <span>S3 兼容存储</span><span>·</span>
    <span>SQLite / PostgreSQL</span>
  </div>
</section>

<!-- Features -->
<section id="features" class="py-20 md:py-28">
  <div class="max-w-6xl mx-auto px-6">
    <div class="text-center max-w-2xl mx-auto">
      <span class="text-xs font-semibold uppercase tracking-widest" style="color:#0A84FF;">CORE FEATURES</span>
      <h2 class="mt-3 text-3xl md:text-4xl font-bold tracking-tight">为「想随手记下一切」而生</h2>
      <p class="mt-4" style="color:rgba(28,28,30,0.6);">每一项功能都来自真实使用场景，不堆砌、不打扰。</p>
    </div>

    <div class="mt-14 grid md:grid-cols-2 lg:grid-cols-3 gap-5">
      ${[
        { c: '#0A84FF', bg: '#EFF6FF', t: 'Markdown 原生支持', d: '代码块、列表、链接、加粗一应俱全，写完即所见即所得。', i: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>' },
        { c: '#A855F7', bg: '#F5F3FF', t: '附件 · 图音视频', d: '每条碎碎念都能附图片、视频、音频、文件，一气呵成。', i: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>' },
        { c: '#EC4899', bg: '#FDF2F8', t: '智能标签系统', d: '输入 #标签名 自动创建，自定义颜色、拖拽排序，分类一目了然。', i: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>' },
        { c: '#10B981', bg: '#ECFDF5', t: '防偷窥锁屏', d: '超时不操作自动锁屏，Face ID / Touch ID 解锁，App 杀掉再开同样保护。', i: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>' },
        { c: '#F59E0B', bg: '#FFFBEB', t: '数据自由', d: '一键导出 JSON / ZIP，附件随行，跨服务器迁移零障碍。', i: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>' },
        { c: '#0EA5E9', bg: '#F0F9FF', t: '多端同步', d: 'iOS、Android、Web、PWA、桌面浏览器，同一账号无缝衔接。', i: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>' },
        { c: '#6366F1', bg: '#EEF2FF', t: '语音速记', d: '一键录音 + 自动语音转文字，灵感稍纵即逝，按一下就抓住。', i: '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>' },
        { c: '#F43F5E', bg: '#FFF1F2', t: '位置标记', d: '可选附加位置信息，让每条碎碎念都有「时空坐标」。', i: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>' },
        { c: '#14B8A6', bg: '#F0FDFA', t: '本地或云存储', d: '附件可存本地或对接 S3 / 阿里云 OSS / MinIO，随心切换迁移。', i: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>' },
      ].map((f) => `
        <div class="group relative bg-white rounded-3xl p-6 border border-black/5 hover-lift">
          <div class="feature-icon-wrap w-12 h-12 rounded-2xl flex items-center justify-center" style="background:${f.bg};color:${f.c};">
            <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${f.i}</svg>
          </div>
          <h3 class="mt-5 text-lg font-semibold tracking-tight">${f.t}</h3>
          <p class="mt-2 text-sm leading-relaxed" style="color:rgba(28,28,30,0.6);">${f.d}</p>
        </div>
      `).join('')}
    </div>
  </div>
</section>

<!-- Privacy -->
<section id="privacy" class="py-20 md:py-28 relative overflow-hidden border-y border-black/5" style="background:#FFFFFF;">
  <div class="absolute inset-0 grid-bg opacity-60"></div>
  <div class="blob" style="width:260px;height:260px;background:#A5B4FC;top:-40px;left:-40px;opacity:.35;"></div>
  <div class="blob" style="width:220px;height:220px;background:#FBCFE8;top:60px;right:-40px;opacity:.25;"></div>
  <div class="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-12 items-center relative">
    <div>
      <span class="text-xs font-semibold uppercase tracking-widest" style="color:#0A84FF;">PRIVACY FIRST</span>
      <h2 class="mt-3 text-3xl md:text-5xl font-bold leading-[1.1] tracking-tight" style="color:#1C1C1E;">
        你的数据，<br/>
        <span style="background:linear-gradient(135deg,#0A84FF,#BF5AF2);-webkit-background-clip:text;background-clip:text;color:transparent;">只属于你自己。</span>
      </h2>
      <p class="mt-6 leading-relaxed max-w-lg" style="color:rgba(28,28,30,0.7);">
        我们不收集任何用户数据，不内嵌追踪 SDK，不投放广告。
        所有数据都存储在你选择的地方 —— 你的手机、你的服务器、你的 S3 桶。
      </p>
      <ul class="mt-8 space-y-3.5">
        ${['超时未操作自动锁屏，需密码或 Face ID 解锁',
          'App 被关闭重开后依然受锁屏保护',
          '完全开源，所有代码可在 GitHub 审查',
          '支持完全离线使用与本地存储',
          '可随时一键导出全部数据，无锁定'].map(t => `
          <li class="flex items-start gap-3">
            <span class="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0" style="background:rgba(16,185,129,0.14);">
              <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </span>
            <span style="color:rgba(28,28,30,0.85);">${t}</span>
          </li>
        `).join('')}
      </ul>
    </div>
    <div class="flex justify-center">
      <div class="relative">
        <div class="blob" style="width:280px;height:280px;background:#A5B4FC;top:-20px;left:-20px;opacity:.4;"></div>
        <div class="relative w-64 h-64 rounded-full flex items-center justify-center shadow-glow anim-float" style="background:linear-gradient(135deg,#0A84FF,#BF5AF2);">
          <svg class="w-32 h-32" style="color:rgba(255,255,255,0.95);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- Self-host -->
<section id="deploy" class="py-20 md:py-28" style="background:#F9FAFB;">
  <div class="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-12 items-center">
    <div>
      <span class="text-xs font-semibold uppercase tracking-widest" style="color:#0A84FF;">SELF-HOSTED</span>
      <h2 class="mt-3 text-3xl md:text-4xl font-bold tracking-tight">一行命令，自己当老板</h2>
      <p class="mt-4 leading-relaxed" style="color:rgba(28,28,30,0.6);">
        完全开源 + Docker 单容器，无需复杂依赖。把 BBTalk 部署在自己的 NAS、VPS、树莓派上，
        所有数据归你所有。
      </p>
      <div class="mt-6 flex flex-wrap gap-3">
        <a href="https://github.com/cone387/ChewyBBTalk#readme" target="_blank" rel="noopener" class="inline-flex items-center gap-2 font-medium hover:gap-3 transition-all" style="color:#0A84FF;">
          部署文档
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </a>
      </div>
    </div>
    <div class="rounded-2xl p-6 shadow-soft text-sm font-mono leading-relaxed" style="background:#0B0B0E;">
      <div class="flex items-center gap-1.5 mb-4">
        <div class="w-3 h-3 rounded-full bg-red-400"></div>
        <div class="w-3 h-3 rounded-full bg-yellow-400"></div>
        <div class="w-3 h-3 rounded-full bg-green-400"></div>
        <span class="ml-2 text-xs" style="color:rgba(255,255,255,0.4);">terminal</span>
      </div>
      <div style="color:#34D399;">$ docker run -d \\</div>
      <div class="ml-2" style="color:rgba(255,255,255,0.85);">--name bbtalk \\</div>
      <div class="ml-2" style="color:rgba(255,255,255,0.85);">-p 4010:4010 \\</div>
      <div class="ml-2" style="color:rgba(255,255,255,0.85);">-v bbtalk_data:/app/data \\</div>
      <div class="ml-2" style="color:rgba(255,255,255,0.85);">ghcr.io/cone387/chewybbtalk:latest</div>
      <div class="mt-3" style="color:rgba(255,255,255,0.4);"># 打开 http://localhost:4010</div>
      <div style="color:rgba(255,255,255,0.4);"># 默认账号：admin / admin123</div>
    </div>
  </div>
</section>

<!-- Download -->
<section id="download" class="py-20 md:py-28">
  <div class="max-w-3xl mx-auto px-6 text-center">
    <span class="text-xs font-semibold uppercase tracking-widest" style="color:#0A84FF;">GET STARTED</span>
    <h2 class="mt-3 text-3xl md:text-5xl font-bold tracking-tight">现在就开始记录</h2>
    <p class="mt-4" style="color:rgba(28,28,30,0.6);">免费 · 无广告 · 永久使用</p>
    <div class="mt-10 flex flex-wrap justify-center gap-3">
      <a data-nav-login class="inline-flex items-center gap-3 text-white px-6 py-4 rounded-2xl shadow-glow hover:opacity-90 transition" style="background:#0B0B0E;">
        <svg class="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <div class="text-left">
          <div class="text-[10px] uppercase tracking-wider" style="opacity:.7;">立即使用</div>
          <div class="font-semibold text-base">网页 / PWA</div>
        </div>
      </a>
      <a href="https://apps.apple.com/" class="inline-flex items-center gap-3 text-white px-6 py-4 rounded-2xl hover:opacity-90 transition" style="background:#0B0B0E;">
        <svg class="w-7 h-7" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
        <div class="text-left">
          <div class="text-[10px] uppercase tracking-wider" style="opacity:.7;">下载于</div>
          <div class="font-semibold text-base">App Store</div>
        </div>
      </a>
      <a href="https://github.com/cone387/ChewyBBTalk" target="_blank" rel="noopener" class="inline-flex items-center gap-3 px-6 py-4 rounded-2xl border border-black/10 hover:border-[#0A84FF] hover:text-[#0A84FF] transition" style="background:#fff;color:#1C1C1E;">
        <svg class="w-7 h-7" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.4.7-4.1-1.6-4.1-1.6-.5-1.4-1.4-1.8-1.4-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.9 1.3 1.9 1.3 1.1 1.9 2.9 1.4 3.6 1 .1-.8.4-1.4.8-1.7-2.7-.3-5.6-1.4-5.6-6 0-1.3.5-2.4 1.3-3.3-.1-.4-.6-1.6.1-3.3 0 0 1-.3 3.3 1.3a11.5 11.5 0 0 1 6 0c2.3-1.6 3.3-1.3 3.3-1.3.7 1.7.2 2.9.1 3.3.8.9 1.3 2 1.3 3.3 0 4.6-2.9 5.6-5.6 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3"/></svg>
        <div class="text-left">
          <div class="text-[10px] uppercase tracking-wider" style="opacity:.7;">查看</div>
          <div class="font-semibold text-base">源代码</div>
        </div>
      </a>
    </div>
  </div>
</section>

<!-- FAQ -->
<section id="faq" class="py-20 md:py-28" style="background:#F9FAFB;">
  <div class="max-w-3xl mx-auto px-6">
    <div class="text-center">
      <span class="text-xs font-semibold uppercase tracking-widest" style="color:#0A84FF;">FAQ</span>
      <h2 class="mt-3 text-3xl md:text-4xl font-bold tracking-tight">常见问题</h2>
    </div>
    <div class="mt-12 space-y-3">
      ${[
        ['BBTalk 收费吗？', '完全免费且开源。无内购、无广告、无订阅。源代码在 GitHub 开放。'],
        ['我的数据存在哪里？', '你可以选择官方提供的服务器，也可以自己部署到 NAS / VPS / 自建服务器上。附件可存本地或对接 S3 兼容存储。完全由你掌控。'],
        ['支持哪些设备？', 'iOS 14+ / Android 8+ / 现代浏览器（含 PWA 安装到桌面）。后端可部署在任何支持 Docker 的设备上，包括树莓派。'],
        ['万一以后不维护了，我的数据怎么办？', '所有数据可一键导出为 JSON / ZIP（含附件），格式公开透明。即使项目停止维护，你的数据依然可读、可迁移。'],
        ['会同步到其他平台吗？', '不会。我们不主动将你的数据上传到任何第三方。如有需要，可通过自托管让多台设备共享数据。'],
      ].map(([q, a]) => `
        <details class="group bg-white rounded-2xl p-5 border border-black/5 hover:border-black/10 transition">
          <summary class="cursor-pointer flex items-center justify-between font-medium">
            <span>${q}</span>
            <svg class="w-5 h-5 transition-transform group-open:rotate-180" style="color:rgba(28,28,30,0.5);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          </summary>
          <p class="mt-3 text-sm leading-relaxed" style="color:rgba(28,28,30,0.7);">${a}</p>
        </details>
      `).join('')}
    </div>
  </div>
</section>

<!-- Footer -->
<footer class="py-12 border-t border-black/5">
  <div class="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
    <div class="flex items-center gap-2">
      <span class="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold" style="background:linear-gradient(135deg,#0A84FF,#5E5CE6);">B</span>
      <span class="text-sm font-medium">BBTalk</span>
      <span class="text-xs" style="color:rgba(28,28,30,0.4);">· © 2024-2026 cone387</span>
    </div>
    <div class="flex items-center gap-6 text-xs" style="color:rgba(28,28,30,0.6);">
      <a href="https://github.com/cone387/ChewyBBTalk" target="_blank" rel="noopener" class="hover:text-[#0A84FF]">GitHub</a>
      <a data-nav-login class="hover:text-[#0A84FF]">登录</a>
    </div>
  </div>
</footer>
`;

let injected = false;
function ensureTailwindInjected(onReady?: () => void) {
  if (typeof document === 'undefined') return;
  if (injected) {
    // 已注入：若 tailwind 已就绪直接回调，否则轮询等待
    if ((window as any).tailwind) onReady?.();
    else {
      const t = setInterval(() => {
        if ((window as any).tailwind) { clearInterval(t); onReady?.(); }
      }, 30);
    }
    return;
  }
  injected = true;
  // 先注入额外 CSS（含 FOUC 隐藏规则），再加载 Tailwind CDN
  const style = document.createElement('style');
  style.textContent = EXTRA_CSS;
  document.head.appendChild(style);
  const cdn = document.createElement('script');
  cdn.src = 'https://cdn.tailwindcss.com';
  cdn.onload = () => onReady?.();
  document.head.appendChild(cdn);
}

export default function LandingScreen({ navigation }: any) {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const loaderRef = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = 'BBTalk · 你的私人碎碎念空间';
    }

    const reveal = () => {
      // 等到下一帧再打开，确保 Tailwind 已经处理过当前 DOM
      requestAnimationFrame(() => {
        rootRef.current?.setAttribute('data-tw-ready', '1');
        loaderRef.current?.classList.add('is-hidden');
        // 动画结束后移除 loader 节点
        setTimeout(() => loaderRef.current?.remove(), 400);
      });
    };
    ensureTailwindInjected(reveal);
    // 兜底：3 秒后强制显示，避免网络慢时卡住
    const fallback = setTimeout(reveal, 3000);

    const prevScroll = (document.documentElement.style as any).scrollBehavior;
    document.documentElement.style.scrollBehavior = 'smooth';

    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.('[data-nav-login]') as HTMLElement | null;
      if (el) {
        e.preventDefault();
        navigation?.navigate?.('Login');
      }
    };
    document.addEventListener('click', onClick);

    return () => {
      clearTimeout(fallback);
      document.removeEventListener('click', onClick);
      document.documentElement.style.scrollBehavior = prevScroll || '';
    };
  }, [navigation]);

  return (
    <View style={{ flex: 1, width: '100%', height: '100%' as any }}>
      {/* 加载占位：在 Tailwind 就绪前覆盖整屏，避免 FOUC */}
      <div ref={loaderRef} className="landing-loader"><div className="dot" /></div>
      <div
        ref={rootRef}
        className="landing-root"
        style={{ width: '100%', minHeight: '100vh', overflowY: 'auto' }}
        dangerouslySetInnerHTML={{ __html: LANDING_HTML }}
      />
    </View>
  );
}
