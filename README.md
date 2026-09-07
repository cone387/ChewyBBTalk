# ChewyBBTalk

一个现代化的个人微博/碎碎念系统，支持 Markdown、文件上传、标签管理等功能。

## ✨ 特性

- 📝 支持 Markdown 格式的内容编辑
- 📎 文件上传和附件管理（基于 chewy-attachment）
- 🏷️ 标签系统和分类管理
- � 用户认证和权限控制
- 📱 响应式 Web + iOS/Android 原生客户端 + 桌面快捷记录
- 🔒 防窥模式（长时间不活动自动模糊内容）
- 🐳 Docker 容器化部署（一条命令即可启动）
- 📦 数据导入导出（支持跨服务器迁移）
- 🔄 存储迁移（本地存储 ↔ S3 之间自由迁移附件）
- 🎨 现代化的响应式界面
- 🧩 支持 wujie 微前端嵌入

## � 快速开始

### 方式一：单容器部署（推荐）

一条命令即可启动，无需任何配置文件：

```bash
docker run -d --name chewybbtalk -p 4010:4010 -v bbtalk_data:/app/data ghcr.io/cone387/chewy-bbtalk:latest
```

启动后访问 http://localhost:4010 ，管理员用户名默认为 `admin`，初始密码见下方说明。

如需自定义配置：

```bash
docker run -d --name chewybbtalk -p 4010:4010 \
  -v bbtalk_data:/app/data \
  -e ADMIN_PASSWORD=your-password \
  -e SECRET_KEY=your-secret-key \
  ghcr.io/cone387/chewy-bbtalk:latest
```

### 方式二：Docker Compose 部署

```bash
git clone https://github.com/cone387/ChewyBBTalk.git
cd ChewyBBTalk
docker compose up -d
```

同样无需 `.env` 文件即可启动。如需自定义配置，可 `cp .env.example .env` 后编辑。

### 方式三：本地开发

```bash
# 1. 克隆仓库
git clone https://github.com/cone387/ChewyBBTalk.git
cd ChewyBBTalk

# 2. 启动后端服务
bash start_backend.sh

# 3. 启动前端服务（新终端）
cd frontend
npm install
npm run dev
```

## 🔧 配置说明

所有配置项均有合理默认值，无需 `.env` 文件即可启动。如需自定义，可通过环境变量或 `.env` 文件配置：

```bash
# Django 配置
SECRET_KEY=           # 留空则自动生成并持久化到 /app/data/.secret_key
DEBUG=false           # 默认 false
ALLOWED_HOSTS=*       # 默认允许所有域名

# 数据库配置（支持 SQLite、PostgreSQL、MySQL）
DATABASE_URL=sqlite:////app/data/db/db.sqlite3  # 默认 SQLite
# DATABASE_URL=postgresql://user:pass@host:5432/chewybbtalk

# 系统管理员账号（首次启动时创建）
ADMIN_USERNAME=admin        # 默认 admin
ADMIN_PASSWORD=            # 留空则随机生成并保存到受限文件
CREATE_DEMO_USER=false      # 默认不创建固定凭据的演示账号
```

### 前端配置（frontend/.env）

```bash
# API 基础地址（留空使用相对路径）
VITE_API_BASE_URL=

# 防窥模式配置
VITE_PRIVACY_TIMEOUT_MINUTES=5
VITE_SHOW_PRIVACY_COUNTDOWN=true

# 站点信息
VITE_SITE_NAME=ChewyBBTalk
VITE_SITE_COPYRIGHT=© 2024 ChewyBBTalk
```

## 📦 Docker 镜像

项目提供多种 Docker 镜像，支持 `linux/amd64` 和 `linux/arm64` 架构：

- **单容器镜像**（推荐）: `ghcr.io/cone387/chewy-bbtalk:latest`
  - 包含前端、后端、Nginx，开箱即用
- **后端镜像**: `ghcr.io/cone387/chewybbtalk-backend:latest`
- **前端镜像**: `ghcr.io/cone387/chewybbtalk-frontend:latest`

## 🌐 访问地址

服务启动后，可通过以下地址访问：

- **主页**: http://localhost:4010
- **API 文档**: http://localhost:4010/api/schema/swagger-ui/
- **管理后台**: http://localhost:4010/admin/

## 🔐 默认账号

首次启动时会自动创建管理员账号：

- **用户名**: `admin`
- **密码**: 使用 `ADMIN_PASSWORD`，留空时随机生成并保存到 `/app/data/credentials/initial-admin.json`，不会写入启动日志。

首次登录后修改初始密码并移除凭据文件。升级不会覆盖已有账号密码。

容器管理员可执行 `docker exec chewybbtalk cat /app/data/credentials/initial-admin.json` 获取初始凭据。Compose 容器名为 `chewybbtalk-backend`。本地运行默认保存在 `backend/chewy_space/data/credentials/`，可通过 `DATA_DIR` 指定数据目录。

也可通过环境变量提供 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD`。仅明确设置 `CREATE_DEMO_USER=true` 时才会新建固定凭据的演示账号；现有演示账号不会自动删除。

## 🌐 Web 客户端

`frontend/` 提供普通浏览器访问和响应式布局，不再提供 PWA 安装、Service Worker 离线缓存或离线可用承诺。

从旧版本升级时，保留的 `/sw.js` 仅用于让历史 Service Worker 清理自身缓存并注销；不会强制刷新正在编辑的页面。曾安装到主屏幕的快捷方式可由用户自行移除。自定义反向代理也必须允许该文件返回 JavaScript，并设置 `Cache-Control: no-cache, no-store, must-revalidate`。

原生端离线读取由 `mobile/` 的账号隔离缓存提供。

## 🔒 防窥模式

登录状态下，长时间不活动后，BBTalk 内容会自动模糊显示以保护隐私：

**特性**
- ⏱️ 可配置超时时长（默认 5 分钟）
- 🔄 刷新页面后防窥状态保持
- ⌨️ 防窥状态下输入框依然可以正常发布
- 🖱️ 任意鼠标或键盘活动自动解锁

**配置方式**

编辑 `frontend/.env`：

```bash
# 防窥模式超时时长（分钟），支持范围：1-60
VITE_PRIVACY_TIMEOUT_MINUTES=5
```

## 🧩 微前端集成

作为 wujie 子应用嵌入主应用时：

```typescript
import { startApp } from 'wujie';

// 注入认证桥接
window.__AUTH_BRIDGE__ = {
  getToken: () => localStorage.getItem('token'),
  getUserInfo: async () => ({ id: '123', name: 'User' })
};

// 加载子应用
startApp({
  name: 'bbtalk',
  url: 'http://localhost:4010',
  el: '#subapp-container'
});
```

## 🛠️ 开发

### 技术栈

**前端**
- React 18 + TypeScript
- Vite 构建工具
- Redux Toolkit 状态管理
- Tailwind CSS 样式

**后端**
- Django 5.2 + Django REST Framework
- SQLite（默认）/ PostgreSQL / MySQL
- chewy-attachment 附件管理
- JWT 认证

**部署**
- Docker + Nginx
- GitHub Actions 自动构建

宿主机定时备份（systemd timer / cron）见 [docs/docker-autostart.md](docs/docker-autostart.md)。

### Web 与原生端分工

- 实际线上 Web 部署始终使用 `frontend/`（React + Vite），Docker/Nginx 构建链路不切换到 Expo Web。
- `mobile/` 负责 iOS/Android 原生应用；其中 Expo Web 仅用于开发验证，不作为生产部署目标。

### 环境要求

- Node.js >= 18
- Python >= 3.13
- uv 包管理器（后端）

### 项目结构

```
ChewyBBTalk/
├── frontend/                # React 前端应用
│   ├── src/
│   │   ├── components/      # 组件
│   │   ├── pages/           # 页面
│   │   ├── services/        # API 服务
│   │   ├── store/           # Redux 状态管理
│   │   └── types/           # TypeScript 类型
│   └── Dockerfile
├── backend/                 # Django 后端 API
│   ├── chewy_space/
│   │   ├── bbtalk/          # 碎碎念模块
│   │   └── chewy_space/     # Django 配置
│   └── Dockerfile
├── data/                    # 数据存储目录
├── .github/workflows/       # GitHub Actions
├── Dockerfile              # 单容器部署
├── docker-compose.yml      # 多容器部署
├── start_backend.sh        # 本地开发脚本
└── deploy.sh              # 单容器部署脚本
```

### 本地开发环境

1. **后端开发**:
   ```bash
   cd backend
   uv sync  # 安装依赖
   cd chewy_space
   uv run python manage.py migrate  # 数据库迁移
   uv run python manage.py runserver 0.0.0.0:8020
   ```

2. **前端开发**:
   ```bash
   cd frontend
   npm install
   npm run dev  # 开发服务器：http://localhost:5173
   ```

### Web 浏览器回归

在 `frontend/` 运行 `npm run test:e2e`，会自动启动临时 Django 数据库和 Web，覆盖桌面及小屏的登录、记录编辑、搜索与删除撤销。安装与报告说明见 [frontend/e2e/README.md](frontend/e2e/README.md)。

## 📋 API 端点

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/v1/bbtalk/` | 获取碎碎念列表 |
| POST | `/api/v1/bbtalk/` | 创建碎碎念 |
| GET | `/api/v1/bbtalk/{uid}/` | 获取单条详情 |
| PATCH | `/api/v1/bbtalk/{uid}/` | 更新碎碎念 |
| DELETE | `/api/v1/bbtalk/{uid}/` | 删除碎碎念 |
| GET | `/api/v1/tag/` | 获取标签列表 |
| POST | `/api/v1/tag/` | 创建标签 |
| POST | `/api/v1/attachments/files/` | 上传附件 |
| GET | `/api/v1/attachments/files/` | 获取附件列表 |
| GET | `/api/v1/bbtalk/data/export/` | 导出用户数据 (JSON/ZIP) |
| POST | `/api/v1/bbtalk/data/import/` | 导入用户数据 |
| POST | `/api/v1/bbtalk/data/validate/` | 验证导入文件 |
| POST | `/api/v1/bbtalk/storage/migration/preview/` | 预览存储迁移 |
| POST | `/api/v1/bbtalk/storage/migration/execute/` | 执行存储迁移 |

## 🚀 自动化部署

项目使用 GitHub Actions 自动构建和发布 Docker 镜像：

- **推送到 master 分支**: 自动构建并推送 `latest` 标签
- **创建 Release**: 自动构建并推送版本标签，创建 GitHub Release

### 创建发布版本

```bash
# 创建并推送标签
git tag v1.0.0
git push origin v1.0.0

# GitHub Actions 会自动：
# 1. 构建多架构 Docker 镜像
# 2. 推送到 GitHub Container Registry
# 3. 创建 GitHub Release
# 4. 生成部署文档
```

## 📝 更新日志

查看 [Releases](https://github.com/cone387/ChewyBBTalk/releases) 页面获取详细的更新日志。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 📄 许可证

MIT License - 查看 [LICENSE](LICENSE) 文件了解详情

## 🙏 致谢

- [Django](https://www.djangoproject.com/) - Web 框架
- [React](https://reactjs.org/) - 前端框架
- [chewy-attachment](https://github.com/cone387/ChewyAttachment) - 附件管理
- 所有贡献者和开源项目的支持！

自动部署使用 CI 构建的固定镜像 digest，不在服务器重复构建。拉取、启动检查与失败恢复方式见 [镜像部署说明](docs/image-deployment.md)。


### 注册与认证请求限制

自助注册默认关闭，包括升级后未配置此项的实例；已有账号仍可登录。
需要开放注册时，在根目录 `.env` 设置 `REGISTRATION_ENABLED=true` 并重启服务。
Web 登录页读取服务端策略，关闭时展示管理员联系提示；策略读取失败可重试，不阻止已有账号登录。

`AUTH_LOGIN_RATE=30/minute`、`AUTH_REGISTRATION_RATE=5/minute`、`AUTH_REFRESH_RATE=120/minute`
分别控制登录（JWT 与旧登录接口共享额度）、注册和令牌刷新请求；成功与失败请求均计数。
达到限制返回 HTTP 429、中文原因、`Retry-After` 秒数和 `retry_after` 字段。
设置某项为空可关闭该项限制，修改后需重启服务。

默认使用 Django 进程内缓存，按直接连接 IP 计数；多个 worker 的额度独立，重启会重置，
不是全局严格配额。应用不信任客户端提供的 `X-Forwarded-For`，反向代理后的访问可能共享代理 IP 额度。
部署时按并发和用户规模调整额度；需要跨 worker 或真实来源 IP 的统一限制时，
在可信入口代理配置对应限流，或另行配置共享缓存及可信代理策略。


### 运行状态

登录后打开「设置 → 运行状态」，手动重新检查服务连接、当前账号存储和最近备份。
普通账号只能查看自己的备份汇总和当前存储检查；管理员另可查看数据库查询结果及附件目录所在磁盘的剩余空间。
接口 `/api/v1/bbtalk/settings/status/` 要求登录且不缓存，不返回凭据、内部路径或其他账号数据。

本地存储以临时文件验证读写并清理；S3 使用限时只读列表请求验证连接和列表权限，
不代表上传权限或全部历史附件均可用。存储检查针对当前上传配置，历史附件可能位于其他配置。
备份状态读取现有账号备份记录；最近执行失败时仍展示之前可用备份，便于恢复。
状态页不会自动创建备份；在「数据管理」中创建、下载或恢复。
单项检查失败不隐藏其他结果，网络失败保留上次结果并明确标记，可点击「重新检查」。
