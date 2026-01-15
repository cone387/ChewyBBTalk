/**
 * 公开 BBTalk 页面
 * 
 * - 显示公开的 BBTalk 列表
 * - 不显示编辑框，显示登录提示
 * - 不显示管理按钮（编辑/删除）
 * - UI 布局与主页一致
 */
import BBTalkPage from './BBTalkPage'

export default function PublicBBTalkPage() {
  return <BBTalkPage isPublic={true} />
}
