import { useState } from 'react';
import SettingsLayout from '../components/layout/SettingsLayout';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Textarea from '../components/ui/Textarea';
import { apiClient } from '../services/api/apiClient';
import { getCurrentUser, logout, updateCachedUser, type UserInfo } from '../services/auth';

export default function AccountSettingsPage() {
  const user = getCurrentUser();
  const [profile, setProfile] = useState({ display_name: user?.display_name || '', email: user?.email || '', bio: user?.bio || '' });
  const [password, setPassword] = useState({ old: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [feedbackArea, setFeedbackArea] = useState<'profile' | 'password'>('profile');
  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault(); setFeedbackArea('profile'); setBusy(true); setError(''); setMessage('');
    try {
      const updated = await apiClient.patch<UserInfo>('/api/v1/bbtalk/user/me', profile);
      updateCachedUser(updated); setMessage('账户资料已保存');
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败，请重试'); }
    finally { setBusy(false); }
  };
  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault(); setFeedbackArea('password'); setError(''); setMessage('');
    if (password.next !== password.confirm) {
      setConfirmError('两次输入的新密码不一致');
      document.getElementById('account-password-confirm')?.focus();
      return;
    }
    setConfirmError('');
    setBusy(true);
    try {
      await apiClient.post('/api/v1/bbtalk/user/change-password', { old_password: password.old, new_password: password.next });
      setPassword({ old: '', next: '', confirm: '' });
      await logout();
    } catch (e) { setError(e instanceof Error ? e.message : '修改失败，请重试'); }
    finally { setBusy(false); }
  };
  return <SettingsLayout title="账户设置" description="更新个人资料和登录密码。" active="/settings" backLabel="返回设置">
    <div className="grid items-start gap-6 lg:grid-cols-2">
    <form onSubmit={saveProfile} className="settings-panel space-y-5 p-5 sm:p-6">
      <h2 className="text-lg font-semibold">个人资料</h2>
      <p className="text-sm text-gray-500">登录用户名：{user?.username}</p>
      <Input label="显示名称" value={profile.display_name} maxLength={150} onChange={e => setProfile({ ...profile, display_name: e.target.value })} autoComplete="nickname" />
      <Input label="邮箱" type="email" value={profile.email} maxLength={254} onChange={e => setProfile({ ...profile, email: e.target.value })} autoComplete="email" />
      <Textarea label="简介" rows={3} value={profile.bio} onChange={e => setProfile({ ...profile, bio: e.target.value })} />
      {feedbackArea === 'profile' && error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-700">{error}</p>}
      {feedbackArea === 'profile' && message && <p role="status" className="rounded-lg bg-green-50 p-4 text-green-800">{message}</p>}
      <Button type="submit" disabled={busy}>保存资料</Button>
    </form>
    <form onSubmit={savePassword} className="settings-panel space-y-5 p-5 sm:p-6">
      <h2 className="text-lg font-semibold">修改密码</h2>
      <p className="text-sm text-gray-500">新密码为 8–128 个字符。修改成功后会退出登录，请使用新密码重新登录。</p>
      <Input label="当前密码" type="password" required autoComplete="current-password" value={password.old} onChange={e => setPassword({ ...password, old: e.target.value })} />
      <Input label="新密码" type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={password.next} onChange={e => { setPassword({ ...password, next: e.target.value }); setConfirmError(''); }} />
      <Input id="account-password-confirm" label="确认新密码" error={confirmError} type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={password.confirm} onChange={e => { setPassword({ ...password, confirm: e.target.value }); setConfirmError(''); }} />
      {feedbackArea === 'password' && error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-700">{error}</p>}
      <Button type="submit" disabled={busy}>修改密码并退出登录</Button>
    </form>
    </div>
  </SettingsLayout>;
}
