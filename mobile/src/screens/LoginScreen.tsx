import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
  ScrollView,
} from 'react-native';
import { login, register } from '../services/auth';

interface Props {
  onLoginSuccess: () => void;
}

export default function LoginScreen({ onLoginSuccess }: Props) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!username || !password) {
      Alert.alert('提示', '请输入用户名和密码');
      return;
    }
    setLoading(true);
    try {
      const result = isLogin
        ? await login(username, password)
        : await register({ username, password, email: email || undefined, display_name: displayName || undefined });
      if (result.success) {
        onLoginSuccess();
      } else {
        Alert.alert(isLogin ? '登录失败' : '注册失败', result.error || '请重试');
      }
    } catch {
      Alert.alert('错误', '网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          {/* Logo */}
          <View style={styles.logoWrap}>
            <View style={styles.logo}>
              <Text style={styles.logoEmoji}>💬</Text>
            </View>
            <Text style={styles.title}>{isLogin ? '欢迎回来' : '创建账户'}</Text>
            <Text style={styles.subtitle}>
              {isLogin ? '登录您的 ChewyBBTalk 账户' : '开始您的碎碎念之旅'}
            </Text>
          </View>

          {/* 用户名 */}
          <Text style={styles.label}>用户名</Text>
          <View style={styles.inputWrap}>
            <Text style={styles.inputIcon}>👤</Text>
            <TextInput
              style={styles.input}
              placeholder="请输入用户名"
              placeholderTextColor="#9CA3AF"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              editable={!loading}
            />
          </View>

          {/* 密码 */}
          <Text style={styles.label}>密码</Text>
          <View style={styles.inputWrap}>
            <Text style={styles.inputIcon}>🔒</Text>
            <TextInput
              style={styles.input}
              placeholder="请输入密码"
              placeholderTextColor="#9CA3AF"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!loading}
            />
          </View>

          {/* 注册额外字段 */}
          {!isLogin && (
            <>
              <Text style={styles.label}>邮箱 <Text style={styles.optional}>(可选)</Text></Text>
              <View style={styles.inputWrap}>
                <Text style={styles.inputIcon}>✉️</Text>
                <TextInput
                  style={styles.input}
                  placeholder="请输入邮箱"
                  placeholderTextColor="#9CA3AF"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  editable={!loading}
                />
              </View>
              <Text style={styles.label}>显示名称 <Text style={styles.optional}>(可选)</Text></Text>
              <View style={styles.inputWrap}>
                <Text style={styles.inputIcon}>😊</Text>
                <TextInput
                  style={styles.input}
                  placeholder="请输入显示名称"
                  placeholderTextColor="#9CA3AF"
                  value={displayName}
                  onChangeText={setDisplayName}
                  editable={!loading}
                />
              </View>
            </>
          )}

          {/* 登录按钮 */}
          <TouchableOpacity
            style={[styles.submitBtn, loading && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>{isLogin ? '登录  →' : '注册  →'}</Text>
            )}
          </TouchableOpacity>

          {/* 分割线 */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{isLogin ? '新用户？' : '已有账户？'}</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* 切换按钮 */}
          <TouchableOpacity
            style={styles.switchBtn}
            onPress={() => setIsLogin(!isLogin)}
            disabled={loading}
            activeOpacity={0.7}
          >
            <Text style={styles.switchText}>{isLogin ? '创建新账户' : '登录已有账户'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>ChewyBBTalk - 记录生活的点滴</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#EEF2FF' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  logoWrap: { alignItems: 'center', marginBottom: 28 },
  logo: {
    width: 64, height: 64, borderRadius: 16,
    backgroundColor: '#7C3AED',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  logoEmoji: { fontSize: 30 },
  title: { fontSize: 24, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 14, color: '#6B7280', marginTop: 6 },
  label: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 6, marginTop: 16 },
  optional: { color: '#9CA3AF', fontWeight: '400' },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12,
    paddingHorizontal: 12, backgroundColor: '#fff',
  },
  inputIcon: { fontSize: 18, marginRight: 8, opacity: 0.5 },
  input: { flex: 1, paddingVertical: 14, fontSize: 16, color: '#111827' },
  submitBtn: {
    marginTop: 20, borderRadius: 12, paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: '#2563EB',
    shadowColor: '#2563EB', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  divider: {
    flexDirection: 'row', alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  dividerText: { marginHorizontal: 12, fontSize: 13, color: '#9CA3AF' },
  switchBtn: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  switchText: { color: '#374151', fontSize: 15, fontWeight: '500' },
  footer: { textAlign: 'center', color: '#9CA3AF', fontSize: 12, marginTop: 24 },
});
