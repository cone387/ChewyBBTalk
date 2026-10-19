# 介绍页截图

页面保留原有视觉风格，截图用于更新产品展示，不替换整体设计。全部素材为实际运行画面和隔离示例内容，不包含生产用户数据；原图通过页面链接打开，不裁掉功能区域。

| 文件 | 来源 | 尺寸 |
| --- | --- | --- |
| `ios-home.png` | iOS 1.3.17 原生 Release 应用，iPhone 16 模拟器；[产品截图 39196495349](https://github.com/cone387/ChewyBBTalk/actions/runs/39196495349) 的 `product-home.png` | 1178 × 2556 |
| `workspace.png` | 2026-10-19，当前 `frontend/`，Chromium + 隔离 E2E 后端 | 1360 × 980 |
| `desktop-compose.png` | 2026-10-19，当前 `desktop/` 0.2.5，Windows Electron 真实编辑窗口，2 倍像素密度 | 880 × 398 |

iOS 原图由 `.github/workflows/product-screenshots-ios.yml` 重拍，使用原生验收 `38852294885` 保存的 Release 模拟器应用，并校验二进制来源为 `04fb6cc`（iOS 1.3.17），不是当前 master 的新客户端版本，也不是 Expo Web。画面内容来自 `scripts/mobile-visual/fixture-server.cjs` 的 `BBTALK_VISUAL_FIXTURE=product` 模式，只包含四条日常文字记录。默认验收模式仍保留媒体附件测试；不要直接把含有 App 图标占位附件的验收截图用于介绍页。

Web 与桌面截图基于 `8caece9` 的运行代码；使用 `backend/tools/e2e_server.py`、新建示例账号“小满”和专门编写的示例记录。Web 展示标签、置顶、Markdown 与草稿，桌面展示已登录的文字编辑与标签。Electron 使用系统临时目录中的隔离配置，不读取日常客户端账号或草稿。

更新截图时先核对实际安装版本与 UI 来源，再使用隔离数据重拍。截图后必须人工查看整张原图，尤其是底部导航和边缘区域，排除测试占位图片、加载骨架和调试状态；不能仅凭页面 DOM 断言判断截图正确。隐藏 Electron 窗口的 `capturePage()` 可能返回旧帧，本次使用 Playwright 页面截图并核对文字和发布状态。临时采集脚本、账号凭据和浏览器配置不得提交。
