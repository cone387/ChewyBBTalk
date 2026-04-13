# Implementation Plan: ChewyBBTalk Mobile 下一阶段

## 概述

本实现计划覆盖 P0 上架准备（需求 1-5）和 P1 体验优化（需求 6-10）共 10 项需求。P0 主要是配置和资料工作，P1 是前端功能开发。任务按依赖关系排序，确保每一步都在前一步基础上递增构建。

技术栈：Expo SDK 54 + React Native + TypeScript + Redux Toolkit

## Tasks

- [x] 1. P0 上架准备 — EAS Build 与应用配置
  - [x] 1.1 创建 `mobile/eas.json` 配置文件
    - 定义 development、preview、production 三个构建 profile
    - production profile 启用 autoIncrement
    - 配置 submit 部分的 iOS 提交信息（appleId、ascAppId、appleTeamId 使用占位符）
    - _Requirements: 1.1, 1.2, 1.4_

  - [x] 1.2 更新 `mobile/app.json` 添加 iOS 构建配置
    - 添加 `ios.bundleIdentifier`（`com.chewy.bbtalk`）
    - 添加 `ios.buildNumber`
    - 更新 `name` 为正式应用名 "ChewyBBTalk"
    - 确认 `version` 字段正确
    - _Requirements: 1.3, 2.3_

  - [x] 1.3 更新 `mobile/src/config.ts` 支持生产环境 API 地址
    - 使用 `__DEV__` 区分开发和生产环境
    - 生产环境默认使用 HTTPS 地址
    - 保留自定义服务器地址功能不变
    - _Requirements: 5.1, 5.2, 5.4_

  - [x] 1.4 增强 `mobile/src/services/api/apiClient.ts` 网络错误处理
    - 在 `request` 方法中捕获 `fetch` 异常，抛出友好的网络错误提示
    - 区分网络不可达和服务端错误
    - _Requirements: 5.3_

- [x] 2. P0 上架准备 — 隐私政策集成
  - [x] 2.1 在 `SettingsScreen.tsx` 添加隐私政策菜单项
    - 在菜单列表中添加"隐私政策"项（图标 shield-checkmark）
    - 点击使用 `Linking.openURL()` 打开隐私政策 URL
    - _Requirements: 3.1, 3.3_

  - [x] 2.2 在 `LoginScreen.tsx` 添加隐私政策链接
    - 在注册表单底部添加隐私政策链接文案
    - _Requirements: 3.4_

- [x] 3. Checkpoint — P0 配置验证
  - Ensure all tests pass, ask the user if questions arise.
  - 验证 eas.json 结构正确、app.json 包含 bundleIdentifier、config.ts 区分环境、apiClient 网络错误处理正常

- [x] 4. P1 体验优化 — 骨架屏与加载态
  - [x] 4.1 创建 `mobile/src/components/SkeletonCard.tsx` 骨架屏组件
    - 使用 `Animated` API 实现脉冲闪烁动画
    - 布局模拟 BBTalk 卡片结构（头像区、文字行、附件区占位）
    - 从 `theme.colors` 取色，适配所有主题
    - _Requirements: 6.1, 6.2, 6.4_

  - [x] 4.2 在 `HomeScreen.tsx` 集成骨架屏
    - 首次加载时（列表为空且 isLoading）显示 4 张骨架卡片
    - 使用 `LayoutAnimation` 实现数据加载完成后的平滑过渡
    - _Requirements: 6.1, 6.3_


- [x] 5. P1 体验优化 — 编辑退出确认
  - [x] 5.1 在 `ComposeScreen.tsx` 实现未保存修改检测与退出确认
    - 实现 `hasUnsavedChanges` 函数，比较内容文本、可见性和附件列表
    - 使用 `navigation.addListener('beforeRemove')` 拦截返回操作
    - 显示 Alert 确认对话框（"放弃" / "继续编辑"）
    - 发布成功后通过 `publishedRef` 跳过确认
    - 编辑模式下内容未变时直接返回
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ]* 5.2 编写 `hasUnsavedChanges` 属性测试
    - **Property 1: 未保存修改检测的正确性**
    - 使用 fast-check 随机生成编辑场景，验证 `hasUnsavedChanges` 在内容相同时返回 false，任一字段不同时返回 true
    - **Validates: Requirements 7.1, 7.4**

- [x] 6. P1 体验优化 — 删除撤销
  - [x] 6.1 在 `bbtalkSlice.ts` 添加乐观删除和撤销 reducer
    - 新增 `optimisticDelete` reducer：从列表移除指定 BBTalk，totalCount 减 1
    - 新增 `undoDelete` reducer：将 BBTalk 恢复到原位置，totalCount 加 1
    - 导出新的 actions
    - _Requirements: 8.1, 8.3_

  - [ ]* 6.2 编写 `optimisticDelete` 属性测试
    - **Property 2: 乐观删除的列表不变量**
    - 使用 fast-check 随机生成 BBTalk 列表，验证删除后列表长度减 1、目标项不存在、其余项顺序不变
    - **Validates: Requirements 8.1**

  - [ ]* 6.3 编写删除-撤销往返恢复属性测试
    - **Property 3: 删除-撤销往返恢复**
    - 使用 fast-check 验证 optimisticDelete + undoDelete 后列表恢复到完全相同的状态
    - **Validates: Requirements 8.3**

  - [x] 6.4 创建 `mobile/src/components/UndoToast.tsx` 撤销提示组件
    - 使用 `Animated` 实现从底部滑入/滑出动画
    - 显示"已删除"文案和"撤销"按钮
    - 3 秒后自动消失，支持 `onUndo` 和 `onDismiss` 回调
    - 适配主题配色
    - _Requirements: 8.2_

  - [x] 6.5 在 `HomeScreen.tsx` 集成删除撤销流程
    - 删除时调用 `optimisticDelete` 立即移除列表项，显示 UndoToast
    - 3 秒内点击撤销：清除定时器，调用 `undoDelete` 恢复
    - 3 秒后自动发送 API 删除请求
    - API 删除失败时自动恢复列表项并显示错误提示
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 7. Checkpoint — 核心功能验证
  - Ensure all tests pass, ask the user if questions arise.
  - 验证骨架屏显示正常、编辑退出确认逻辑正确、删除撤销流程完整

- [x] 8. P1 体验优化 — 图片全屏优化
  - [x] 8.1 创建 `mobile/src/components/ImageViewer.tsx` 图片查看器组件
    - 使用 `PanResponder` + `Animated` 实现手势交互
    - 支持双指捏合缩放（pinch-to-zoom）
    - 支持双击缩放/还原
    - 缩放状态下支持单指拖动平移
    - 未缩放状态下向下滑动关闭
    - 使用 expo-image 的 `contentFit="contain"` 显示图片
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 8.2 在 `HomeScreen.tsx` 替换现有图片预览为 ImageViewer
    - 替换现有 Modal 中的 ScrollView + Image 方案
    - 集成 ImageViewer 组件，传入图片 URL 和关闭回调
    - _Requirements: 9.1_

- [x] 9. P1 体验优化 — 下拉刷新动画
  - [x] 9.1 在 `HomeScreen.tsx` 自定义 RefreshControl 主题色
    - 设置 `tintColor` 为 `theme.colors.primary`（iOS）
    - 设置 `colors` 为 `[theme.colors.primary]`（Android）
    - 设置 `progressBackgroundColor` 为 `theme.colors.surface`（Android）
    - _Requirements: 10.1, 10.2, 10.3_

- [x] 10. Final Checkpoint — 全部功能验证
  - Ensure all tests pass, ask the user if questions arise.
  - 验证所有 P0 配置正确、所有 P1 功能正常工作、主题适配一致

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- 需求 4（App Store 上架资料）为纯资料准备工作，不涉及代码，不包含在任务列表中
- 需求 2（品牌资源）为纯资源替换工作，已在任务 1.2 中覆盖 app.json 配置部分，图标/启动屏图片需手动替换
- 属性测试使用 fast-check 库，需先安装：`npm install --save-dev fast-check`
- 每个属性测试标注格式：**Feature: mobile-next-phase, Property {number}: {property_text}**
