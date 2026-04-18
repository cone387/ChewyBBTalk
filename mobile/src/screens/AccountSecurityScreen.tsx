import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCurrentUser, logout } from '../services/auth';
import { userApi } from '../services/api/userApi';
import { useTheme } from '../theme/ThemeContext';

interface Props { onLogout: () => void; }

export default function AccountSecurityScreen({ onLogout }: Props) {
  const currentUser = getCurrentUser();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const c = theme.colors;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = () => {
    Alert.alert(
      '删除账号',
      '确定要永久删除您的账号吗？此操作不可撤销，您的所有数据（碎碎念、标签、附件等）将被永久删除。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '继续删除',
          style: 'destructive',
          onPress: () => setShowDeleteConfirm(true),
        },
      ]
    );
  };

  const confirmDeleteAccount = async () => {
    if (!deletePassword.trim()) {
      Alert.alert('提示', '请输入密码以确认删除');
      return;
    }
    setDeleting(true);
    try {
      await userApi.deleteAccount(deletePassword);
      Alert.alert('账号已删除', '您的账号和所有数据已被永久删除。', [
        { text: '确定', onPress: async () => { await logout(); onLogout(); } },
      ]);
    } catch (e: any) {
      Alert.alert('删除失败', e.message || '请检查密码是否正确');
    } finally {
      setDeleting(false);
      setDeletePassword('');
      setShowDeleteConfirm(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary }]}>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}>
        {/* 账号信息 */}
        {currentUser && (
          <View style={[styles.card, { backgroundColor: c.cardBg }]}>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: c.textSecondary }]}>用户名</Text>
              <Text style={[styles.infoValue, { color: c.text }]}>{currentUser.username}</Text>
            </View>
            {currentUser.email ? (
              <View style={[styles.infoRow, styles.infoRowBorder, { borderTopColor: c.border }]}>
                <Text style={[styles.infoLabel, { color: c.textSecondary }]}>邮箱</Text>
                <Text style={[styles.infoValue, { color: c.text }]}>{currentUser.email}</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* 删除账号区域 */}
        <Text style={[styles.sectionTitle, { color: c.danger }]}>危险操作</Text>
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
              style={[styles.deleteBtn, { backgroundColor: c.danger + '15' }]}
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
                value={deletePassword}
                onChangeText={setDeletePassword}
                editable={!deleting}
                autoFocus
              />
              <View style={styles.confirmActions}>
                <TouchableOpacity
                  style={[styles.confirmBtn, { backgroundColor: c.surfaceSecondary }]}
                  onPress={() => { setShowDeleteConfirm(false); setDeletePassword(''); }}
                  disabled={deleting}
                >
                  <Text style={[styles.confirmBtnText, { color: c.text }]}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmBtn, { backgroundColor: c.danger }]}
                  onPress={confirmDeleteAccount}
                  disabled={deleting}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 12 },
  card: {
    borderRadius: 16, padding: 18, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  infoRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 8, paddingTop: 14 },
  infoLabel: { fontSize: 14 },
  infoValue: { fontSize: 15, fontWeight: '500' },
  sectionTitle: { fontSize: 14, fontWeight: '600', marginTop: 24, marginBottom: 10, marginLeft: 4 },
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
