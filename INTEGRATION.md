# ChewyBBTalk wujie 子应用 - 集成指南

## 一、项目概述

ChewyBBTalk 是一个完全独立的微前端子应用，符合 **wujie 框架规范**。

### 核心特性

✅ **完全独立运行** - 可独立开发、测试、部署
✅ **MemoryRouter** - 不干扰主应用路由
✅ **双认证支持** - 主应用 token 桥接 + Keycloak 独立登录
✅ **wujie 生命周期** - 支持多次挂载/卸载
✅ **无全局污染** - 样式完全隔离

---

## 二、快速开始

### 1. 安装依赖

```bash
cd chewy_bbtalk/frontend
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env`:

```bash
cp .env.example .env
```

编辑 `.env`:

```bash
# 必填：后端 API 地址
VITE_API_BASE_URL=http://localhost:8000

# 可选：Keycloak 配置（不配置则只使用主应用认证）
VITE_KEYCLOAK_URL=
VITE_KEYCLOAK_REALM=
VITE_KEYCLOAK_CLIENT_ID=
```

### 3. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:4001

---

## 三、主应用集成

### 方式一：使用主应用 Token（推荐）

主应用在加载子应用前注入认证桥接：

```typescript
// 在主应用中
window.__AUTH_BRIDGE__ = {
  getToken: () => {
    return localStorage.getItem('your_token_key');
  },
  refreshToken: async () => {
    // 可选：实现 token 刷新逻辑
    return true;
  },
  getUserInfo: async () => {
    // 可选：返回用户信息
    return { id: '123', name: 'User' };
  }
};

// 使用 wujie 加载子应用
import { startApp } from 'wujie';

startApp({
  name: 'bbtalk',
  url: 'http://localhost:4001',  // 开发环境
  el: '#subapp-container',
  alive: true,  // 保活模式
  props: {
    // 可选：传递额外数据
  }
});
```

### 方式二：使用 Keycloak 独立登录

如果主应用未提供 token，子应用会自动尝试 Keycloak 登录（需配置环境变量）。

---

## 四、认证流程

```
┌─────────────────────────────────────┐
│   子应用启动                          │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│   检查 window.__AUTH_BRIDGE__       │
└──────────┬──────────────────────────┘
           │
     ┌─────┴─────┐
     │           │
    有          无
     │           │
     ▼           ▼
┌────────┐  ┌─────────────┐
│使用主应│  │检查 Keycloak│
│用Token │  │环境变量     │
└────────┘  └──────┬──────┘
                   │
             ┌─────┴─────┐
             │           │
            有          无
             │           │
             ▼           ▼
      ┌──────────┐  ┌──────────┐
      │Keycloak  │  │提示用户  │
      │登录      │  │登录      │
      └──────────┘  └──────────┘
```

---

## 五、文件结构

```
chewy_bbtalk/
├── frontend/
│   ├── src/
│   │   ├── types/
│   │   │   ├── global.d.ts          # 全局类型声明（wujie + auth bridge）
│   │   │   └── index.ts             # 业务类型
│   │   ├── services/
│   │   │   ├── apiClient.ts         # API 客户端
│   │   │   ├── bbtalkApi.ts         # BBTalk API
│   │   │   └── tagApi.ts            # Tag API
│   │   ├── components/
│   │   │   ├── BBTalkPublisher.tsx  # 发布器组件
│   │   │   └── BBTalkItem.tsx       # BBTalk 列表项
│   │   ├── pages/
│   │   │   ├── BBTalkPage.tsx       # 主页面
│   │   │   └── BBTalkDetailPage.tsx # 详情页
│   │   ├── auth.ts                  # 认证模块
│   │   ├── App.tsx                  # 路由配置（MemoryRouter）
│   │   ├── main.tsx                 # 入口文件（wujie 生命周期）
│   │   └── index.css                # 全局样式
│   ├── package.json
│   ├── vite.config.ts               # Vite 配置（CORS 开启）
│   ├── tsconfig.json
│   └── .env.example
└── backend/
    └── chewy_space/                 # Django 后端（复制自主项目）
        ├── bbtalk/
        ├── tags/
        ├── user_auth/
        └── manage.py
```

---

## 六、关键代码说明

### 1. 全局类型声明 (`src/types/global.d.ts`)

```typescript
declare global {
  interface Window {
    __WUJIE?: boolean;
    __WUJIE_PUBLIC_PATH__?: string;
    __WUJIE_UNMOUNT__?: () => void;
    __AUTH_BRIDGE__?: {
      getToken(): string | null;
      refreshToken?(): Promise<boolean>;
      getUserInfo?(): Promise<any>;
    };
  }
}
```

### 2. 入口文件 (`src/main.tsx`)

```typescript
const root = ReactDOM.createRoot(container);

// wujie 卸载钩子（必须）
if (window.__WUJIE_UNMOUNT__) {
  window.__WUJIE_UNMOUNT__ = () => {
    root.unmount();
  };
}
```

### 3. 路由配置 (`src/App.tsx`)

```typescript
// 使用 MemoryRouter 而不是 BrowserRouter
<MemoryRouter>
  <Routes>
    <Route path="/" element={<BBTalkPage />} />
    <Route path="/detail/:id" element={<BBTalkDetailPage />} />
  </Routes>
</MemoryRouter>
```

### 4. 认证模块 (`src/auth.ts`)

```typescript
export function getAuthToken(): string | null {
  // 1. 优先使用主应用桥接
  if (window.__AUTH_BRIDGE__?.getToken) {
    const token = window.__AUTH_BRIDGE__.getToken();
    if (token) return token;
  }

  // 2. 使用 Keycloak
  if (keycloakInstance?.token) {
    return keycloakInstance.token;
  }

  // 3. 返回 null
  return null;
}
```

---

## 七、后端 API

后端使用主项目的 BBTalk 模块，确保以下端点可用：

### 认证 API

- `POST /v1/auth/login/` - 登录
- `POST /v1/auth/refresh/` - 刷新 token

### BBTalk API

- `GET /v1/bbtalk/` - 获取列表（需认证）
- `POST /v1/bbtalk/` - 创建（需认证）
- `PATCH /v1/bbtalk/{id}/` - 更新（需认证）
- `DELETE /v1/bbtalk/{id}/` - 删除（需认证）
- `GET /v1/bbtalk/public/{id}/` - 获取公开内容（**无需认证**）

### 标签 API

- `GET /v1/tags/` - 获取标签列表（需认证）

---

## 八、构建与部署

### 开发环境

```bash
# 前端
cd frontend
npm run dev  # http://localhost:4001

# 后端
cd backend/chewy_space
python manage.py runserver  # http://localhost:8000
```

### 生产构建

```bash
cd frontend
npm run build  # 输出到 dist/
```

构建产物可部署到任何静态服务器（Nginx、CDN 等）。

---

## 九、注意事项

### ✅ 必须遵守

1. **路由**：只能使用 `MemoryRouter`
2. **样式**：不写全局样式，不依赖主应用样式
3. **资源**：所有静态资源通过 `import` 引用
4. **生命周期**：实现 `__WUJIE_UNMOUNT__` 清理逻辑
5. **CORS**：Vite 必须开启 `cors: true`

### ❌ 禁止

1. 使用 `BrowserRouter`
2. 直接操作浏览器 history
3. 写 `body/html` 全局样式
4. 假设主应用的实现细节

---

## 十、故障排查

### 问题：子应用无法获取 token

**原因**：主应用未注入 `window.__AUTH_BRIDGE__`

**解决**：
1. 检查主应用是否正确注入桥接对象
2. 或配置 Keycloak 环境变量

### 问题：样式冲突

**原因**：使用了全局 CSS 类名

**解决**：
1. 使用 Tailwind 的 utility classes
2. 或使用 CSS Modules

### 问题：路由不正常

**原因**：使用了 `BrowserRouter`

**解决**：改用 `MemoryRouter`

---

## 十一、未来扩展

可以根据需要添加：

- 媒体上传功能
- Markdown 编辑器
- 评论功能
- 点赞功能
- 搜索优化

---

## 联系方式

有问题请查阅 `README.md` 或联系开发团队。
