# ChewyBBTalk

碎碎念（微博客）应用，支持独立运行或作为 wujie 微前端子应用嵌入。

## 功能特性

- 📝 发布、编辑、删除碎碎念
- 🏷️ 标签管理与分类
- 📎 附件上传（图片、视频、文件）
- 🔐 Authelia 认证集成
- 🧩 支持 wujie 微前端嵌入

## 技术栈

**前端**
- React 18 + TypeScript
- Vite 构建工具
- Redux Toolkit 状态管理
- Tailwind CSS 样式

**后端**
- Django 5.2 + Django REST Framework
- SQLite（开发）/ PostgreSQL（生产）
- Authelia 认证
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
uv run python chewy_space/manage.py runserver 0.0.0.0:8000
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
- 后端 API：http://localhost:8000/api/v1/
- API 文档：http://localhost:8000/api/schema/swagger-ui/
- Admin 后台：http://localhost:8000/admin/

## 环境变量配置

### 统一配置文件

项目使用统一的 `.env` 文件，同时用于 `start_backend.sh` 和 `docker-compose.yml`：

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
| DATABASE_URL | 数据库连接 | sqlite:///./db.sqlite3 |
| SECRET_KEY | Django 密钥 | 需要修改 |
| CHEWYBBTALK_SETTINGS_MODULE | 配置模块 | configs.dev_settings |

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

项目使用 **Authelia** 进行统一认证：

1. **生产环境** - Authelia 反向代理注入用户信息
   - `Remote-User`: 用户名
   - `Remote-Email`: 邮箱
   - `Remote-Groups`: 用户组

2. **开发环境** - 支持测试请求头（DEBUG=True 时）
   - `X-Authelia-User-Id`: 用户ID
   - `X-Username`: 用户名
   - `X-Groups`: 用户组

## 部署

### Docker Compose 部署

```bash
# 使用开发环境配置
docker-compose --env-file .env.dev up -d

# 使用生产环境配置
docker-compose --env-file .env.prod up -d
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
