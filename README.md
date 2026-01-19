# ChewyBBTalk

碎碎念（微博客）应用，支持独立运行或作为 wujie 微前端子应用嵌入。

## 功能特性

- 📝 发布、编辑、删除碎碎念
- 🏷️ 标签管理与分类
- 📎 附件上传（图片、视频、文件）
- 📱 PWA 支持（可安装为桌面/移动应用）
- 🧩 支持 wujie 微前端嵌入
- 🔒 防窥模式（长时间不活动自动模糊内容）

## 技术栈

**前端**
- React 18 + TypeScript
- Vite 构建工具
- Redux Toolkit 状态管理
- Tailwind CSS 样式

**后端**
- Django 5.2 + Django REST Framework
- SQLite（开发）/ PostgreSQL（生产）
- chewy-attachment 附件管理

## 环境要求

- Node.js >= 18
- Python >= 3.13
- uv 包管理器

## 项目结构

```
ChewyBBTalk/
├── frontend/                # React 前端
│   ├── src/
│   │   ├── components/      # 组件
│   │   ├── pages/           # 页面
│   │   ├── services/        # API 服务
│   │   ├── store/           # Redux 状态管理
│   │   └── types/           # TypeScript 类型
│   └── package.json
├── backend/                 # Django 后端
│   └── chewy_space/
│       ├── bbtalk/          # 碎碎念模块（含用户、标签）
│       ├── chewy_space/     # Django 配置
│       └── configs/         # 环境配置（不提交）
├── .env.example             # 环境变量模板
├── .env.dev                 # 开发环境配置
├── start_backend.sh         # 本地启动脚本
├── deploy.sh                # Docker 部署脚本
└── docker-compose.yml       # 多容器编排
```

## 快速开始

### 1. 后端启动

```bash
# 一键启动（推荐）
./start_backend.sh dev

# 或手动启动
cd backend
uv sync
export CHEWYBBTALK_SETTINGS_MODULE=configs.dev_settings
uv run python chewy_space/manage.py migrate
uv run python chewy_space/manage.py runserver 0.0.0.0:8020
```

### 2. 前端启动

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

### 3. 访问

- 前端：http://localhost:4010
- 后端 API：http://localhost:8020/api/v1/
- API 文档：http://localhost:8020/api/schema/swagger-ui/
- Admin 后台：http://localhost:8020/admin/

## 环境变量配置

### 统一配置文件

项目使用统一的 `.env` 文件，同时用于 `start_backend.sh` 和 `docker compose`：

```bash
# 复制模板
cp .env.example .env
# 或使用开发环境配置
cp .env.dev .env
```

### 主要配置项

| 变量 | 说明 | 默认值 |
|------|------|--------|
| ENV | 运行环境 (dev/prod/test) | dev |
| DEBUG | 调试模式 | true |
| DATABASE_URL | 数据库连接 | sqlite:///db.sqlite3 |
| SECRET_KEY | Django 密钥 | 需要修改 |
| FRONTEND_PORT | 前端端口 | 4010 |
| BACKEND_PORT | 后端端口 | 8020 |

### 数据库配置示例

```bash
# SQLite (开发环境)
DATABASE_URL=sqlite:///db.sqlite3

# PostgreSQL (生产环境推荐)
DATABASE_URL=postgresql://username:password@localhost:5432/chewybbtalk

# MySQL (可选)
DATABASE_URL=mysql://username:password@localhost:3306/chewybbtalk
```

### 前端配置（frontend/.env）

| 变量 | 说明 | 默认值 |
|------|------|--------|
| VITE_API_BASE_URL | API 基础地址 | 空（使用相对路径）|
| VITE_PRIVACY_TIMEOUT_MINUTES | 防窥模式超时时长（分钟）| 5 |
| VITE_SHOW_PRIVACY_COUNTDOWN | 是否显示倒计时 | true |
| VITE_SITE_NAME | 网站名称 | ChewyBBTalk |
| VITE_SITE_COPYRIGHT | 版权信息 | © 2024 ChewyBBTalk |

### 系统账号配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| ADMIN_USERNAME | 管理员用户名 | admin |
| ADMIN_EMAIL | 管理员邮箱 | admin@example.com |
| ADMIN_PASSWORD | 管理员密码 | admin123 |

## API 端点

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/v1/bbtalk/` | 获取碎碎念列表 |
| POST | `/api/v1/bbtalk/` | 创建碎碎念 |
| GET | `/api/v1/bbtalk/{uid}/` | 获取单条详情 |
| PATCH | `/api/v1/bbtalk/{uid}/` | 更新碎碎念 |
| DELETE | `/api/v1/bbtalk/{uid}/` | 删除碎碎念 |
| GET | `/api/v1/tag/` | 获取标签列表 |
| POST | `/api/v1/tag/` | 创建标签 |
| GET | `/api/v1/user/me/` | 获取当前用户 |
| POST | `/api/v1/attachments/files/` | 上传附件 |

## 认证机制

**开发环境**
- 使用模拟用户认证（跳过登录）
- 配置在 `frontend/.env` 中的 `VITE_DEV_*` 变量

**生产环境**
- 支持 JWT Token 认证
- 可集成外部认证系统

**端口配置**
- 前端：4010
- 后端：8020

## PWA 功能

应用支持 Progressive Web App (PWA) 功能：

**特性**
- 📱 可安装为桌面/移动应用
- 🔄 自动更新缓存
- 📶 离线访问支持
- 🚀 快速启动和加载

**安装方式**
- Chrome/Edge：地址栏右侧点击安装图标
- Safari：分享菜单 → 添加到主屏幕
- 或浏览器菜单中选择"安装应用"

## 防窥模式

登录状态下，长时间不活动后，BBTalk 内容会自动模糊显示以保护隐私：

**特性**
- ⏱️ 可配置超时时长（默认 5 分钟）
- 🔄 刷新页面后防窥状态保持
- ⌨️ 防窥状态下输入框依然可以正常发布
- 🖱️ 任意鼠标或键盘活动自动解锁

**配置方式**

编辑 `frontend/.env.dev` 或 `frontend/.env`：

```bash
# 防窥模式超时时长（分钟），支持范围：1-60
VITE_PRIVACY_TIMEOUT_MINUTES=5
```

**使用示例**

```bash
# 设置为 10 分钟
VITE_PRIVACY_TIMEOUT_MINUTES=10

# 设置为 30 分钟
VITE_PRIVACY_TIMEOUT_MINUTES=30

# 设置为 1 分钟（适合测试）
VITE_PRIVACY_TIMEOUT_MINUTES=1
```

## 部署

### Docker Compose 部署

```bash
# 使用开发环境配置
docker compose --env-file .env.dev up -d

# 使用生产环境配置
docker compose --env-file .env.prod up -d
```

### 单容器部署

```bash
# 构建并启动
./deploy.sh build
./deploy.sh start

# 查看状态
./deploy.sh status

# 查看日志
./deploy.sh logs
```

## wujie 微前端集成

作为子应用嵌入主应用时：

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

## License

MIT
