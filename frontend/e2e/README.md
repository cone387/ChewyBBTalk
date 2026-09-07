# Web 浏览器回归

依赖：Node.js 20+、Python 3.13、uv。先在 `backend/` 执行 `uv sync --frozen`，在 `frontend/` 执行：

```sh
npm ci
npx playwright install --no-shell chromium
npm run test:e2e
```

CI/Linux 首次安装浏览器可使用 `npx playwright install --with-deps --no-shell chromium`。

- 测试启动回环地址 `127.0.0.1:18020` 的 Django 和 `127.0.0.1:14175` 的 Vite；端口被占用时失败，不复用既有服务。
- 后端使用系统临时目录内的新 SQLite、媒体、静态文件和测试密钥，每条测试通过真实注册接口准备独立账号。不会连接本机开发数据库。
- 使用真实 API，覆盖桌面 1440×1000、小屏触控 375×812：错误登录后重试、发布、编辑、搜索、删除撤销、最终删除和连续删除。
- 断言刷新后的持久状态。正常 feed/undo 截图保存在 `test-results/`，失败时另外保留 trace 和截图。
- 查看报告：`npx playwright show-report`；CI 保留报告 7 天。
- 测试通过 Vite 开发服务器访问 Web，生产构建由独立 `npm run build` 检查；不替代 Nginx 部署、WebKit/Firefox、真机键盘和原生功能验收。
- 正常退出清理临时数据；Windows 强制结束进程可能留下 `chewybbtalk-e2e-*` 临时目录，可按系统临时文件策略清理。

## 附件与 UI 回归补充

`attachment-recovery.spec.ts` 使用真实临时后端完成上传、发布和更新；通过定向拦截制造 413、断网和 500，验证部分成功保留、逐文件重试、发布失败保留以及防窥页面同样保留输入。

UI 走查覆盖 375px 竖屏、812px 横屏、根字号 24px、深色系统偏好和减少动态效果。Web 当前仍为浅色主题，深色偏好测试不代表已实现深色主题；浏览器模拟不代替原生真机键盘、语音或后台恢复验收。导入弹窗采用验证结果 fixture，仅检查布局和退出，不执行导入。

失败文件保留在当前编辑器内存中，刷新或离开页面后需要重新选择。移除上传中项会中止浏览器请求，但不保证服务端已接收的文件回滚。本轮不引入自动发布重试或跨刷新草稿。
