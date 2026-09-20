import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, TextInput, TouchableOpacity, ActivityIndicator, Linking, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { getApiBaseUrl } from '../config';
import { publicAuthRequest } from '../services/passwordRecovery';

export default function PasswordRecoveryScreen() {
  const { theme: { colors: c } } = useTheme();
  const navigation = useNavigation<any>();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [username, setUsername] = useState(''); const [email, setEmail] = useState('');
  const [code, setCode] = useState(''); const [password, setPassword] = useState('');
  const [stage, setStage] = useState<'request' | 'confirm' | 'done'>('request');
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const loadPolicy = () => { setFailed(false); publicAuthRequest('policy').then(p => setEnabled(!!p.password_recovery_enabled)).catch(() => setFailed(true)); };
  useEffect(loadPolicy, []);
  const submit = async () => {
    if (busy) return;
    if (!username.trim() || (stage === 'request' ? !email.trim() : !code.trim() || password.length < 8)) { setMessage('请填写完整信息，新密码至少 8 位。'); return; }
    setBusy(true); setMessage('');
    try {
      const result = await publicAuthRequest(`password/${stage}`, stage === 'request' ? { username: username.trim(), email: email.trim() } : { username: username.trim(), code: code.trim(), new_password: password });
      setMessage(result.message);
      setStage(stage === 'request' ? 'confirm' : 'done');
      setPassword(''); setCode('');
    } catch (error: any) { setMessage(error.message || '请求失败，请重试'); }
    finally { setBusy(false); }
  };
  const input = { minHeight: 48, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 14, color: c.text, backgroundColor: c.surface, marginTop: 8, marginBottom: 18, fontSize: 16 };
  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, maxWidth: 520, width: '100%', alignSelf: 'center' }}>
      <Text style={{ color: c.text, fontSize: 24, fontWeight: '700', marginBottom: 12 }}>找回你的记录</Text>
      <Text style={{ color: c.textSecondary, lineHeight: 22, marginBottom: 24 }}>使用账号中保存的邮箱重置密码。恢复码仅可使用一次，15 分钟内有效。</Text>
      {failed ? <TouchableOpacity onPress={loadPolicy} style={{ minHeight: 44 }}><Text style={{ color: c.primary }}>无法连接服务，点击重试</Text></TouchableOpacity> : enabled === null ? <ActivityIndicator color={c.primary} /> : enabled === false ? <Text style={{ color: c.text, lineHeight: 24 }}>当前服务暂未启用邮件找回。如果未绑定邮箱，或无法使用原邮箱，请联系服务提供方核实账号。</Text> : stage === 'done' ? <TouchableOpacity onPress={() => navigation.goBack()} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={{ color: c.primary }}>返回登录</Text></TouchableOpacity> : <>
        <Text style={{ color: c.text }}>用户名</Text><TextInput accessibilityLabel="用户名" value={username} onChangeText={setUsername} style={input} editable={!busy && stage === 'request'} autoCapitalize="none" autoCorrect={false} />
        {stage === 'request' ? <><Text style={{ color: c.text }}>账号邮箱</Text><TextInput accessibilityLabel="账号邮箱" value={email} onChangeText={setEmail} style={input} editable={!busy} autoCapitalize="none" keyboardType="email-address" /></> : <>
          <Text style={{ color: c.text }}>邮件中的恢复码</Text><TextInput accessibilityLabel="恢复码" value={code} onChangeText={setCode} style={input} editable={!busy} autoCapitalize="none" autoCorrect={false} />
          <Text style={{ color: c.text }}>新密码（至少 8 位）</Text><TextInput accessibilityLabel="新密码" value={password} onChangeText={setPassword} style={input} editable={!busy} secureTextEntry autoCapitalize="none" textContentType="newPassword" />
        </>}
        <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={submit} style={{ minHeight: 48, backgroundColor: c.primary, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '600' }}>{stage === 'request' ? '获取恢复邮件' : '重置密码'}</Text>}</TouchableOpacity>
        <TouchableOpacity disabled={busy} onPress={() => { setStage(stage === 'request' ? 'confirm' : 'request'); setMessage(''); }} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={{ color: c.primary }}>{stage === 'request' ? '已有恢复码' : '重新申请或修改邮箱'}</Text></TouchableOpacity>
      </>}
      {!!message && <Text accessibilityLiveRegion="polite" style={{ color: c.text, lineHeight: 22, marginVertical: 16 }}>{message}</Text>}
      <TouchableOpacity onPress={() => Linking.openURL(`${getApiBaseUrl()}/support/`).catch(() => setMessage('无法打开帮助页面，请稍后重试'))} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: c.primary }}>联系服务提供方</Text></TouchableOpacity>
    </ScrollView>
  </KeyboardAvoidingView>;
}
