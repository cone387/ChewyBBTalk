import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
  ScrollView, Modal, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { login, register } from '../services/auth';
import { getApiBaseUrl, setApiBaseUrl, DEFAULT_URL } from '../config';

const SERVERS_KEY = 'bbtalk_servers';

interface ServerItem { label: string; url: string; }

interface Props { onLoginSuccess: () => void; }

export default function LoginScreen({ onLoginSuccess }: Props) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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

  const removeServer = (url: string) => {
    if (url === DEFAULT_URL) return;
    Alert.alert('删除服务', '确定删除此服务地址？', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => {
        const list = servers.filter(s => s.url !== url);
        await saveServers(list);
        if (selectedServer === url) await selectServer(DEFAULT_URL);
      }},
    ]);
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
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          {/* Logo */}
          <View style={styles.logoWrap}>
            <View style={styles.logo}><Ionicons name="chatbubbles" size={32} color="#fff" /></View>
            <Text style={styles.title}>{isLogin ? '欢迎回来' : '创建账户'}</Text>
            <Text style={styles.subtitle}>{isLogin ? '登录您的 ChewyBBTalk 账户' : '开始您的碎碎念之旅'}</Text>
          </View>

          {/* 服务器选择下拉 */}
          <Text style={styles.label}>服务地址</Text>
          <TouchableOpacity style={styles.serverSelector} onPress={() => setShowServerPicker(true)} activeOpacity={0.7}>
            <Ionicons name="server-outline" size={16} color="#9CA3AF" />
            <Text style={styles.serverText} numberOfLines={1}>{currentLabel}</Text>
            <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
          </TouchableOpacity>

          {/* 用户名 */}
          <Text style={styles.label}>用户名</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="person-outline" size={18} color="#9CA3AF" />
            <TextInput style={styles.input} placeholder="请输入用户名" placeholderTextColor="#C4C4C4"
              value={username} onChangeText={setUsername} autoCapitalize="none" editable={!loading} />
          </View>

          {/* 密码 */}
          <Text style={styles.label}>密码</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="lock-closed-outline" size={18} color="#9CA3AF" />
            <TextInput style={styles.input} placeholder="请输入密码" placeholderTextColor="#C4C4C4"
              value={password} onChangeText={setPassword} secureTextEntry editable={!loading} />
          </View>

          {!isLogin && (
            <>
              <Text style={styles.label}>邮箱 <Text style={styles.optional}>(可选)</Text></Text>
              <View style={styles.inputWrap}>
                <Ionicons name="mail-outline" size={18} color="#9CA3AF" />
                <TextInput style={styles.input} placeholder="请输入邮箱" placeholderTextColor="#C4C4C4"
                  value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" editable={!loading} />
              </View>
              <Text style={styles.label}>显示名称 <Text style={styles.optional}>(可选)</Text></Text>
              <View style={styles.inputWrap}>
                <Ionicons name="happy-outline" size={18} color="#9CA3AF" />
                <TextInput style={styles.input} placeholder="请输入显示名称" placeholderTextColor="#C4C4C4"
                  value={displayName} onChangeText={setDisplayName} editable={!loading} />
              </View>
            </>
          )}

          <TouchableOpacity style={[styles.submitBtn, loading && { opacity: 0.6 }]} onPress={handleSubmit} disabled={loading} activeOpacity={0.8}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{isLogin ? '登录  →' : '注册  →'}</Text>}
          </TouchableOpacity>

          <View style={styles.divider}><View style={styles.dividerLine} /><Text style={styles.dividerText}>{isLogin ? '新用户？' : '已有账户？'}</Text><View style={styles.dividerLine} /></View>

          <TouchableOpacity style={styles.switchBtn} onPress={() => setIsLogin(!isLogin)} disabled={loading} activeOpacity={0.7}>
            <Text style={styles.switchText}>{isLogin ? '创建新账户' : '登录已有账户'}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.footer}>ChewyBBTalk - 记录生活的点滴</Text>
      </ScrollView>

      {/* 服务器选择弹窗 */}
      <Modal visible={showServerPicker} transparent animationType="fade" onRequestClose={() => setShowServerPicker(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => { setShowServerPicker(false); setShowAddServer(false); }}>
          <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>选择服务</Text>

            {servers.map(s => (
              <TouchableOpacity key={s.url} style={[styles.serverItem, selectedServer === s.url && styles.serverItemActive]}
                onPress={() => selectServer(s.url)} onLongPress={() => removeServer(s.url)}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.serverItemLabel, selectedServer === s.url && { color: '#2563EB', fontWeight: '600' }]}>{s.label}</Text>
                  <Text style={styles.serverItemUrl} numberOfLines={1}>{s.url}</Text>
                </View>
                {selectedServer === s.url && <Ionicons name="checkmark-circle" size={20} color="#2563EB" />}
              </TouchableOpacity>
            ))}

            {showAddServer ? (
              <View style={styles.addServerForm}>
                <TextInput style={styles.addInput} placeholder="名称（可选）" placeholderTextColor="#C4C4C4"
                  value={newLabel} onChangeText={setNewLabel} />
                <TextInput style={styles.addInput} placeholder="https://your-server.com" placeholderTextColor="#C4C4C4"
                  value={newUrl} onChangeText={setNewUrl} autoCapitalize="none" keyboardType="url" />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity style={[styles.addBtn, { flex: 1, backgroundColor: '#F3F4F6' }]} onPress={() => setShowAddServer(false)}>
                    <Text style={{ color: '#6B7280', fontWeight: '500' }}>取消</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.addBtn, { flex: 1 }]} onPress={addServer}>
                    <Text style={{ color: '#fff', fontWeight: '600' }}>添加</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={styles.addServerBtn} onPress={() => setShowAddServer(true)}>
                <Ionicons name="add-circle-outline" size={18} color="#7C3AED" />
                <Text style={styles.addServerText}>添加服务地址</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.modalHint}>长按可删除自定义服务</Text>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#EEF2FF' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  card: {
    backgroundColor: '#fff', borderRadius: 20, padding: 28,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 16,
    elevation: 5, borderWidth: 1, borderColor: '#F3F4F6',
  },
  logoWrap: { alignItems: 'center', marginBottom: 24 },
  logo: {
    width: 64, height: 64, borderRadius: 16, backgroundColor: '#7C3AED',
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  title: { fontSize: 24, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 14, color: '#6B7280', marginTop: 6 },
  label: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 6, marginTop: 14 },
  optional: { color: '#9CA3AF', fontWeight: '400' },
  // 服务器选择
  serverSelector: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12,
    paddingHorizontal: 14, height: 48, backgroundColor: '#FAFAFA',
  },
  serverText: { flex: 1, fontSize: 15, color: '#374151' },
  // 输入框 - 固定高度 + gap 对齐
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12,
    paddingHorizontal: 14, height: 48, backgroundColor: '#fff',
  },
  input: { flex: 1, fontSize: 16, color: '#111827', paddingVertical: 0 },
  submitBtn: {
    marginTop: 20, borderRadius: 12, height: 50, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#2563EB',
  },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 18 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  dividerText: { marginHorizontal: 12, fontSize: 13, color: '#9CA3AF' },
  switchBtn: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, height: 48, justifyContent: 'center', alignItems: 'center' },
  switchText: { color: '#374151', fontSize: 15, fontWeight: '500' },
  footer: { textAlign: 'center', color: '#C4C4C4', fontSize: 12, marginTop: 20 },
  // 服务器选择弹窗
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 24 },
  modalSheet: { backgroundColor: '#fff', borderRadius: 20, padding: 20 },
  modalTitle: { fontSize: 17, fontWeight: '600', color: '#111827', marginBottom: 14 },
  serverItem: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12,
    borderRadius: 10, marginBottom: 4,
  },
  serverItemActive: { backgroundColor: '#EFF6FF' },
  serverItemLabel: { fontSize: 15, color: '#374151' },
  serverItemUrl: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  addServerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center',
    paddingVertical: 14, marginTop: 4,
  },
  addServerText: { fontSize: 14, color: '#7C3AED', fontWeight: '500' },
  addServerForm: { marginTop: 8, gap: 8 },
  addInput: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10,
    paddingHorizontal: 12, height: 42, fontSize: 14, color: '#111827',
  },
  addBtn: { backgroundColor: '#7C3AED', borderRadius: 10, height: 40, justifyContent: 'center', alignItems: 'center' },
  modalHint: { textAlign: 'center', fontSize: 11, color: '#D1D5DB', marginTop: 12 },
});
