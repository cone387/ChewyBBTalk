# 验证记录

日期：2026-09-07。

## 自动化检查

| 范围 | 命令 | 结果 |
| --- | --- | --- |
| Web | `npm test` | 2 个测试文件，6 项通过 |
| Web | `npm run lint` | 通过 |
| Web | `npm run build` | TypeScript 与 Vite 生产构建通过 |
| 移动端 | `npx tsc --noEmit` | 通过 |
| 移动端 | `npm test -- --runInBand --silent` | 23 个测试文件，201 项通过 |
| 桌面端 | `npm run typecheck` | 主进程、渲染进程类型检查通过 |
| 桌面端 | `npm test -- --run` | 3 个测试文件，19 项通过 |
| 桌面端 | `npm run build` | 构建通过 |
| 规格 | `openspec validate reliability-and-web-simplification --strict` | 通过 |
| 补丁 | `git diff --check` | 通过 |

## 重点覆盖

- 使用真实 SQLite（测试环境 sql.js）执行缓存服务查询，验证服务器/账号隔离、相同 ID、同步时间、清理边界、旧会话拒绝、空列表和原顺序。
- 验证 Redux 会话切换清空记录与标签，拒绝旧请求返回；空的服务器结果不能被旧缓存复活。
- 验证退出登录不等待黑名单网络返回，旧刷新响应不能恢复凭据，其他服务器不能获得旧凭据。
- Web 测试执行实际退场脚本，验证 install/activate、自注销、缓存范围、不拦截 fetch；新访客不清理其他缓存。
- Web DOM 交互测试验证 Modal 的 Tab/Shift+Tab、Escape、焦点恢复、嵌套弹窗与滚动锁，以及原生 Select 的数值类型和禁用行为。
- 已将 Web 回归测试加入 CI。

## 构建与迁移检查

- Web 产物根目录只有 `assets/`、`icon.svg`、`index.html`、`robots.txt`、`sw.js`；没有 manifest、Workbox bundle 或 PWA 注册入口。
- `/sw.js` 为兼容旧客户端保留的退场脚本，两套 Nginx 配置均保持禁止缓存响应。
- 历史无归属 SQLite 缓存不迁入新账号缓存；重新联网获取服务器数据。旧通用草稿键保留在本地但不自动归属到任意账号，新草稿按会话保存。
- 桌面入口打开固定正式发布页，不自动下载或安装更新。

## 验证边界与后续

- 本轮未部署线上，未运行真机 UI、浏览器完整业务 E2E、Nginx 容器或签名安装包验收。
- 后端未修改；上一轮基线为 51 项通过，本轮未重复运行。
- 安装依赖时 npm audit 仍报告已有依赖风险；本轮新加 Web 测试工具已避开引入的旧版 Vitest 严重问题。全仓依赖升级与兼容验证列入后续工程维护，不以本轮测试通过替代安全审计。
- 后续安排以根目录 `ROADMAP.md` 为准：UI 真机走查、业务 E2E、备份恢复入口、搜索与离线补发。
