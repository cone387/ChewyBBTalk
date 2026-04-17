import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
  ScrollView, Modal, FlatList, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { login, register } from '../services/auth';
import { getApiBaseUrl, setApiBaseUrl, DEFAULT_URL } from '../config';
import { useTheme } from '../theme/ThemeContext';

const SERVERS_KEY = 'bbtalk_servers';

interface ServerItem { label: string; url: string; }

interface Props { onLoginSuccess: () => void; }

export default function LoginScreen({ onLoginSuccess }: Props) {
  const { theme } = useTheme();
  const c = theme.colors;

  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);

  // 服务器选择
  const [servers, setServers] = useState<ServerItem[]>([{ label: '默认服务', url: DEFAULT_URL }]);
  const [selectedServer, setSelectedServer] = useState<string>(DEFAULT_URL);
  const [showServerPicker, setShowServerPicker] = useState(false);
  const [showAddServer, setShowAddServer] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newUrl, setNewUrl] = useState('');

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem(SERVERS_KEY);
      if (saved) {
        const list: ServerItem[] = JSON.parse(saved);
        if (!list.find(s => s.url === DEFAULT_URL)) list.unshift({ label: '默认服务', url: DEFAULT_URL });
        setServers(list);
      }
      setSelectedServer(getApiBaseUrl());
    })();
  }, []);

  const saveServers = async (list: ServerItem[]) => {
    setServers(list);
    await AsyncStorage.setItem(SERVERS_KEY, JSON.stringify(list));
  };

  const selectServer = async (url: string) => {
    setSelectedServer(url);
    await setApiBaseUrl(url);
    setShowServerPicker(false);
  };

  const addServer = async () => {
    if (!newUrl.trim()) { Alert.alert('提示', '请输入服务地址'); return; }
    const url = newUrl.trim().replace(/\/+$/, '');
    const label = newLabel.trim() || url;
    if (servers.find(s => s.url === url)) { Alert.alert('提示', '该地址已存在'); return; }
    const list = [...servers, { label, url }];
    await saveServers(list);
    await selectServer(url);
    setNewLabel(''); setNewUrl(''); setShowAddServer(false);
  };

  const removeServer = async (url: string) => {
    if (url === DEFAULT_URL) return;
    const list = servers.filter(s => s.url !== url);
    await saveServers(list);
    if (selectedServer === url) await selectServer(DEFAULT_URL);
  };

  const handleSubmit = async () => {
    if (!username || !password) { Alert.alert('提示', '请输入用户名和密码'); return; }
    setLoading(true);
    try {
      const result = isLogin
        ? await login(username, password)
        : await register({ username, password, email: email || undefined, display_name: displayName || undefined });
      if (result.success) onLoginSuccess();
      else Alert.alert(isLogin ? '登录失败' : '注册失败', result.error || '请重试');
    } catch { Alert.alert('错误', '网络错误，请稍后重试'); }
    finally { setLoading(false); }
  };

  const currentLabel = servers.find(s => s.url === selectedServer)?.label || '默认服务';

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: c.surfaceSecondary }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: c.cardBg, borderColor: c.borderLight }]}>
          {/* Logo */}
          <View style={styles.logoWrap}>
            <View style={[styles.logo, { backgroundColor: c.accent }]}><Ionicons name="chatbubbles" size={32} color="#fff" /></View>
            <Text style={[styles.title, { color: c.text }]}>{isLogin ? '欢迎回来' : '创建账户'}</Text>
            <Text style={[styles.subtitle, { color: c.textSecondary }]}>{isLogin ? '登录您的 ChewyBBTalk 账户' : '开始您的碎碎念之旅'}</Text>
          </View>

          {/* 服务器选择下拉 */}
          <Text style={[styles.label, { color: c.text }]}>服务地址</Text>
          <TouchableOpacity style={[styles.serverSelector, { borderColor: c.border, backgroundColor: c.borderLight }]} onPress={() => setShowServerPicker(true)} activeOpacity={0.7}>
            <Ionicons name="server-outline" size={16} color={c.textTertiary} />
            <Text style={[styles.serverText, { color: c.text }]} numberOfLines={1}>{currentLabel}</Text>
            <Ionicons name="chevron-down" size={16} color={c.textTertiary} />
          </TouchableOpacity>

          {/* 用户名 */}
          <Text style={[styles.label, { color: c.text }]}>用户名</Text>
          <View style={[styles.inputWrap, { borderColor: c.border, backgroundColor: c.surface }]}>
            <Ionicons name="person-outline" size={18} color={c.textTertiary} />
            <TextInput style={[styles.input, { color: c.text }]} placeholder="请输入用户名" placeholderTextColor={c.textTertiary}
              value={username} onChangeText={setUsername} autoCapitalize="none" editable={!loading} />
          </View>

          {/* 密码 */}
          <Text style={[styles.label, { color: c.text }]}>密码</Text>
          <View style={[styles.inputWrap, { borderColor: c.border, backgroundColor: c.surface }]}>
            <Ionicons name="lock-closed-outline" size={18} color={c.textTertiary} />
            <TextInput style={[styles.input, { color: c.text }]} placeholder="请输入密码" placeholderTextColor={c.textTertiary}
              value={password} onChangeText={setPassword} secureTextEntry={!showPassword} editable={!loading} />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ padding: 4 }}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={c.textTertiary} />
            </TouchableOpacity>
          </View>

          {!isLogin && (
            <>
              <Text style={[styles.label, { color: c.text }]}>邮箱 <Text style={[styles.optional, { color: c.textTertiary }]}>(可选)</Text></Text>
              <View style={[styles.inputWrap, { borderColor: c.border, backgroundColor: c.surface }]}>
                <Ionicons name="mail-outline" size={18} color={c.textTertiary} />
                <TextInput style={[styles.input, { color: c.text }]} placeholder="请输入邮箱" placeholderTextColor={c.textTertiary}
                  value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" editable={!loading} />
              </View>
              <Text style={[styles.label, { color: c.text }]}>显示名称 <Text style={[styles.optional, { color: c.textTertiary }]}>(可选)</Text></Text>
              <View style={[styles.inputWrap, { borderColor: c.border, backgroundColor: c.surface }]}>
                <Ionicons name="happy-outline" size={18} color={c.textTertiary} />
                <TextInput style={[styles.input, { color: c.text }]} placeholder="请输入显示名称" placeholderTextColor={c.textTertiary}
                  value={displayName} onChangeText={setDisplayName} editable={!loading} />
              </View>
            </>
          )}

          <TouchableOpacity style={[styles.submitBtn, { backgroundColor: c.primary }, loading && { opacity: 0.6 }]} onPress={handleSubmit} disabled={loading} activeOpacity={0.8}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{isLogin ? '登录  →' : '注册  →'}</Text>}
          </TouchableOpacity>

          {!isLogin && (
            <Text style={[styles.privacyText, { color: c.textTertiary }]}>
              注册即表示同意{' '}
              <Text style={[styles.privacyLink, { color: c.primary }]} onPress={() => Linking.openURL(`${getApiBaseUrl()}/privacy-policy/`)}>
                隐私政策
              </Text>
            </Text>
          )}

          <View style={styles.divider}><View style={[styles.dividerLine, { backgroundColor: c.border }]} /><Text style={[styles.dividerText, { color: c.textTertiary }]}>{isLogin ? '新用户？' : '已有账户？'}</Text><View style={[styles.dividerLine, { backgroundColor: c.border }]} /></View>

          <TouchableOpacity style={[styles.switchBtn, { borderColor: c.border }]} onPress={() => setIsLogin(!isLogin)} disabled={loading} activeOpacity={0.7}>
            <Text style={[styles.switchText, { color: c.text }]}>{isLogin ? '创建新账户' : '登录已有账户'}</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.footer, { color: c.textTertiary }]}>ChewyBBTalk - 记录生活的点滴</Text>
      </ScrollView>

      {/* 服务器选择弹窗 */}
      <Modal visible={showServerPicker} transparent animationType="fade" onRequestClose={() => setShowServerPicker(false)}>
        <TouchableOpacity style={[styles.modalOverlay, { backgroundColor: c.overlay }]} activeOpacity={1} onPress={() => { setShowServerPicker(false); setShowAddServer(false); }}>
          <View style={[styles.modalSheet, { backgroundColor: c.surface }]} onStartShouldSetResponder={() => true}>
            <Text style={[styles.modalTitle, { color: c.text }]}>选择服务</Text>

            {servers.map(s => (
              <TouchableOpacity key={s.url} style={[styles.serverItem, selectedServer === s.url && [styles.serverItemActive, { backgroundColor: c.primaryLight }]]}
                onPress={() => selectServer(s.url)}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.serverItemLabel, { color: c.text }, selectedServer === s.url && { color: c.primary, fontWeight: '600' }]}>{s.label}</Text>
                  <Text style={[styles.serverItemUrl, { color: c.textTertiary }]} numberOfLines={1}>{s.url}</Text>
                </View>
                {selectedServer === s.url && <Ionicons name="checkmark-circle" size={20} color={c.primary} />}
                {s.url !== DEFAULT_URL && (
                  <TouchableOpacity onPress={() => removeServer(s.url)} style={{ padding: 6 }} hitSlop={8}>
                    <Ionicons name="close-circle" size={20} color={c.textTertiary} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            ))}

            {showAddServer ? (
              <View style={styles.addServerForm}>
                <TextInput style={[styles.addInput, { borderColor: c.border, color: c.text }]} placeholder="名称（可选）" placeholderTextColor={c.textTertiary}
                  value={newLabel} onChangeText={setNewLabel} />
                <TextInput style={[styles.addInput, { borderColor: c.border, color: c.text }]} placeholder="https://your-server.com" placeholderTextColor={c.textTertiary}
                  value={newUrl} onChangeText={setNewUrl} autoCapitalize="none" keyboardType="url" />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity style={[styles.addBtn, { flex: 1, backgroundColor: c.borderLight }]} onPress={() => setShowAddServer(false)}>
                    <Text style={{ color: c.textSecondary, fontWeight: '500' }}>取消</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.addBtn, { flex: 1, backgroundColor: c.accent }]} onPress={addServer}>
                    <Text style={{ color: '#fff', fontWeight: '600' }}>添加</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={styles.addServerBtn} onPress={() => setShowAddServer(true)}>
                <Ionicons name="add-circle-outline" size={18} color={c.accent} />
                <Text style={[styles.addServerText, { color: c.accent }]}>添加服务地址</Text>
              </TouchableOpacity>
            )}

            <Text style={[styles.modalHint, { color: c.textTertiary }]}>点击叉号可删除自定义服务</Text>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  card: {
    borderRadius: 20, padding: 28,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 16,
    elevation: 5, borderWidth: 1,
  },
  logoWrap: { alignItems: 'center', marginBottom: 24 },
  logo: {
    width: 64, height: 64, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { fontSize: 14, marginTop: 6 },
  label: { fontSize: 14, fontWeight: '500', marginBottom: 6, marginTop: 14 },
  optional: { fontWeight: '400' },
  // 服务器选择
  serverSelector: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, height: 48,
  },
  serverText: { flex: 1, fontSize: 15 },
  // 输入框 - 固定高度 + gap 对齐
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, height: 48,
  },
  input: { flex: 1, fontSize: 16, paddingVertical: 0, includeFontPadding: false, lineHeight: 20 },
  submitBtn: {
    marginTop: 20, borderRadius: 12, height: 50, justifyContent: 'center', alignItems: 'center',
  },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 18 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { marginHorizontal: 12, fontSize: 13 },
  switchBtn: { borderWidth: 1, borderRadius: 12, height: 48, justifyContent: 'center', alignItems: 'center' },
  switchText: { fontSize: 15, fontWeight: '500' },
  footer: { textAlign: 'center', fontSize: 12, marginTop: 20 },
  privacyText: { textAlign: 'center', fontSize: 12, marginTop: 12 },
  privacyLink: { textDecorationLine: 'underline' },
  // 服务器选择弹窗
  modalOverlay: { flex: 1, justifyContent: 'center', padding: 24 },
  modalSheet: { borderRadius: 20, padding: 20 },
  modalTitle: { fontSize: 17, fontWeight: '600', marginBottom: 14 },
  serverItem: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12,
    borderRadius: 10, marginBottom: 4,
  },
  serverItemActive: {},
  serverItemLabel: { fontSize: 15 },
  serverItemUrl: { fontSize: 12, marginTop: 2 },
  addServerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center',
    paddingVertical: 14, marginTop: 4,
  },
  addServerText: { fontSize: 14, fontWeight: '500' },
  addServerForm: { marginTop: 8, gap: 8 },
  addInput: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 12, height: 42, fontSize: 14,
  },
  addBtn: { borderRadius: 10, height: 40, justifyContent: 'center', alignItems: 'center' },
  modalHint: { textAlign: 'center', fontSize: 11, marginTop: 12 },
});
