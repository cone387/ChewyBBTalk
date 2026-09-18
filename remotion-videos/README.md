# ChewyBBTalk 项目介绍视频

用 [Remotion](https://www.remotion.dev/)（React 写视频）生成的 30 秒 16:9 项目介绍片。
所有内容都是可编辑的 React 代码，改完重新渲染即可。

```
输出文件：../videos/chewybbtalk-intro-30s.mp4
规格：1920×1080 / 30fps / 30s / H.264 + AAC
音乐：ccMixter "Straight To The Light" by AlexBeroza（CC BY 3.0，署名见 public/music/ATTRIBUTION.txt）
```

## 快速使用

```bash
npm ci               # 按锁文件安装依赖
npm run typecheck    # 检查 TypeScript
npm run dev          # 打开 Remotion Studio，可逐帧预览
npm run render       # 渲染到 ../videos/chewybbtalk-intro-30s.mp4
npm run still        # 导出单帧图片
```

## 分镜

| # | 场景 | 时间 | 内容 |
|---|------|------|------|
| 1 | 品牌开场 | 0.0 – 2.5s | Logo 弹入 + 项目名 + 一句话定位 |
| 2 | 核心功能 | 2.0 – 10.0s | 6 张功能卡片交错入场 + 依次高亮扫过 |
| 3 | 隐私与数据自主 | 9.5 – 17.3s | 防窥模式演示（模糊→解锁）+ 导出/迁移/备份 |
| 4 | 三端协同 | 16.8 – 23.7s | Web / iOS·Android / 桌面悬浮球 三种入口 |
| 5 | 部署与 CTA | 23.2 – 30.0s | 一条 Docker 命令 + 仓库地址 |

相邻场景重叠 15 帧，重叠区由**上层淡入、下层保持不透明**完成交叉溶解
（两层同时淡出+淡入会让重叠区亮度塌陷）。

## 背景音乐

`public/music/bgm-30s.m4a` 是切好的 30 秒片段，在 `VideoComposition.tsx` 里用
`<Audio>` 引入，音量由 `BGM_PEAK` 与 `bgmVolume()` 的淡入淡出曲线控制。
换成自己的音乐只需替换这个文件；不需要音乐就删掉那行 `<Audio>`。
对外发布视频时请保留 [音乐署名](public/music/ATTRIBUTION.txt)。源码、配置、锁文件及必要素材入库；依赖目录和渲染产物不入库。

## 想改内容？只动这两个文件

- `src/theme.ts` —— 文案、配色、字体、时间线全部集中在顶部常量里。
- 各 `src/compositions/chewybbtalk-intro/Scene*.tsx` —— 单个场景的版式与动效。

## 关于渲染环境

`remotion.config.ts` 会优先复用本机已安装的 Chrome / Edge，
避免首次渲染去下载 `chrome-headless-shell`（部分网络环境下极慢）。
如需强制使用 Remotion 自带浏览器，删掉该文件里的自动探测逻辑即可，
或用环境变量指定：`REMOTION_BROWSER=/path/to/chrome`。

## 结构

```
src/
├── index.ts                 # 入口
├── Root.tsx                 # 注册 Composition
├── theme.ts                 # 常量：品牌色 / 文案 / 时间线
├── anim.ts                  # 动效工具：淡入上移 / 交错 / 打字机 / 弹簧
├── components/Icon.tsx      # 内联矢量图标（不依赖字体与网络）
└── compositions/chewybbtalk-intro/
    ├── VideoComposition.tsx # 主时间线
    ├── Scene1Brand.tsx
    ├── Scene2Features.tsx
    ├── Scene3Privacy.tsx
    ├── Scene4Devices.tsx
    └── Scene5Cta.tsx
```
