import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
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
      if (isLogin) {
        const result = await login(username, password);
        if (result.success) {
          onLoginSuccess();
        } else {
          Alert.alert('登录失败', result.error || '请重试');
        }
      } else {
        const result = await register({
          username, password,
          email: email || undefined,
          display_name: displayName || undefined,
        });
        if (result.success) {
          onLoginSuccess();
        } else {
          Alert.alert('注册失败', result.error || '请重试');
        }
      }
    } catch {
      Alert.alert('错误', '网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.card}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>💬</Text>
          </View>
          <Text style={styles.title}>{isLogin ? '欢迎回来' : '创建账户'}</Text>
          <Text style={styles.subtitle}>
            {isLogin ? '登录您的 ChewyBBTalk 账户' : '开始您的碎碎念之旅'}
          </Text>
        </View>

        {/* 表单 */}
        <TextInput
          style={styles.input}
          placeholder="用户名"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          editable={!loading}
        />
        <TextInput
          style={styles.input}
          placeholder="密码"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!loading}
        />

        {!isLogin && (
          <>
            <TextInput
              style={styles.input}
              placeholder="邮箱（可选）"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!loading}
            />
            <TextInput
              style={styles.input}
              placeholder="显示名称（可选）"
              value={displayName}
              onChangeText={setDisplayName}
              editable={!loading}
            />
          </>
        )}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>{isLogin ? '登录' : '注册'}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.switchButton}
          onPress={() => setIsLogin(!isLogin)}
          disabled={loading}
        >
          <Text style={styles.switchText}>
            {isLogin ? '创建新账户' : '登录已有账户'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F4FF',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 5,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  logoText: {
    fontSize: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 14,
    backgroundColor: '#fff',
  },
  button: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  switchButton: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  switchText: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '500',
  },
});
