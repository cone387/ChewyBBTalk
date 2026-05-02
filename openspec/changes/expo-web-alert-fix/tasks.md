## 1. 创建跨平台工具函数

- [ ] 1.1 创建 `mobile/src/utils/crossAlert.ts`，实现 `xAlert`、`xConfirm`、`xActionSheet` 三个函数

## 2. 替换 hooks 中的 Alert.alert

- [ ] 2.1 替换 `useBBTalkActions.ts` 中的 showMenu（ActionSheetIOS + Alert.alert → xActionSheet）
- [ ] 2.2 替换 `useBBTalkActions.ts` 中的 toggleVisibility（Alert.alert → xConfirm）

## 3. 替换 screens 中的 Alert.alert

- [ ] 3.1 替换 `HomeScreen.tsx` 中 showError 回调的 Alert.alert → xConfirm/xAlert
- [ ] 3.2 替换 `ComposeScreen.tsx` 中所有 Alert.alert（放弃编辑确认、上传失败、定位权限、提交失败等）
- [ ] 3.3 替换 `SettingsScreen.tsx` 中退出登录确认
- [ ] 3.4 替换 `LoginScreen.tsx` 中登录/注册错误提示
- [ ] 3.5 替换 `AccountSecurityScreen.tsx` 中删除账号确认，移除已有的 Platform.OS === 'web' workaround
- [ ] 3.6 替换 `StorageSettingsScreen.tsx` 中所有 Alert.alert（激活、切换、测试、删除、创建等）
- [ ] 3.7 替换 `TagManagementScreen.tsx` 中标签保存/删除确认
- [ ] 3.8 替换 `CacheManagementScreen.tsx` 中清理缓存确认
- [ ] 3.9 替换 `ProfileEditScreen.tsx` 中头像上传/保存/失败提示
- [ ] 3.10 替换 `AboutScreen.tsx` 中版本检查提示

## 4. 替换 components 中的 Alert.alert

- [ ] 4.1 替换 `CommentInputModal.tsx` 中发送失败提示
- [ ] 4.2 替换 `BBTalkCard.tsx` 中文件打开失败提示
- [ ] 4.3 替换 `InlineComments.tsx` 中删除评论确认
- [ ] 4.4 替换 `VoiceRecordingOverlay.tsx` 中录音权限/失败提示

## 5. 替换 services/utils 中的 Alert.alert

- [ ] 5.1 替换 `shareService.ts` 中分享/复制提示
- [ ] 5.2 替换 `versionChecker.ts` 中版本更新提示
