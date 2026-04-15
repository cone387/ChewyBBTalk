# 实现计划：系统级 P0 增强

## 概述

本实现计划将三个 P0 功能拆分为可执行的编码任务。功能 1（隐私政策页面）和功能 2（HTTP Range 请求支持）为后端 Django 工作，功能 3（Web Markdown 渲染）为前端 React 工作。每个功能独立实现，通过检查点确保增量验证。

后端使用 Python（Django 5.2 + DRF），属性测试使用 Hypothesis。
前端使用 TypeScript（React 18 + Vite + Tailwind CSS），属性测试使用 fast-check。

## 任务

- [x] 1. 实现隐私政策页面（后端）
  - [x] 1.1 创建隐私政策视图函数
    - 新建 `backend/chewy_space/bbtalk/privacy_views.py`
    - 实现 `privacy_policy_view(request)` 函数，返回自包含 HTML 页面（内联 CSS）
    - HTML 页面须包含以下章节：GPS 定位数据、语音录音数据、生物识别数据、数据存储方式、用户权利
    - 页面须在移动端和桌面端均可正常阅读（响应式内联样式）
    - 使用 `django.views.decorators.http.require_GET` 限制仅 GET 方法
    - _需求: 1.1, 1.3, 1.4, 1.5, 1.6_

  - [x] 1.2 注册 URL 路由和 Nginx 配置
    - 在 `backend/chewy_space/chewy_space/urls.py` 中添加 `path('privacy-policy/', privacy_policy_view, name='privacy_policy')`
    - 在 `nginx.conf` 中添加 `/privacy-policy/` 的 `proxy_pass` 规则，位于 `/api/` 之后、前端 SPA 之前
    - 确保端点无需认证即可访问
    - _需求: 1.1, 1.2, 1.7_

  - [ ]* 1.3 编写隐私政策页面单元测试
    - 在 `backend/tests/test_privacy_policy.py` 中编写测试
    - 测试 GET 请求返回 200 + text/html Content-Type
    - 测试未认证请求可正常访问
    - 测试 HTML 包含所有必要章节关键词（GPS、语音、生物识别、数据存储、用户权利）
    - 测试 HTML 包含 `<style>` 标签（自包含样式）
    - _需求: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [x] 2. 检查点 - 隐私政策页面验证
  - 确保所有测试通过，ask the user if questions arise.

- [x] 3. 实现 HTTP Range 请求支持（后端）
  - [x] 3.1 实现 Range 头解析工具函数
    - 在 `backend/chewy_space/bbtalk/attachment_views.py` 中添加 `parse_range_header(range_header: str, file_size: int)` 函数
    - 支持三种格式：`bytes=start-end`、`bytes=start-`、`bytes=-suffix`
    - 合法范围返回 `(start, end)` 元组
    - 格式不合法返回 `None`
    - 范围超出文件大小抛出 `ValueError`
    - 不支持多段 Range（`bytes=0-100,200-300`），返回 `None`
    - _需求: 2.1, 2.5, 2.6_

  - [x] 3.2 重写 AttachmentViewSet 的 preview action
    - 在现有 `AttachmentViewSet` 中添加 `preview` action 方法，重写父类行为
    - 无 Range 头时：保持原有行为，调用父类 `preview` 方法返回 200 + 完整文件
    - 有 Range 头 + 本地存储：解析 Range，读取指定字节范围，返回 206 Partial Content
    - 有 Range 头 + S3 存储：302 重定向到签名 URL（S3 原生支持 Range）
    - 响应头须包含：`Accept-Ranges: bytes`、`Content-Range`、`Content-Type`、`Content-Length`
    - Range 不合法或超出范围：返回 416 Range Not Satisfiable
    - 使用 `@action(detail=True, methods=["get"], url_path="preview")` 装饰器
    - _需求: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9_

  - [ ]* 3.3 编写 Property 1 属性测试：合法 Range 请求返回正确的 206 响应
    - **Property 1: 合法 Range 请求返回正确的 206 响应**
    - **验证: 需求 2.1, 2.2, 2.3, 2.7, 2.8**
    - 在 `backend/tests/test_range_request.py` 中使用 Hypothesis 编写
    - 生成随机文件大小和合法 Range 头，验证 206 响应的 Content-Range、Accept-Ranges、Content-Length、Content-Type 头正确性
    - 验证响应体字节内容与文件对应范围一致

  - [ ]* 3.4 编写 Property 2 属性测试：无 Range 头的请求保持原有行为
    - **Property 2: 无 Range 头的请求保持原有行为**
    - **验证: 需求 2.4, 2.9**
    - 在 `backend/tests/test_range_request.py` 中使用 Hypothesis 编写
    - 生成随机文件，验证无 Range 请求返回 200 + 完整内容

  - [ ]* 3.5 编写 Property 3 属性测试：非法 Range 请求返回 416
    - **Property 3: 非法 Range 请求返回 416**
    - **验证: 需求 2.5, 2.6**
    - 在 `backend/tests/test_range_request.py` 中使用 Hypothesis 编写
    - 生成随机非法 Range 字符串和超出范围的 Range，验证 416 响应

  - [ ]* 3.6 编写 Range 请求边界条件单元测试
    - 在 `backend/tests/test_range_request.py` 中编写
    - 测试 `bytes=0-0`（第一个字节）
    - 测试 `bytes=-1`（最后一个字节）
    - 测试 `bytes=0-`（从头到尾）
    - 测试无 Range 头返回完整文件（200）
    - _需求: 2.1, 2.4, 2.5_

- [x] 4. 检查点 - HTTP Range 请求验证
  - 确保所有测试通过，ask the user if questions arise.

- [x] 5. 实现 Web 前端 Markdown 渲染
  - [x] 5.1 安装前端依赖
    - 在 `frontend/` 目录安装 `react-markdown`、`remark-gfm`、`rehype-sanitize`
    - 安装开发依赖 `fast-check`、`vitest`、`@testing-library/react`、`@testing-library/jest-dom`、`jsdom`
    - 配置 Vitest（如尚未配置，在 `vite.config.ts` 中添加 test 配置）
    - _需求: 3.1-3.14_

  - [x] 5.2 创建 MarkdownRenderer 共享组件
    - 新建 `frontend/src/components/MarkdownRenderer.tsx`
    - 使用 `react-markdown` + `remark-gfm` + `rehype-sanitize` 实现
    - 通过 `components` prop 自定义每个 HTML 元素的 Tailwind CSS 样式
    - 标题（h1-h6）：对应字体大小和粗细
    - 粗体、斜体、行内代码、代码块、引用块、链接、有序/无序列表：匹配现有设计风格
    - 链接添加 `target="_blank"` 和 `rel="noopener noreferrer"` 属性
    - 纯文本保持换行显示
    - 接口：`MarkdownRenderer({ content: string, className?: string })`
    - _需求: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.11, 3.12, 3.13, 3.14_

  - [x] 5.3 在 BBTalkPage、BBTalkDetailPage、BBTalkItem 中集成 MarkdownRenderer
    - 在 `frontend/src/pages/BBTalkPage.tsx` 中将 `<p className="... whitespace-pre-wrap ...">{bbtalk.content}</p>` 替换为 `<MarkdownRenderer content={bbtalk.content} />`
    - 在 `frontend/src/pages/BBTalkDetailPage.tsx` 中做同样替换
    - 在 `frontend/src/components/BBTalkItem.tsx` 中做同样替换
    - 确保替换后样式与现有设计风格一致
    - _需求: 3.10, 3.12_

  - [ ]* 5.4 编写 Property 4 属性测试：Markdown 链接安全属性
    - **Property 4: Markdown 链接安全属性**
    - **验证: 需求 3.13**
    - 在 `frontend/src/components/__tests__/MarkdownRenderer.test.tsx` 中使用 fast-check 编写
    - 生成包含随机链接的 Markdown 字符串，验证所有 `<a>` 元素包含 `target="_blank"` 和 `rel="noopener noreferrer"`

  - [ ]* 5.5 编写 Property 5 属性测试：HTML 标签过滤防 XSS
    - **Property 5: HTML 标签过滤防 XSS**
    - **验证: 需求 3.14**
    - 在 `frontend/src/components/__tests__/MarkdownRenderer.test.tsx` 中使用 fast-check 编写
    - 生成包含随机 HTML/JS 注入的字符串，验证渲染后 DOM 不包含 `<script>` 元素或事件处理器属性

  - [ ]* 5.6 编写 Markdown 渲染单元测试
    - 在 `frontend/src/components/__tests__/MarkdownRenderer.test.tsx` 中编写
    - 测试标题渲染（h1-h6）
    - 测试粗体、斜体、行内代码、代码块、引用块渲染
    - 测试链接渲染及属性
    - 测试有序/无序列表渲染
    - 测试纯文本保持换行
    - _需求: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.11_

- [x] 6. 最终检查点 - 全部功能验证
  - 确保所有测试通过，ask the user if questions arise.

## 说明

- 标记 `*` 的子任务为可选测试任务，可跳过以加速 MVP 交付
- 每个任务引用了具体的需求编号，确保可追溯性
- 检查点确保增量验证，避免问题累积
- 属性测试验证设计文档中定义的 5 个正确性属性
- 单元测试验证具体示例和边界条件
- 后端属性测试使用 Hypothesis，前端属性测试使用 fast-check
