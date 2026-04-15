# 需求文档：系统级 P0 增强

## 简介

本文档定义 ChewyBBTalk 系统三个 P0 级别功能的需求：隐私政策页面（后端）、HTTP Range 请求支持（后端）、Web 前端 Markdown 渲染。这三个功能分别解决 App Store 审核合规、iOS 原生音频流式播放、以及 Web 端内容展示一致性问题。

## 术语表

- **Backend**：ChewyBBTalk 后端服务，基于 Django 5.2 + Django REST Framework，部署在 Nginx 反向代理后面
- **Privacy_Policy_Endpoint**：后端提供的隐私政策页面端点，路径为 `/privacy-policy/`
- **Attachment_Preview_Endpoint**：后端附件预览端点，路径为 `/api/v1/attachments/files/{uid}/preview/`，由 chewy-attachment 库提供基础实现
- **Range_Request**：HTTP/1.1 协议中的范围请求机制（RFC 7233），允许客户端请求资源的部分内容，通过 `Range` 请求头和 `206 Partial Content` 响应实现
- **AVPlayer**：iOS 原生音频/视频播放器，要求服务端支持 HTTP Range 请求才能进行流式播放
- **AudioPlayerButton**：Mobile 端音频播放组件，当前通过先下载到本地缓存再播放的方式绕过 Range 请求限制
- **Web_Frontend**：ChewyBBTalk Web 前端应用，基于 React 18 + TypeScript + Vite + Tailwind CSS
- **Markdown_Renderer**：Web 前端中负责将 Markdown 格式文本渲染为 HTML 的组件
- **BBTalk_Content**：碎碎念内容，后端以 Markdown 格式存储，当前 Web 端以纯文本 `whitespace-pre-wrap` 方式显示
- **Mobile_App**：ChewyBBTalk 移动端应用，基于 Expo SDK 54 + React Native，已使用 react-native-markdown-display 渲染 Markdown

## 需求

### 需求 1：隐私政策页面（后端）

**用户故事：** 作为应用运营者，我希望后端提供一个可公开访问的隐私政策页面，以便通过 App Store 审核并满足合规要求。

#### 验收标准

1. WHEN 用户访问 `/privacy-policy/` 路径时，THE Backend SHALL 返回一个包含完整隐私政策内容的 HTML 页面，HTTP 状态码为 200
2. THE Privacy_Policy_Endpoint SHALL 允许未认证用户访问，无需任何登录或 Token 验证
3. THE Privacy_Policy_Endpoint SHALL 在 HTML 页面中包含以下数据收集说明章节：GPS 定位数据、语音录音数据、生物识别数据（用于设备本地认证）
4. THE Privacy_Policy_Endpoint SHALL 在 HTML 页面中包含数据存储方式说明章节，描述数据存储位置和加密措施
5. THE Privacy_Policy_Endpoint SHALL 在 HTML 页面中包含用户权利说明章节，描述用户查看、导出和删除个人数据的权利
6. THE Privacy_Policy_Endpoint SHALL 返回一个自包含的 HTML 页面，包含内联 CSS 样式，在移动端和桌面端均可正常阅读
7. WHEN Nginx 将请求代理到 Backend 时，THE Backend SHALL 通过 Django URL 路由直接处理 `/privacy-policy/` 请求，无需额外的 Nginx 配置

### 需求 2：HTTP Range 请求支持（后端）

**用户故事：** 作为 Mobile_App 用户，我希望后端附件预览端点支持 HTTP Range 请求，以便 iOS AVPlayer 可以直接流式播放音频文件而无需先完整下载。

#### 验收标准

1. WHEN 客户端发送包含 `Range` 请求头的 HTTP 请求到 Attachment_Preview_Endpoint 时，THE Backend SHALL 返回 HTTP 206 Partial Content 响应，响应体仅包含请求范围内的字节数据
2. WHEN 客户端发送包含 `Range` 请求头的请求时，THE Backend SHALL 在响应中包含 `Content-Range` 头，格式为 `bytes {start}-{end}/{total}`
3. WHEN 客户端发送包含 `Range` 请求头的请求时，THE Backend SHALL 在响应中包含 `Accept-Ranges: bytes` 头
4. WHEN 客户端发送不包含 `Range` 请求头的普通请求到 Attachment_Preview_Endpoint 时，THE Backend SHALL 保持现有行为不变，返回完整文件内容和 HTTP 200 状态码
5. WHEN 客户端发送的 `Range` 请求头格式不合法时，THE Backend SHALL 返回 HTTP 416 Range Not Satisfiable 响应
6. WHEN 客户端发送的 `Range` 请求头中的范围超出文件大小时，THE Backend SHALL 返回 HTTP 416 Range Not Satisfiable 响应，并在 `Content-Range` 头中包含文件总大小
7. THE Backend SHALL 在 Range 响应中包含正确的 `Content-Type` 头，与文件的 MIME 类型一致
8. THE Backend SHALL 在 Range 响应中包含 `Content-Length` 头，值为实际返回的字节数（非文件总大小）
9. WHILE AudioPlayerButton 使用下载到本地缓存再播放的方式时，THE Backend 的 Range 请求支持 SHALL 不影响该现有功能的正常运行

### 需求 3：Web 前端 Markdown 渲染

**用户故事：** 作为 Web_Frontend 用户，我希望碎碎念内容以 Markdown 格式渲染显示，以便获得与 Mobile_App 一致的富文本阅读体验。

#### 验收标准

1. WHEN BBTalk_Content 包含 Markdown 标题语法（`#` 到 `######`）时，THE Markdown_Renderer SHALL 将其渲染为对应级别的 HTML 标题元素
2. WHEN BBTalk_Content 包含 Markdown 粗体语法（`**text**`）时，THE Markdown_Renderer SHALL 将其渲染为粗体文本
3. WHEN BBTalk_Content 包含 Markdown 斜体语法（`*text*`）时，THE Markdown_Renderer SHALL 将其渲染为斜体文本
4. WHEN BBTalk_Content 包含 Markdown 行内代码语法（`` `code` ``）时，THE Markdown_Renderer SHALL 将其渲染为行内代码样式
5. WHEN BBTalk_Content 包含 Markdown 代码块语法（三个反引号包裹）时，THE Markdown_Renderer SHALL 将其渲染为代码块样式，保留代码格式和缩进
6. WHEN BBTalk_Content 包含 Markdown 引用语法（`>` 开头）时，THE Markdown_Renderer SHALL 将其渲染为引用块样式
7. WHEN BBTalk_Content 包含 Markdown 链接语法（`[text](url)`）时，THE Markdown_Renderer SHALL 将其渲染为可点击的超链接
8. WHEN BBTalk_Content 包含 Markdown 无序列表语法（`-` 或 `*` 开头）时，THE Markdown_Renderer SHALL 将其渲染为无序列表
9. WHEN BBTalk_Content 包含 Markdown 有序列表语法（`1.` 开头）时，THE Markdown_Renderer SHALL 将其渲染为有序列表
10. THE Markdown_Renderer SHALL 在 BBTalkPage 列表页、BBTalkDetailPage 详情页和 BBTalkItem 组件中统一应用 Markdown 渲染
11. WHEN BBTalk_Content 包含纯文本（无 Markdown 语法）时，THE Markdown_Renderer SHALL 正常显示文本内容，保持换行和空格
12. THE Markdown_Renderer 的渲染样式 SHALL 与现有 Tailwind CSS 设计风格保持一致，包括字体大小、颜色和间距
13. WHEN Markdown 链接被渲染时，THE Markdown_Renderer SHALL 为链接添加 `target="_blank"` 和 `rel="noopener noreferrer"` 属性，确保在新标签页中安全打开
14. WHEN BBTalk_Content 包含用户输入的原始 HTML 标签时，THE Markdown_Renderer SHALL 对 HTML 标签进行转义或过滤，防止 XSS 攻击
