import { getSession } from '../services/session';
import { removeAccountDrafts } from '../services/pendingMedia';
import { useNavigation } from '@react-navigation/native';
import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCurrentUser, logout } from '../services/auth';
import { userApi } from '../services/api/userApi';
import { useTheme } from '../theme/ThemeContext';
import { xAlert, xConfirm } from '../utils/crossAlert';

interface Props { onLogout: () => void; }

export default function AccountSecurityScreen({ onLogout }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const c = theme.colors;
  const navigation = useNavigation<any>();
  const user = getCurrentUser();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [changing, setChanging] = useState(false);
  const busyRef = useRef(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const changePassword = async () => {
    if (busyRef.current) return;
    if (!oldPassword || newPassword.length < 8 || newPassword !== repeatPassword) { setPasswordMessage('请填写当前密码，新密码至少 8 位，且两次输入一致。'); return; }
    busyRef.current = true; setChanging(true); setPasswordMessage('');
    try {
      await userApi.changePassword(oldPassword, newPassword);
      setOldPassword(''); setNewPassword(''); setRepeatPassword('');
      xAlert('密码已更新', '请使用新密码重新登录。其他设备也需要重新登录。');
      await logout(); onLogout();
    } catch (error: any) { setPasswordMessage(error.message || '密码修改失败，请重试'); }
    finally { busyRef.current = false; setChanging(false); }
  };
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = () => {
    xConfirm(
      '删除账号',
      '确定要永久删除您的账号吗？此操作不可撤销，您的所有数据（碎碎念、标签、附件等）将被永久删除。',
      () => setShowDeleteConfirm(true),
      undefined,
      { confirmText: '继续删除', destructive: true },
    );
  };

  const doLogoutAndRedirect = async () => {
    await logout();
    onLogout();
  };

  const confirmDeleteAccount = async () => {
    if (busyRef.current) return;
    if (!deletePassword.trim()) {
      xAlert('提示', '请输入密码以确认删除');
      return;
    }
    busyRef.current = true; setDeleting(true);
    try {
      const scope = getSession().scope;
      await userApi.deleteAccount(deletePassword);
      setDeletePassword(''); setShowDeleteConfirm(false);
      xAlert('账号已删除', '您的账号和所有数据已被永久删除。');
      await doLogoutAndRedirect();
      await removeAccountDrafts(scope).catch(() => xAlert('账号已删除', '本机草稿清理未完成，可通过系统设置清除 App 数据。'));
    } catch (e: any) {
      const msg = e.message || '请检查密码是否正确';
      xAlert('删除失败', msg);
    } finally {
      busyRef.current = false;
      setDeleting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: c.surfaceSecondary }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}>
        <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>账号信息</Text>
        <TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate('ProfileEdit')} style={[styles.dangerCard, { backgroundColor: c.cardBg, borderColor: c.border, marginBottom: 20 }]}>
          <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>{user?.display_name || user?.username || '我的账号'}</Text>
          <Text style={{ color: c.textSecondary, lineHeight: 22, marginTop: 8 }}>{user?.email || '尚未填写邮箱，建议添加可用邮箱用于找回账号'}</Text>
          <Text style={{ color: c.primary, marginTop: 12 }}>编辑账号信息</Text>
        </TouchableOpacity>
        <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>修改密码</Text>
        <View style={[styles.dangerCard, { backgroundColor: c.cardBg, borderColor: c.border, marginBottom: 20 }]}>
          <Text style={{ color: c.textSecondary, lineHeight: 22, marginBottom: 16 }}>修改后，需要在所有设备上重新登录。</Text>
          {[{ label: '当前密码', value: oldPassword, change: setOldPassword }, { label: '新密码（至少 8 位）', value: newPassword, change: setNewPassword }, { label: '再次输入新密码', value: repeatPassword, change: setRepeatPassword }].map((field, index) => <View key={field.label}>
            <Text style={{ color: c.text, marginBottom: 8 }}>{field.label}</Text>
            <TextInput accessibilityLabel={field.label} value={field.value} onChangeText={field.change} secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType={index === 0 ? 'password' : 'newPassword'} editable={!changing && !deleting} style={[styles.passwordInput, { minHeight: 48, color: c.text, borderColor: c.border, backgroundColor: c.surfaceSecondary }]} />
          </View>)}
          {!!passwordMessage && <Text accessibilityLiveRegion="polite" style={{ color: c.danger, marginBottom: 12 }}>{passwordMessage}</Text>}
          <TouchableOpacity accessibilityRole="button" disabled={changing || deleting} onPress={changePassword} style={[styles.deleteBtn, { backgroundColor: c.primary, minHeight: 48 }]}>{changing ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '600' }}>更新密码</Text>}</TouchableOpacity>
        </View>
        {/* 删除账号区域 */}
        <Text style={[styles.sectionTitle, { color: c.danger }]}>删除账号</Text>
        <View style={[styles.dangerCard, { backgroundColor: c.cardBg, borderColor: c.danger + '30' }]}>
          <View style={styles.dangerHeader}>
            <Ionicons name="warning-outline" size={20} color={c.danger} />
            <Text style={[styles.dangerHeaderText, { color: c.danger }]}>删除账号</Text>
          </View>
          <Text style={[styles.dangerDesc, { color: c.textSecondary }]}>
            删除账号后，您的所有数据将被永久清除且无法恢复，包括碎碎念、标签、附件文件等。建议在删除前先通过「数据管理」导出您的数据。
          </Text>


          {!showDeleteConfirm ? (
            <TouchableOpacity
              accessibilityRole="button" accessibilityLabel="删除账号"
              style={[styles.deleteBtn, { backgroundColor: c.danger + '15' }]}
              disabled={changing || deleting}
              onPress={handleDeleteAccount}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={18} color={c.danger} />
              <Text style={[styles.deleteBtnText, { color: c.danger }]}>删除账号</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.confirmArea}>
              <Text style={[styles.confirmHint, { color: c.textSecondary }]}>
                请输入您的登录密码以确认删除：
              </Text>
                <TextInput
                style={[styles.passwordInput, { backgroundColor: c.surfaceSecondary, color: c.text, borderColor: c.danger + '50' }]}
                placeholder="输入密码"
                placeholderTextColor={c.textTertiary}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="ascii-capable"
                textContentType="password"
                value={deletePassword}
                onChangeText={setDeletePassword}
                editable={!deleting && !changing}
                autoFocus
              />
              <View style={styles.confirmActions}>
                <TouchableOpacity
                  style={[styles.confirmBtn, { backgroundColor: c.surfaceSecondary }]}
                  onPress={() => { setShowDeleteConfirm(false); setDeletePassword(''); }}
                  disabled={deleting || changing}
                >
                  <Text style={[styles.confirmBtnText, { color: c.text }]}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmBtn, { backgroundColor: c.danger }]}
                  onPress={confirmDeleteAccount}
                  disabled={deleting || changing}
                >
                  {deleting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={[styles.confirmBtnText, { color: '#fff' }]}>确认删除</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '600', marginTop: 8, marginBottom: 10, marginLeft: 4 },
  dangerCard: {
    borderRadius: 16, borderWidth: 1, padding: 18,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  dangerHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  dangerHeaderText: { fontSize: 16, fontWeight: '600' },
  dangerDesc: { fontSize: 13, lineHeight: 20, marginBottom: 16 },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 12, paddingVertical: 12,
  },
  deleteBtnText: { fontSize: 15, fontWeight: '600' },
  confirmArea: { marginTop: 4 },
  confirmHint: { fontSize: 13, marginBottom: 10, lineHeight: 18 },
  passwordInput: {
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, marginBottom: 12,
  },
  confirmActions: { flexDirection: 'row', gap: 10 },
  confirmBtn: {
    flex: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center', justifyContent: 'center',
  },
  confirmBtnText: { fontSize: 14, fontWeight: '600' },
});
