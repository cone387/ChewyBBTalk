# ChewyBBTalk

碎碎念（微博客）应用，支持独立运行或作为 wujie 微前端子应用嵌入。

## 功能特性

- 📝 发布、编辑、删除碎碎念
- 🏷️ 标签管理与分类
- 📷 媒体文件上传（图片、视频）
- 🔐 Keycloak 认证集成
- 🧩 支持 wujie 微前端嵌入

## 技术栈

**前端**
- React 18 + TypeScript
- Vite 构建工具
- Redux Toolkit 状态管理
- Tailwind CSS 样式
- React Router v6

**后端**
- Django 5.2 + Django REST Framework
- SQLite（开发）/ PostgreSQL（生产）
- Keycloak 认证
- 七牛云存储（可选）

## 环境要求

- Node.js >= 18
- Python >= 3.10
- pip 或 uv 包管理器

## 项目结构

```
chewy_bbtalk/
├── frontend/                    # React 前端
│   ├── src/
│   │   ├── components/          # 组件
│   │   ├── pages/               # 页面
│   │   ├── services/            # API 服务 + 认证模块
│   │   ├── store/               # Redux 状态管理
│   │   ├── types/               # TypeScript 类型
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── .env.example
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
└── backend/                     # Django 后端
    └── chewy_space/
        ├── bbtalk/              # 碎碎念模块
        ├── tags/                # 标签模块
        ├── user_auth/           # 认证模块
        ├── common/              # 公共模块
        ├── media/               # 媒体文件
        ├── chewy_space/         # Django 配置
        │   ├── settings.py
        │   └── urls.py
        └── manage.py
```

## 快速开始

### 1. 后端启动

```bash
cd backend/chewy_space

# 安装依赖
pip install django djangorestframework django-cors-headers python-keycloak
# 或使用 uv
uv pip install django djangorestframework django-cors-headers python-keycloak

# 数据库迁移
python manage.py migrate

# 启动服务（端口 8011）
python manage.py runserver 8011
```

### 2. 前端启动

```bash
cd frontend

# 安装依赖
npm install

# 复制环境变量配置
cp .env.example .env

# 启动开发服务器（端口 4010）
npm run dev
```

### 3. 访问

- 前端：http://localhost:4010
- 后端 API：http://localhost:8011/v1/

## 环境变量配置

### 前端 (.env)

```bash
# API 地址
VITE_API_BASE_URL=http://localhost:8011

# Keycloak 配置（独立运行时需要）
VITE_KEYCLOAK_URL=https://keycloak.example.com
VITE_KEYCLOAK_REALM=your-realm
VITE_KEYCLOAK_CLIENT_ID=your-client-id
```

### 后端 (settings.py)

```python
# Keycloak
KEYCLOAK_URL = 'https://keycloak.example.com'
KEYCLOAK_REALM = 'your-realm'

# 七牛云存储（可选）
QINIU_ACCESS_KEY = ''
QINIU_SECRET_KEY = ''
QINIU_BUCKET_NAME = ''
QINIU_BUCKET_DOMAIN = ''
```

## API 端点

| 方法 | 端点 | 说明 | 认证 |
|------|------|------|------|
| GET | `/v1/bbtalk/` | 获取碎碎念列表 | 需要 |
| POST | `/v1/bbtalk/` | 创建碎碎念 | 需要 |
| GET | `/v1/bbtalk/{id}/` | 获取单条详情 | 需要 |
| PATCH | `/v1/bbtalk/{id}/` | 更新碎碎念 | 需要 |
| DELETE | `/v1/bbtalk/{id}/` | 删除碎碎念 | 需要 |
| GET | `/v1/bbtalk/public/{id}/` | 获取公开内容 | 不需要 |
| GET | `/v1/tags/` | 获取标签列表 | 需要 |

## 构建部署

### 前端构建

```bash
cd frontend
npm run build  # 输出到 dist/
```

### 后端部署

```bash
# 生产环境配置
DEBUG = False
ALLOWED_HOSTS = ['your-domain.com']

# 静态文件收集
python manage.py collectstatic

# 使用 gunicorn 启动
gunicorn chewy_space.wsgi:application -b 0.0.0.0:8011
```

## wujie 微前端集成

作为子应用嵌入主应用时：

### 主应用配置

```typescript
import { startApp } from 'wujie';

// 注入认证桥接（可选）
window.__AUTH_BRIDGE__ = {
  getToken: () => localStorage.getItem('token'),
  getUserInfo: async () => ({ id: '123', name: 'User' })
};

// 加载子应用
startApp({
  name: 'bbtalk',
  url: 'http://localhost:4010',  // 开发环境
  el: '#subapp-container',
  props: {}
});
```

### 认证机制

1. **主应用 Token 桥接**（推荐）- 通过 `window.__AUTH_BRIDGE__` 获取
2. **Keycloak 独立登录** - 配置环境变量后自动启用

### 技术规范

**路由**
- 使用 `BrowserRouter`，支持 wujie 传递 basename
- 子应用路由独立管理

**样式**
- Tailwind CSS（完全 scoped）
- 无全局样式污染
- 不依赖主应用样式

**生命周期**
- 支持多次挂载/卸载
- 自动清理副作用（定时器、监听器等）

## License

MIT
