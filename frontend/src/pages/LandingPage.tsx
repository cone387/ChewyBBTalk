import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import './LandingPage.css'

// Production product page. Kept entirely in frontend; no Expo runtime or CDN.
export default function LandingPage() {
  useEffect(() => {
    const previousTitle = document.title
    document.title = 'BBTalk · 你的私人碎碎念'
    return () => { document.title = previousTitle }
  }, [])

  return <div className="landing-root">
<a href="#landing-main" className="landing-skip">跳到主要内容</a>

{/* Nav */}
<header className="glass sticky top-0 z-50 border-b border-black/5">
  <nav aria-label="产品导航" className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
    <Link to="/about" aria-label="BBTalk 产品介绍" className="flex items-center gap-2.5">
      <span className="w-9 h-9 rounded-2xl shadow-glow flex items-center justify-center text-white font-bold text-lg" style={{"background": "linear-gradient(135deg,#0A84FF,#5E5CE6)"}}>B</span>
      <span className="text-lg font-semibold tracking-tight">BBTalk</span>
    </Link>
    <div className="hidden md:flex items-center gap-8 text-sm" style={{"color": "rgba(28,28,30,0.75)"}}>
      <a href="#features" className="hover:text-[#0A84FF] transition">特色</a>
      <a href="#privacy" className="hover:text-[#0A84FF] transition">隐私</a>
      <a href="#deploy" className="hover:text-[#0A84FF] transition">自托管</a>
      <a href="#faq" className="hover:text-[#0A84FF] transition">FAQ</a>
    </div>
    <Link to="/app" className="text-sm font-medium text-white px-4 py-2 rounded-full hover:opacity-90 transition" style={{"background": "#0B0B0E"}}>
      进入 BBTalk
    </Link>
  </nav>
</header>

<main id="landing-main">
{/* Hero */}
<section className="grid-bg relative overflow-hidden">
  <div className="max-w-6xl mx-auto px-6 pt-16 md:pt-24 pb-20 md:pb-28 grid md:grid-cols-2 gap-10 lg:gap-16 items-center">
    <div className="anim-fade-up">
      <span className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full ring-1" style={{"color": "#0052A3", "background": "#EFF6FF", "borderColor": "#DBEAFE"}}>
        <span className="w-1.5 h-1.5 rounded-full" style={{"background": "#0A84FF"}}></span>
        多端 · 私密 · 自托管
      </span>
      <h1 className="mt-6 text-[32px] sm:text-5xl md:text-[52px] lg:text-[60px] font-bold tracking-tight leading-[1.1]">
        <span className="block whitespace-nowrap">你的<span className="text-gradient">私人碎碎念</span></span>
        <span className="block">都值得被记住</span>
      </h1>
      <p className="mt-6 text-base md:text-lg leading-relaxed max-w-xl" style={{"color": "rgba(28,28,30,0.65)"}}>
        BBTalk 是一款现代化的个人微博应用 —— 灵感、读书、心情、代码片段，
        随手一记，留给之后的自己。
        支持 Markdown、图音视频附件、智能标签、防偷窥锁屏。
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/app" className="inline-flex items-center gap-2 text-white px-5 py-3 rounded-2xl font-medium shadow-glow hover:opacity-90 transition" style={{"background": "#0B0B0E"}}>
          立即开始
          <svg aria-hidden="true" focusable="false" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round"></path></svg>
        </Link>
        <a href="https://github.com/cone387/ChewyBBTalk" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-medium border border-black/10 hover:border-[#0A84FF] hover:text-[#0A84FF] transition" style={{"background": "#fff", "color": "#1C1C1E"}}>
          <svg aria-hidden="true" focusable="false" className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.4.7-4.1-1.6-4.1-1.6-.5-1.4-1.4-1.8-1.4-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.9 1.3 1.9 1.3 1.1 1.9 2.9 1.4 3.6 1 .1-.8.4-1.4.8-1.7-2.7-.3-5.6-1.4-5.6-6 0-1.3.5-2.4 1.3-3.3-.1-.4-.6-1.6.1-3.3 0 0 1-.3 3.3 1.3a11.5 11.5 0 0 1 6 0c2.3-1.6 3.3-1.3 3.3-1.3.7 1.7.2 2.9.1 3.3.8.9 1.3 2 1.3 3.3 0 4.6-2.9 5.6-5.6 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3"></path></svg>
          GitHub 开源
        </a>
      </div>
      <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs" style={{"color": "rgba(28,28,30,0.6)"}}>
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> 100% 开源</span>
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> 无广告无追踪</span>
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> 数据自托管</span>
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> 可自行部署</span>
      </div>
    </div>

    {/* 保留原有手机示意图；示例内容不代表所有客户端的完整界面。 */}
    <div role="img" aria-label="BBTalk 移动端记录界面示意" className="relative anim-fade-up" style={{"animationDelay": ".15s"}}>
      <div className="blob" style={{"width": "240px", "height": "240px", "background": "#BFDBFE", "top": "-30px", "right": "-20px"}}></div>
      <div className="blob" style={{"width": "240px", "height": "240px", "background": "#E9D5FF", "bottom": "-30px", "left": "-20px"}}></div>
      <div className="relative mx-auto w-[260px] sm:w-[280px] md:w-[320px] max-w-full aspect-[9/19] rounded-[3rem] p-3 shadow-soft anim-float" style={{"background": "#0B0B0E"}}>
        {/* notch */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-6 rounded-b-2xl z-10" style={{"background": "#0B0B0E"}}></div>
        <div className="w-full h-full rounded-[2.5rem] overflow-hidden relative" style={{"background": "#F2F2F7"}}>
          {/* App header: hamburger + search （和 HomeScreen 一致） */}
          <div className="px-4 pt-10 pb-2 flex items-center justify-between" style={{"background": "#F2F2F7"}}>
            <svg aria-hidden="true" focusable="false" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="#1C1C1E" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
            <svg aria-hidden="true" focusable="false" className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="#1C1C1E" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.5" y2="16.5"></line></svg>
          </div>
          {/* Tag tabs */}
          <div className="px-4 pt-1 pb-2 flex items-center gap-2 overflow-hidden">
            <span className="text-[10px] px-2.5 py-1 rounded-full text-white" style={{"background": "#0A84FF"}}>全部</span>
            <span className="text-[10px] px-2.5 py-1 rounded-full" style={{"background": "#FFFFFF", "color": "rgba(28,28,30,0.6)"}}>读书</span>
            <span className="text-[10px] px-2.5 py-1 rounded-full" style={{"background": "#FFFFFF", "color": "rgba(28,28,30,0.6)"}}>日常</span>
            <span className="text-[10px] px-2.5 py-1 rounded-full" style={{"background": "#FFFFFF", "color": "rgba(28,28,30,0.6)"}}>灵感</span>
          </div>
          {/* Feed cards —— 完全还原 BBTalkCard 的结构 */}
          <div className="px-3 pb-3 space-y-3">
            {/* Card 1 */}
            <div className="bg-white rounded-2xl p-3 relative">
              <span className="absolute top-2 right-2 text-[12px] leading-none" style={{"color": "rgba(28,28,30,0.35)"}}>···</span>
              <div className="text-[11px] leading-relaxed pr-4" style={{"color": "#1C1C1E"}}>下午的咖啡，配一本《禅与摩托车维修艺术》📖</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="text-[9px] px-2 py-0.5 rounded-xl text-white" style={{"background": "#A855F7"}}>读书</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[9px]" style={{"color": "rgba(28,28,30,0.4)"}}>10 分钟前</span>
                <div className="flex items-center gap-1" style={{"color": "rgba(28,28,30,0.4)"}}>
                  <svg aria-hidden="true" focusable="false" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                  <span className="text-[9px]">2</span>
                </div>
              </div>
            </div>
            {/* Card 2 with images */}
            <div className="bg-white rounded-2xl p-3 relative">
              <span className="absolute top-2 right-2 text-[12px] leading-none" style={{"color": "rgba(28,28,30,0.35)"}}>···</span>
              <div className="text-[11px] leading-relaxed pr-4" style={{"color": "#1C1C1E"}}>今天写完了 BBTalk 的隐私锁功能 🔒 终于可以放心地把它装在自己的设备上了。</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="text-[9px] px-2 py-0.5 rounded-xl text-white" style={{"background": "#3B82F6"}}>开发</span>
                <span className="text-[9px] px-2 py-0.5 rounded-xl text-white" style={{"background": "#10B981"}}>BBTalk</span>
              </div>
              <div className="mt-2 flex gap-1.5">
                <div className="w-[52px] h-[52px] rounded-lg" style={{"background": "linear-gradient(135deg,#BFDBFE,#60A5FA)"}}></div>
                <div className="w-[52px] h-[52px] rounded-lg" style={{"background": "linear-gradient(135deg,#FBCFE8,#FDBA74)"}}></div>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[9px]" style={{"color": "rgba(28,28,30,0.4)"}}>2 小时前</span>
                <div className="flex items-center gap-2" style={{"color": "rgba(28,28,30,0.4)"}}>
                  <svg aria-hidden="true" focusable="false" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 21s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 5.65-7 10-7 10z"></path></svg>
                  <svg aria-hidden="true" focusable="false" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                </div>
              </div>
            </div>
            {/* Card 3 */}
            <div className="bg-white rounded-2xl p-3 relative">
              <span className="absolute top-2 right-2 text-[12px] leading-none" style={{"color": "rgba(28,28,30,0.35)"}}>···</span>
              <div className="text-[11px] leading-relaxed pr-4" style={{"color": "#1C1C1E"}}>想到的小灵感：碎碎念也可以是私密日记 💭</div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[9px]" style={{"color": "rgba(28,28,30,0.4)"}}>昨天</span>
              </div>
            </div>
          </div>
          {/* FAB */}
          <div className="absolute bottom-5 right-5 w-11 h-11 rounded-full flex items-center justify-center shadow-glow" style={{"background": "#0A84FF"}}>
            <svg aria-hidden="true" focusable="false" className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" strokeLinecap="round"></path></svg>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

{/* Trust strip */}
<section className="border-y border-black/5" style={{"background": "#F9FAFB"}}>
  <div className="max-w-6xl mx-auto px-6 py-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs" style={{"color": "rgba(28,28,30,0.5)"}}>
    <span>iOS</span><span>·</span>
    <span>Android</span><span>·</span>
    <span>Web / 桌面</span><span>·</span>
    <span>Docker 自部署</span><span>·</span>
    <span>S3 兼容存储</span><span>·</span>
    <span>SQLite / PostgreSQL</span>
  </div>
</section>

{/* Features */}
<section id="features" className="py-20 md:py-28">
  <div className="max-w-6xl mx-auto px-6">
    <div className="text-center max-w-2xl mx-auto">
      <span className="text-xs font-semibold uppercase tracking-widest" style={{"color": "#0A84FF"}}>CORE FEATURES</span>
      <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight">为「想随手记下一切」而生</h2>
      <p className="mt-4" style={{"color": "rgba(28,28,30,0.6)"}}>每一项功能都来自真实使用场景，不堆砌、不打扰。</p>
    </div>

    <div className="mt-14 grid md:grid-cols-2 lg:grid-cols-3 gap-5">

        <div className="group relative bg-white rounded-3xl p-6 border border-black/5 hover-lift">
          <div className="feature-icon-wrap w-12 h-12 rounded-2xl flex items-center justify-center" style={{"background": "#EFF6FF", "color": "#0A84FF"}}>
            <svg aria-hidden="true" focusable="false" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
          </div>
          <h3 className="mt-5 text-lg font-semibold tracking-tight">Markdown 原生支持</h3>
          <p className="mt-2 text-sm leading-relaxed" style={{"color": "rgba(28,28,30,0.6)"}}>代码块、列表、引用、链接与加粗，让灵感和长一点的想法都写得清楚。</p>
        </div>

        <div className="group relative bg-white rounded-3xl p-6 border border-black/5 hover-lift">
          <div className="feature-icon-wrap w-12 h-12 rounded-2xl flex items-center justify-center" style={{"background": "#F5F3FF", "color": "#A855F7"}}>
            <svg aria-hidden="true" focusable="false" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
          </div>
          <h3 className="mt-5 text-lg font-semibold tracking-tight">附件 · 图音视频</h3>
          <p className="mt-2 text-sm leading-relaxed" style={{"color": "rgba(28,28,30,0.6)"}}>每条记录都能附图片、视频、音频和文件；查看上传状态，失败的附件可以单独重试。</p>
        </div>

        <div className="group relative bg-white rounded-3xl p-6 border border-black/5 hover-lift">
          <div className="feature-icon-wrap w-12 h-12 rounded-2xl flex items-center justify-center" style={{"background": "#FDF2F8", "color": "#EC4899"}}>
            <svg aria-hidden="true" focusable="false" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
          </div>
          <h3 className="mt-5 text-lg font-semibold tracking-tight">智能标签系统</h3>
          <p className="mt-2 text-sm leading-relaxed" style={{"color": "rgba(28,28,30,0.6)"}}>输入 #标签名 自动创建，支持自定义颜色与拖拽排序；结合关键词搜索和标签筛选找回记录。</p>
        </div>

        <div className="group relative bg-white rounded-3xl p-6 border border-black/5 hover-lift">
          <div className="feature-icon-wrap w-12 h-12 rounded-2xl flex items-center justify-center" style={{"background": "#ECFDF5", "color": "#10B981"}}>
            <svg aria-hidden="true" focusable="false" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
          </div>
          <h3 className="mt-5 text-lg font-semibold tracking-tight">防偷窥锁屏</h3>
          <p className="mt-2 text-sm leading-relaxed" style={{"color": "rgba(28,28,30,0.6)"}}>Web 支持防窥锁屏；原生客户端还可使用设备支持的生物识别解锁。</p>
        </div>

        <div className="group relative bg-white rounded-3xl p-6 border border-black/5 hover-lift">
          <div className="feature-icon-wrap w-12 h-12 rounded-2xl flex items-center justify-center" style={{"background": "#FFFBEB", "color": "#F59E0B"}}>
            <svg aria-hidden="true" focusable="false" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </div>
          <h3 className="mt-5 text-lg font-semibold tracking-tight">数据自由</h3>
          <p className="mt-2 text-sm leading-relaxed" style={{"color": "rgba(28,28,30,0.6)"}}>导出 JSON，或包含附件的 ZIP；更换服务器前先备份并核对文件完整性。</p>
        </div>

        <div className="group relative bg-white rounded-3xl p-6 border border-black/5 hover-lift">
          <div className="feature-icon-wrap w-12 h-12 rounded-2xl flex items-center justify-center" style={{"background": "#F0F9FF", "color": "#0EA5E9"}}>
            <svg aria-hidden="true" focusable="false" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
          </div>
          <h3 className="mt-5 text-lg font-semibold tracking-tight">多端同步</h3>
          <p className="mt-2 text-sm leading-relaxed" style={{"color": "rgba(28,28,30,0.6)"}}>各端使用同一服务器与账号访问已发布记录；未发布草稿保存在当前浏览器或设备。</p>
        </div>

        <div className="group relative bg-white rounded-3xl p-6 border border-black/5 hover-lift">
          <div className="feature-icon-wrap w-12 h-12 rounded-2xl flex items-center justify-center" style={{"background": "#EEF2FF", "color": "#6366F1"}}>
            <svg aria-hidden="true" focusable="false" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
          </div>
          <h3 className="mt-5 text-lg font-semibold tracking-tight">语音速记</h3>
          <p className="mt-2 text-sm leading-relaxed" style={{"color": "rgba(28,28,30,0.6)"}}>原生客户端提供录音入口，转文字视设备与版本而定；Web 支持音频上传和播放，暂不提供内置录音。</p>
        </div>

        <div className="group relative bg-white rounded-3xl p-6 border border-black/5 hover-lift">
          <div className="feature-icon-wrap w-12 h-12 rounded-2xl flex items-center justify-center" style={{"background": "#FFF1F2", "color": "#F43F5E"}}>
            <svg aria-hidden="true" focusable="false" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
          </div>
          <h3 className="mt-5 text-lg font-semibold tracking-tight">位置标记</h3>
          <p className="mt-2 text-sm leading-relaxed" style={{"color": "rgba(28,28,30,0.6)"}}>授权后可选附加位置信息，让每条碎碎念都有「时空坐标」。</p>
        </div>

        <div className="group relative bg-white rounded-3xl p-6 border border-black/5 hover-lift">
          <div className="feature-icon-wrap w-12 h-12 rounded-2xl flex items-center justify-center" style={{"background": "#F0FDFA", "color": "#14B8A6"}}>
            <svg aria-hidden="true" focusable="false" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path></svg>
          </div>
          <h3 className="mt-5 text-lg font-semibold tracking-tight">本地或云存储</h3>
          <p className="mt-2 text-sm leading-relaxed" style={{"color": "rgba(28,28,30,0.6)"}}>附件可存服务器本地，或对接 S3 兼容存储；支持存储迁移，迁移前请做好备份。</p>
        </div>

        <div className="group relative bg-white rounded-3xl p-6 border border-black/5 hover-lift">
          <div className="feature-icon-wrap w-12 h-12 rounded-2xl flex items-center justify-center" style={{"background": "#EFF6FF", "color": "#0A84FF"}}>
            <svg aria-hidden="true" focusable="false" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
          </div>
          <h3 className="mt-5 text-lg font-semibold tracking-tight">草稿与恢复</h3>
          <p className="mt-2 text-sm leading-relaxed" style={{"color": "rgba(28,28,30,0.6)"}}>Web 自动保存未完成的文字与附件，在同一浏览器恢复后继续写；草稿不会自动跨端同步。</p>
        </div>

        <div className="group relative bg-white rounded-3xl p-6 border border-black/5 hover-lift">
          <div className="feature-icon-wrap w-12 h-12 rounded-2xl flex items-center justify-center" style={{"background": "#EFF6FF", "color": "#0A84FF"}}>
            <svg aria-hidden="true" focusable="false" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
          </div>
          <h3 className="mt-5 text-lg font-semibold tracking-tight">记录管理</h3>
          <p className="mt-2 text-sm leading-relaxed" style={{"color": "rgba(28,28,30,0.6)"}}>置顶常用记录，用评论补充后续；选择公开或仅自己可见，误删可撤销，多处修改有冲突提醒。</p>
        </div>

        <div className="group relative bg-white rounded-3xl p-6 border border-black/5 hover-lift">
          <div className="feature-icon-wrap w-12 h-12 rounded-2xl flex items-center justify-center" style={{"background": "#EFF6FF", "color": "#0A84FF"}}>
            <svg aria-hidden="true" focusable="false" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
          </div>
          <h3 className="mt-5 text-lg font-semibold tracking-tight">桌面快捷记录</h3>
          <p className="mt-2 text-sm leading-relaxed" style={{"color": "rgba(28,28,30,0.6)"}}>通过悬浮球、托盘和全局快捷键唤起，支持截图与拖拽附件、保留草稿；Windows 安装版可检查更新。</p>
        </div>

    </div>
  </div>
</section>

{/* Privacy */}
<section id="privacy" className="py-20 md:py-28 relative overflow-hidden border-y border-black/5" style={{"background": "#FFFFFF"}}>
  <div className="absolute inset-0 grid-bg opacity-60"></div>
  <div className="blob" style={{"width": "260px", "height": "260px", "background": "#A5B4FC", "top": "-40px", "left": "-40px", "opacity": ".35"}}></div>
  <div className="blob" style={{"width": "220px", "height": "220px", "background": "#FBCFE8", "top": "60px", "right": "-40px", "opacity": ".25"}}></div>
  <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-12 items-center relative">
    <div>
      <span className="text-xs font-semibold uppercase tracking-widest" style={{"color": "#0A84FF"}}>PRIVACY FIRST</span>
      <h2 className="mt-3 text-3xl md:text-5xl font-bold leading-[1.1] tracking-tight" style={{"color": "#1C1C1E"}}>
        你的数据，<br />
        <span style={{"background": "linear-gradient(135deg,#0A84FF,#BF5AF2)", "WebkitBackgroundClip": "text", "backgroundClip": "text", "color": "transparent"}}>只属于你自己。</span>
      </h2>
      <p className="mt-6 leading-relaxed max-w-lg" style={{"color": "rgba(28,28,30,0.7)"}}>
        通过自托管决定数据存在哪里，通过可见性设置决定记录分享给谁。
        已发布记录保存在你连接的服务器，附件可使用本地或 S3 兼容存储；私密记录与附件受服务端权限保护。
      </p>
      <ul className="mt-8 space-y-3.5">

          <li className="flex items-start gap-3">
            <span className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{"background": "rgba(16,185,129,0.14)"}}>
              <svg aria-hidden="true" focusable="false" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </span>
            <span style={{"color": "rgba(28,28,30,0.85)"}}>Web 支持防窥模式，离开时保护屏幕上的记录</span>
          </li>

          <li className="flex items-start gap-3">
            <span className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{"background": "rgba(16,185,129,0.14)"}}>
              <svg aria-hidden="true" focusable="false" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </span>
            <span style={{"color": "rgba(28,28,30,0.85)"}}>原生客户端支持设备可用的生物识别解锁</span>
          </li>

          <li className="flex items-start gap-3">
            <span className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{"background": "rgba(16,185,129,0.14)"}}>
              <svg aria-hidden="true" focusable="false" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </span>
            <span style={{"color": "rgba(28,28,30,0.85)"}}>完全开源，所有代码可在 GitHub 审查</span>
          </li>

          <li className="flex items-start gap-3">
            <span className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{"background": "rgba(16,185,129,0.14)"}}>
              <svg aria-hidden="true" focusable="false" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </span>
            <span style={{"color": "rgba(28,28,30,0.85)"}}>支持服务器本地存储与 S3 兼容存储</span>
          </li>

          <li className="flex items-start gap-3">
            <span className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{"background": "rgba(16,185,129,0.14)"}}>
              <svg aria-hidden="true" focusable="false" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </span>
            <span style={{"color": "rgba(28,28,30,0.85)"}}>支持导出记录与附件；自托管的服务器安全和备份由你管理</span>
          </li>

      </ul>
    </div>
    <div className="flex justify-center">
      <div className="relative">
        <div className="blob" style={{"width": "280px", "height": "280px", "background": "#A5B4FC", "top": "-20px", "left": "-20px", "opacity": ".4"}}></div>
        <div className="relative w-64 h-64 rounded-full flex items-center justify-center shadow-glow anim-float" style={{"background": "linear-gradient(135deg,#0A84FF,#BF5AF2)"}}>
          <svg aria-hidden="true" focusable="false" className="w-32 h-32" style={{"color": "rgba(255,255,255,0.95)"}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </div>
      </div>
    </div>
  </div>
</section>

{/* Self-host */}
<section id="deploy" className="py-20 md:py-28" style={{"background": "#F9FAFB"}}>
  <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-12 items-center">
    <div>
      <span className="text-xs font-semibold uppercase tracking-widest" style={{"color": "#0A84FF"}}>SELF-HOSTED</span>
      <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight">一行命令，自己当老板</h2>
      <p className="mt-4 leading-relaxed" style={{"color": "rgba(28,28,30,0.6)"}}>
        完全开源 + Docker 单容器，无需复杂依赖。把 BBTalk 部署在兼容的 NAS、VPS 或自建服务器上，
        数据存储由你配置；服务器、域名和存储费用由你承担。
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <a href="https://github.com/cone387/ChewyBBTalk/blob/master/docs/image-deployment.md" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 font-medium hover:gap-3 transition-all" style={{"color": "#0A84FF"}}>
          部署文档
          <svg aria-hidden="true" focusable="false" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
        </a>
      </div>
    </div>
    <div className="min-w-0 overflow-x-auto rounded-2xl p-6 shadow-soft text-xs sm:text-sm font-mono leading-relaxed" style={{"background": "#0B0B0E"}}>
      <div className="flex items-center gap-1.5 mb-4">
        <div className="w-3 h-3 rounded-full bg-red-400"></div>
        <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
        <div className="w-3 h-3 rounded-full bg-green-400"></div>
        <span className="ml-2 text-xs" style={{"color": "rgba(255,255,255,0.4)"}}>terminal</span>
      </div>
      <div style={{"color": "#34D399"}}>$ docker run -d \</div>
      <div className="ml-2" style={{"color": "rgba(255,255,255,0.85)"}}>--name bbtalk \</div>
      <div className="ml-2" style={{"color": "rgba(255,255,255,0.85)"}}>-p 4010:4010 \</div>
      <div className="ml-2" style={{"color": "rgba(255,255,255,0.85)"}}>-v bbtalk_data:/app/data \</div>
      <div className="ml-2" style={{"color": "rgba(255,255,255,0.85)"}}>ghcr.io/cone387/chewy-bbtalk:latest</div>
      <div className="mt-3" style={{"color": "rgba(255,255,255,0.4)"}}># 打开 http://localhost:4010</div>
      <div style={{"color": "rgba(255,255,255,0.4)"}}># 初始管理员密码请参阅部署文档</div>
    </div>
  </div>
</section>

{/* Download */}
<section id="download" className="py-20 md:py-28">
  <div className="max-w-3xl mx-auto px-6 text-center">
    <span className="text-xs font-semibold uppercase tracking-widest" style={{"color": "#0A84FF"}}>GET STARTED</span>
    <h2 className="mt-3 text-3xl md:text-5xl font-bold tracking-tight">现在就开始记录</h2>
    <p className="mt-4" style={{"color": "rgba(28,28,30,0.6)"}}>先从 Web 开始 · 无需安装 · 支持自托管</p>
    <div className="mt-10 flex flex-wrap justify-center gap-3">
      <Link to="/app" className="inline-flex items-center gap-3 text-white px-6 py-4 rounded-2xl shadow-glow hover:opacity-90 transition" style={{"background": "#0B0B0E"}}>
        <svg aria-hidden="true" focusable="false" className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        <div className="text-left">
          <div className="text-[10px] uppercase tracking-wider" style={{"opacity": ".7"}}>立即使用</div>
          <div className="font-semibold text-base">Web 网页版</div>
        </div>
      </Link>
      <a href="https://github.com/cone387/ChewyBBTalk" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-3 px-6 py-4 rounded-2xl border border-black/10 hover:border-[#0A84FF] hover:text-[#0A84FF] transition" style={{"background": "#fff", "color": "#1C1C1E"}}>
        <svg aria-hidden="true" focusable="false" className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.4.7-4.1-1.6-4.1-1.6-.5-1.4-1.4-1.8-1.4-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.9 1.3 1.9 1.3 1.1 1.9 2.9 1.4 3.6 1 .1-.8.4-1.4.8-1.7-2.7-.3-5.6-1.4-5.6-6 0-1.3.5-2.4 1.3-3.3-.1-.4-.6-1.6.1-3.3 0 0 1-.3 3.3 1.3a11.5 11.5 0 0 1 6 0c2.3-1.6 3.3-1.3 3.3-1.3.7 1.7.2 2.9.1 3.3.8.9 1.3 2 1.3 3.3 0 4.6-2.9 5.6-5.6 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3"></path></svg>
        <div className="text-left">
          <div className="text-[10px] uppercase tracking-wider" style={{"opacity": ".7"}}>查看</div>
          <div className="font-semibold text-base">源代码</div>
        </div>
      </a>
    </div>
    <div className="mt-8 space-y-3 text-sm leading-relaxed" style={{"color": "rgba(28,28,30,0.6)"}}>
      <p><a href="https://github.com/cone387/ChewyBBTalk/releases/tag/desktop-stable" target="_blank" rel="noopener noreferrer" className="underline" style={{"color": "#0A84FF"}}>查看 Windows 安装包</a> · 当前发布页为预发布下载，macOS 用户可先使用 Web。</p>
      <p>iOS：TestFlight 内测 · <a href="/support/" className="underline" style={{"color": "#0A84FF"}}>咨询 iOS 内测</a></p>
      <p>Android：目前提供源码构建方式 · <a href="https://github.com/cone387/ChewyBBTalk/blob/master/mobile/README.md" target="_blank" rel="noopener noreferrer" className="underline" style={{"color": "#0A84FF"}}>Android 构建说明</a></p>
      <p>原生端支持日历回顾、日期筛选和离线保存待提交记录，联网后可重试同步。</p>
    </div>
  </div>
</section>

{/* FAQ */}
<section id="faq" className="py-20 md:py-28" style={{"background": "#F9FAFB"}}>
  <div className="max-w-3xl mx-auto px-6">
    <div className="text-center">
      <span className="text-xs font-semibold uppercase tracking-widest" style={{"color": "#0A84FF"}}>FAQ</span>
      <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight">常见问题</h2>
    </div>
    <div className="mt-12 space-y-3">

        <details className="group bg-white rounded-2xl p-5 border border-black/5 hover:border-black/10 transition">
          <summary className="cursor-pointer flex items-center justify-between font-medium">
            <span>BBTalk 收费吗？</span>
            <svg aria-hidden="true" focusable="false" className="w-5 h-5 transition-transform group-open:rotate-180" style={{"color": "rgba(28,28,30,0.5)"}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </summary>
          <p className="mt-3 text-sm leading-relaxed" style={{"color": "rgba(28,28,30,0.7)"}}>BBTalk 源码开放，可自行部署使用。自托管的服务器、域名与存储费用由你承担；在线服务的开放注册与使用政策以对应站点说明为准。</p>
        </details>

        <details className="group bg-white rounded-2xl p-5 border border-black/5 hover:border-black/10 transition">
          <summary className="cursor-pointer flex items-center justify-between font-medium">
            <span>我的数据存在哪里？</span>
            <svg aria-hidden="true" focusable="false" className="w-5 h-5 transition-transform group-open:rotate-180" style={{"color": "rgba(28,28,30,0.5)"}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </summary>
          <p className="mt-3 text-sm leading-relaxed" style={{"color": "rgba(28,28,30,0.7)"}}>已发布内容保存在所连接的服务器，附件可使用服务器本地存储或 S3 兼容存储。可导出 JSON，或选择包含附件的 ZIP；迁移前请备份并核对文件是否完整。</p>
        </details>

        <details className="group bg-white rounded-2xl p-5 border border-black/5 hover:border-black/10 transition">
          <summary className="cursor-pointer flex items-center justify-between font-medium">
            <span>支持哪些设备？</span>
            <svg aria-hidden="true" focusable="false" className="w-5 h-5 transition-transform group-open:rotate-180" style={{"color": "rgba(28,28,30,0.5)"}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </summary>
          <p className="mt-3 text-sm leading-relaxed" style={{"color": "rgba(28,28,30,0.7)"}}>正式 Web 支持现代桌面和手机浏览器，无需安装。Windows 有桌面客户端，iOS 与 Android 有原生项目；当前获取方式见上方下载入口。macOS 用户可以先使用 Web。</p>
        </details>

        <details className="group bg-white rounded-2xl p-5 border border-black/5 hover:border-black/10 transition">
          <summary className="cursor-pointer flex items-center justify-between font-medium">
            <span>万一以后不维护了，我的数据怎么办？</span>
            <svg aria-hidden="true" focusable="false" className="w-5 h-5 transition-transform group-open:rotate-180" style={{"color": "rgba(28,28,30,0.5)"}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </summary>
          <p className="mt-3 text-sm leading-relaxed" style={{"color": "rgba(28,28,30,0.7)"}}>可导出 JSON 或包含附件的 ZIP，在自己的设备保存副本。即使项目停止维护，已导出的文件仍可读取；请定期备份并检查附件是否完整。</p>
        </details>

        <details className="group bg-white rounded-2xl p-5 border border-black/5 hover:border-black/10 transition">
          <summary className="cursor-pointer flex items-center justify-between font-medium">
            <span>会同步到其他平台吗？</span>
            <svg aria-hidden="true" focusable="false" className="w-5 h-5 transition-transform group-open:rotate-180" style={{"color": "rgba(28,28,30,0.5)"}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </summary>
          <p className="mt-3 text-sm leading-relaxed" style={{"color": "rgba(28,28,30,0.7)"}}>已发布的记录保存在你连接的服务器上。不同客户端使用同一服务器和账号，即可访问自己的记录。未发布草稿保存在当前浏览器或设备，不会自动变成跨端草稿。</p>
        </details>

        <details className="group bg-white rounded-2xl p-5 border border-black/5 hover:border-black/10 transition">
          <summary className="cursor-pointer flex items-center justify-between font-medium">
            <span>Web 可以直接录音吗？</span>
            <svg aria-hidden="true" focusable="false" className="w-5 h-5 transition-transform group-open:rotate-180" style={{"color": "rgba(28,28,30,0.5)"}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </summary>
          <p className="mt-3 text-sm leading-relaxed" style={{"color": "rgba(28,28,30,0.7)"}}>Web 支持上传和播放音频附件，暂不提供内置录音。原生客户端提供录音入口；语音转文字取决于设备、系统权限和安装版本。</p>
        </details>

        <details className="group bg-white rounded-2xl p-5 border border-black/5 hover:border-black/10 transition">
          <summary className="cursor-pointer flex items-center justify-between font-medium">
            <span>断网时还能记录吗？</span>
            <svg aria-hidden="true" focusable="false" className="w-5 h-5 transition-transform group-open:rotate-180" style={{"color": "rgba(28,28,30,0.5)"}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </summary>
          <p className="mt-3 text-sm leading-relaxed" style={{"color": "rgba(28,28,30,0.7)"}}>Web 可以保留本地草稿，发布与读取服务器记录需要联网。桌面端也可保留草稿；原生客户端支持离线保存待提交记录，恢复网络后重试同步，只有明确保存的记录才进入提交队列。</p>
        </details>

        <details className="group bg-white rounded-2xl p-5 border border-black/5 hover:border-black/10 transition">
          <summary className="cursor-pointer flex items-center justify-between font-medium">
            <span>防窥锁屏和私密记录有什么区别？</span>
            <svg aria-hidden="true" focusable="false" className="w-5 h-5 transition-transform group-open:rotate-180" style={{"color": "rgba(28,28,30,0.5)"}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </summary>
          <p className="mt-3 text-sm leading-relaxed" style={{"color": "rgba(28,28,30,0.7)"}}>防窥模式用于遮住当前屏幕上的内容；记录的公开或私密设置决定其他人是否能访问。私密记录和附件还受服务端权限校验保护，自托管时服务器安全与备份由你管理。</p>
        </details>

        <details className="group bg-white rounded-2xl p-5 border border-black/5 hover:border-black/10 transition">
          <summary className="cursor-pointer flex items-center justify-between font-medium">
            <span>进入后没有注册按钮怎么办？</span>
            <svg aria-hidden="true" focusable="false" className="w-5 h-5 transition-transform group-open:rotate-180" style={{"color": "rgba(28,28,30,0.5)"}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </summary>
          <p className="mt-3 text-sm leading-relaxed" style={{"color": "rgba(28,28,30,0.7)"}}>是否开放注册由当前服务器管理员设置。已有账号可以登录；没有账号时，请联系该站点管理员，或按部署文档建立自己的服务。</p>
        </details>

    </div>
  </div>
</section>

</main>
{/* Footer */}
<footer className="py-12 border-t border-black/5">
  <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
    <div className="flex items-center gap-2">
      <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold" style={{"background": "linear-gradient(135deg,#0A84FF,#5E5CE6)"}}>B</span>
      <span className="text-sm font-medium">BBTalk</span>
      <span className="text-xs" style={{"color": "rgba(28,28,30,0.4)"}}>· © 2024-2026 cone387</span>
    </div>
    <div className="flex items-center gap-6 text-xs" style={{"color": "rgba(28,28,30,0.6)"}}>
      <a href="https://github.com/cone387/ChewyBBTalk" target="_blank" rel="noopener noreferrer" className="hover:text-[#0A84FF]">GitHub</a>
      <a href="/privacy-policy/" className="hover:text-[#0A84FF]">隐私政策</a>
      <a href="/support/" className="hover:text-[#0A84FF]">支持与反馈</a>
      <Link to="/app" className="hover:text-[#0A84FF]">进入应用</Link>
    </div>
  </div>
</footer>

  </div>
}
