import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import workspaceImage from '../assets/product/workspace.png'
import './LandingPage.css'

const repository = 'https://github.com/cone387/ChewyBBTalk'
const features = [
  {
    title: '想到什么，就记下来', description: '几句话、一段代码、一张照片，都可以成为一条记录。',
    items: [
      ['Markdown 编辑', '用标题、列表、引用和代码块，把想法写清楚。'],
      ['图片、音视频与文件', '为记录附上素材，也可在授权后添加位置；上传失败的附件可以单独重试。'],
      ['草稿自动保存', '在同一浏览器恢复未完成的文字和附件，接着上次继续写。'],
    ],
  },
  {
    title: '留下的想法，找得回来', description: '不只向前记录，也给过去的自己留一个入口。',
    items: [
      ['搜索与标签筛选', '用关键词查找，配合标签缩小范围；标签支持颜色和拖拽排序。'],
      ['置顶与评论补充', '把常用记录留在前面，在评论里补上后续想法。'],
      ['公开或仅自己可见', '每条记录都能选择可见性，公开记录可通过链接分享。'],
    ],
  },
  {
    title: '中途打断，也能继续', description: '把保存状态说清楚，让每次提交都有回应。',
    items: [
      ['恢复与重试', '保留未完成的内容，查看附件上传状态，失败后继续处理。'],
      ['删除后可撤销', '误删时通过撤销提示恢复记录，减少一次手滑的损失。'],
      ['修改冲突提醒', '记录已在另一处更新时，先核对差异，再决定如何保存。'],
    ],
  },
]
const questions = [
  ['支持哪些设备？', '正式 Web 支持现代桌面和手机浏览器，无需安装。Windows 有桌面客户端，iOS 与 Android 有原生项目；当前获取方式见上方各端入口。macOS 用户可以先使用 Web。'],
  ['BBTalk 收费吗？', 'BBTalk 源码开放，可自行部署使用。自托管的服务器、域名与存储费用由你承担；在线服务的开放注册与使用政策以对应站点说明为准。'],
  ['记录和草稿都会同步吗？', '已发布的记录保存在你连接的服务器上。不同客户端使用同一服务器和账号，即可访问自己的记录。未发布草稿保存在当前浏览器或设备，不会自动变成跨端草稿。'],
  ['Web 可以直接录音吗？', 'Web 支持上传和播放音频附件，暂不提供内置录音。原生客户端提供录音入口；语音转文字取决于设备、系统权限和安装版本。'],
  ['断网时还能记录吗？', 'Web 可以保留本地草稿，发布与读取服务器记录需要联网。桌面端也可保留草稿；原生客户端支持离线保存待提交记录，恢复网络后重试同步，只有明确保存的记录才进入提交队列。'],
  ['数据存在哪里，可以搬走吗？', '已发布内容保存在所连接的服务器，附件可使用服务器本地存储或 S3 兼容存储。可导出 JSON，或选择包含附件的 ZIP；迁移前请备份并核对文件是否完整。'],
  ['防窥锁屏和私密记录有什么区别？', '防窥模式用于遮住当前屏幕上的内容；记录的公开或私密设置决定其他人是否能访问。私密记录和附件还受服务端权限校验保护，自托管时服务器安全与备份由你管理。'],
  ['进入后没有注册按钮怎么办？', '是否开放注册由当前服务器管理员设置。已有账号可以登录；没有账号时，请联系该站点管理员，或按部署文档建立自己的服务。'],
]

function Brand() {
  return <span className="lp-brand">
    <span className="lp-brand-icon"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg></span>BBTalk
  </span>
}

export default function LandingPage() {
  useEffect(() => {
    const previousTitle = document.title
    document.title = 'BBTalk · 你的私人碎碎念'
    return () => { document.title = previousTitle }
  }, [])

  return <div className="landing-root">
    <a href="#landing-main" className="landing-skip">跳到主要内容</a>
    <header className="lp-header">
      <nav aria-label="产品导航" className="lp-container lp-navigation">
        <Link to="/about" aria-label="BBTalk 产品介绍"><Brand /></Link>
        <div className="lp-nav-links"><a href="#features">功能</a><a href="#platforms">各端入口</a><a href="#privacy">隐私与数据</a><a href="#deploy">自托管</a><a href="#faq">常见问题</a></div>
        <Link to="/app" className="lp-button lp-button-primary lp-nav-cta">进入 BBTalk</Link>
      </nav>
    </header>
    <main id="landing-main">
      <section className="lp-hero lp-container" aria-labelledby="product-title">
        <div className="lp-hero-copy">
          <div><p className="lp-intro">给日常的想法，一个自己的地方。</p><h1 id="product-title"><span>你的私人碎碎念</span><span>都值得被记住</span></h1></div>
          <div className="lp-hero-description">
            <p>随手记下灵感、读书摘录和生活片段，用搜索与标签把它们找回来。BBTalk 是一个支持多端访问、可以自托管的个人记录工具。</p>
            <div className="lp-actions"><Link to="/app" className="lp-button lp-button-primary">立即开始</Link><a href="#platforms" className="lp-button lp-button-secondary">选择适合你的客户端</a></div>
            <p className="lp-caption">先从 Web 开始，无需安装。连接自己的服务器，也能继续使用。</p>
          </div>
        </div>
        <figure className="lp-workspace">
          <div className="lp-window-bar" aria-hidden="true"><span className="lp-window-dots"><i /><i /><i /></span><span>BBTalk / 我的记录</span><span>Web</span></div>
          <img src={workspaceImage} width="1360" height="980" alt="BBTalk Web 实际界面：左侧搜索与标签，右侧编辑器和置顶记录；画面使用示例内容" />
          <figcaption>正式 Web 实际界面 · 示例内容<span>从一个想法，写到一段日常。</span></figcaption>
        </figure>
      </section>
      <section id="features" className="lp-section lp-container" aria-labelledby="features-title">
        <div className="lp-section-heading"><h2 id="features-title">记下来，也找得回来。</h2><p>从写下第一句，到重新读到它，照顾好记录的每一步。</p></div>
        <div className="lp-feature-grid">{features.map(feature => <article className="lp-feature" key={feature.title}>
          <h3>{feature.title}</h3><p>{feature.description}</p>
          <dl>{feature.items.map(([title, description]) => <div key={title}><dt>{title}</dt><dd>{description}</dd></div>)}</dl>
        </article>)}</div>
      </section>
      <section id="platforms" className="lp-platform-section" aria-labelledby="platforms-title">
        <div className="lp-container lp-section">
          <div className="lp-section-heading"><h2 id="platforms-title">在顺手的地方，接着记录。</h2><p>连接同一服务器、登录同一账号，访问已经发布的记录。各端保留适合自己的使用方式。</p></div>
          <div className="lp-platform-grid">
            <article className="lp-platform lp-platform-web">
              <span className="lp-availability">直接使用</span><h3>Web</h3><p className="lp-platform-lead">打开浏览器，就是你的记录空间。</p>
              <ul><li>完整的编辑、搜索、标签与记录管理</li><li>适配桌面和手机浏览器</li><li>账户、存储、备份与导入导出设置</li></ul>
              <Link to="/app" className="lp-button lp-button-primary">打开 Web 版</Link>
            </article>
            <article className="lp-platform">
              <span className="lp-availability lp-availability-neutral">Windows · 预发布下载</span><h3>桌面快捷记录</h3><p className="lp-platform-lead">不用离开手头的工作，就能记一笔。</p>
              <ul><li>悬浮球、托盘和全局快捷键唤起</li><li>截图、拖拽与文件附件</li><li>关闭前保留草稿，上传失败可重试</li></ul>
              <a className="lp-button lp-button-secondary" href={`${repository}/releases/tag/desktop-stable`} target="_blank" rel="noopener noreferrer">查看 Windows 安装包</a>
              <p className="lp-caption">Windows 安装版支持检查更新。安装包与版本说明见发布页；macOS 暂推荐使用 Web。</p>
            </article>
            <article className="lp-platform">
              <span className="lp-availability lp-availability-neutral">iOS / Android</span><h3>原生移动端</h3><p className="lp-platform-lead">把路上的灵感，留给之后的自己。</p>
              <ul><li>日历回顾、标签与日期筛选</li><li>录音入口，语音转文字视设备和版本而定</li><li>离线保存待提交记录，联网后重试同步</li></ul>
              <p className="lp-release-status">iOS：TestFlight 内测。Android：目前提供源码构建方式。</p>
              <div className="lp-platform-links"><a href="/support/">咨询 iOS 内测</a><a href={`${repository}/blob/master/mobile/README.md`} target="_blank" rel="noopener noreferrer">Android 构建说明</a></div>
            </article>
          </div>
        </div>
      </section>
      <section id="privacy" className="lp-section lp-container lp-data-section" aria-labelledby="privacy-title">
        <div><h2 id="privacy-title">分享多少，<br />由你决定。</h2><p>写给自己的记录，设为仅自己可见；想分享的内容，设为公开。防窥模式在你离开时保护屏幕上的内容，私密附件访问也需要认证。原生端还可使用设备支持的生物识别解锁。</p><a className="lp-text-link" href="/privacy-policy/">阅读隐私政策</a></div>
        <div className="lp-data-options">
          <article><h3>选择存放的位置</h3><p>内容保存在你连接的服务器上。附件可使用服务器本地存储，或 S3 兼容服务；支持存储迁移。</p></article>
          <article><h3>保留带走的方式</h3><p>导出 JSON，或选择包含附件的 ZIP。更换服务器前先备份、核对导出文件，让迁移有据可查。</p></article>
          <article><h3>分清草稿与已发布记录</h3><p>草稿保存在当前浏览器或设备；发布后的记录通过服务器在各端访问。自托管时，服务器与备份由你管理。</p></article>
        </div>
      </section>
      <section id="deploy" className="lp-deploy-section" aria-labelledby="deploy-title">
        <div className="lp-container lp-section lp-deploy-grid">
          <div><h2 id="deploy-title">也可以，放在自己的服务器上。</h2><p>通过 Docker 部署 BBTalk，把 Web 和后端运行在兼容的 NAS、VPS 或自建服务器上。源码开放，数据存储由你配置。</p><a href={`${repository}/blob/master/docs/image-deployment.md`} target="_blank" rel="noopener noreferrer" className="lp-button lp-button-secondary">查看部署文档</a></div>
          <div className="lp-terminal"><p>启动一个 BBTalk 服务</p><pre tabIndex={0} aria-label="Docker 部署命令"><code>{`docker run -d --name bbtalk \\
  -p 4010:4010 \\
  -v bbtalk_data:/app/data \\
  ghcr.io/cone387/chewy-bbtalk:latest`}</code></pre><p>启动后访问 http://localhost:4010。首次管理员信息、配置与升级步骤请按部署文档操作。</p></div>
        </div>
      </section>
      <section id="faq" className="lp-section lp-container lp-faq" aria-labelledby="faq-title">
        <div className="lp-section-heading"><h2 id="faq-title">开始之前，你可能想知道。</h2></div>
        {questions.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">＋</span></summary><p>{answer}</p></details>)}
      </section>
      <section className="lp-container lp-start" aria-labelledby="start-title"><div><h2 id="start-title">从今天的一件小事开始。</h2><p>不必整理好所有想法，先记下这一刻。</p></div><Link to="/app" className="lp-button lp-button-primary">开始我的记录</Link></section>
    </main>
    <footer className="lp-footer lp-container"><div><Brand /><p>BBTalk · 记录与回顾</p></div><nav aria-label="页脚导航"><a href={repository} target="_blank" rel="noopener noreferrer">GitHub</a><a href="/privacy-policy/">隐私政策</a><a href="/support/">支持与反馈</a><Link to="/app">进入应用</Link></nav></footer>
  </div>
}
