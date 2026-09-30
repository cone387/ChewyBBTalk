import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, ScrollView, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import { buildImageSource } from '../utils/imageSource';
import { getCurrentUser, updateCachedUser } from '../services/auth';
import { userApi } from '../services/api/userApi';
import { attachmentApi } from '../services/api/mediaApi';
import { useTheme } from '../theme/ThemeContext';
import { xAlert, xConfirm } from '../utils/crossAlert';
import { getSession, isCurrentSession, onSessionChange } from '../services/session';

export default function ProfileEditScreen() {
  const currentUser = getCurrentUser();
  const session = getSession();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const c = theme.colors;

  const [displayName, setDisplayName] = useState(currentUser?.display_name || '');
  const [bio, setBio] = useState(currentUser?.bio || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [saving, setSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(currentUser?.avatar || null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const savingRef = useRef(false);
  const savedRef = useRef(false);
  const avatarBusyRef = useRef(false);
  const aliveRef = useRef(true);
  const [error, setError] = useState('');
  useEffect(() => {
    aliveRef.current = true;
    const unsubscribe = onSessionChange(() => {
      const user = getSession().scope ? getCurrentUser() : null;
      setDisplayName(user?.display_name || ''); setBio(user?.bio || ''); setEmail(user?.email || '');
      setAvatarUrl(user?.avatar || null); setError(''); setSaving(false); setUploadingAvatar(false);
      savingRef.current = false; avatarBusyRef.current = false; savedRef.current = false;
    });
    return () => { aliveRef.current = false; unsubscribe(); };
  }, []);
  const changed = displayName !== (currentUser?.display_name || '') || bio !== (currentUser?.bio || '') ||
    email !== (currentUser?.email || '') || avatarUrl !== (currentUser?.avatar || null);
  usePreventRemove(changed, ({ data }) => {
    if (!aliveRef.current || !isCurrentSession(session)) return;
    if (savedRef.current) { navigation.dispatch(data.action); return; }
    xConfirm('放弃修改？', '个人信息还没有保存。', () => {
      if (aliveRef.current && isCurrentSession(session)) navigation.dispatch(data.action);
    }, undefined,
      { confirmText: '放弃修改', cancelText: '继续编辑' });
  });

  const pickAvatar = async () => {
    if (savingRef.current || avatarBusyRef.current || !aliveRef.current || !session.scope || !isCurrentSession(session)) return;
    avatarBusyRef.current = true;
    setUploadingAvatar(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8,
      });
      if (!aliveRef.current || !isCurrentSession(session) || result.canceled || !result.assets.length) return;
      const asset = result.assets[0];
      let att;
      if (Platform.OS === 'web') {
        // Web: uri is a blob URL, need to convert to File object
        const resp = await fetch(asset.uri);
        if (!aliveRef.current || !isCurrentSession(session)) return;
        const blob = await resp.blob();
        if (!aliveRef.current || !isCurrentSession(session)) return;
        const file = new File([blob], asset.fileName || `avatar_${Date.now()}.jpg`, { type: asset.mimeType || 'image/jpeg' });
        att = await attachmentApi.uploadFile(file);
      } else {
        att = await attachmentApi.upload(asset.uri, asset.fileName || `avatar_${Date.now()}.jpg`, asset.mimeType || 'image/jpeg');
      }
      if (aliveRef.current && isCurrentSession(session)) setAvatarUrl(att.url);
    } catch (e: any) {
      if (aliveRef.current && isCurrentSession(session)) xAlert('上传失败', e?.message || '请稍后重试');
    } finally {
      if (aliveRef.current && isCurrentSession(session)) { avatarBusyRef.current = false; setUploadingAvatar(false); }
    }
  };

  const handleSave = async () => {
    if (savingRef.current || avatarBusyRef.current || !aliveRef.current || !session.scope || !isCurrentSession(session)) return;
    if (!displayName.trim()) {
      xAlert('提示', '显示名称不能为空');
      return;
    }
    savingRef.current = true;
    setSaving(true); setError('');
    try {
      const data: Record<string, string> = {
        display_name: displayName.trim(),
        bio: bio.trim(),
        email: email.trim(),
      };
      if (avatarUrl) data.avatar = avatarUrl;
      const updated = await userApi.updateProfile(data);
      if (!isCurrentSession(session)) return;
      await updateCachedUser(updated);
      if (!aliveRef.current || !isCurrentSession(session)) return;
      savedRef.current = true;
      navigation.goBack();
    } catch (e: any) {
      if (aliveRef.current && isCurrentSession(session)) setError(e?.message || '保存失败，请稍后重试');
    } finally {
      if (aliveRef.current && isCurrentSession(session)) { savingRef.current = false; setSaving(false); }
    }
  };

  if (!currentUser) return null;

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: c.surfaceSecondary }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="更换头像" onPress={pickAvatar} activeOpacity={0.7} disabled={uploadingAvatar || saving}>
            {avatarUrl ? (
              <Image source={buildImageSource(avatarUrl)} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, { backgroundColor: c.avatarBg }]}>
                <Text style={styles.avatarText}>
                  {(displayName || currentUser.username).charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={[styles.avatarBadge, { backgroundColor: c.primary }]}>
              {uploadingAvatar ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="camera" size={14} color="#fff" />
              )}
            </View>
          </TouchableOpacity>
          <Text style={[styles.username, { color: c.textSecondary }]}>@{currentUser.username}</Text>
        </View>

        {/* Fields */}
        <View style={[styles.card, { backgroundColor: c.cardBg }]}>
          <Text style={[styles.label, { color: c.textSecondary }]}>显示名称</Text>
          <TextInput
            style={[styles.input, { borderColor: c.border, color: c.text }]}
            value={displayName}
            accessibilityLabel="显示名称" editable={!saving}
            onChangeText={setDisplayName}
            placeholder="输入显示名称"
            placeholderTextColor={c.textTertiary}
          />

          <Text style={[styles.label, { color: c.textSecondary }]}>邮箱</Text>
          <TextInput
            style={[styles.input, { borderColor: c.border, color: c.text }]}
            value={email}
            accessibilityLabel="邮箱" editable={!saving}
            onChangeText={setEmail}
            placeholder="输入邮箱"
            placeholderTextColor={c.textTertiary}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={[styles.label, { color: c.textSecondary }]}>个人简介</Text>
          <TextInput
            style={[styles.input, styles.bioInput, { borderColor: c.border, color: c.text }]}
            value={bio}
            accessibilityLabel="个人简介" editable={!saving}
            onChangeText={setBio}
            placeholder="输入个人简介"
            placeholderTextColor={c.textTertiary}
            multiline
            textAlignVertical="top"
          />
        </View>

        {!!error && <Text accessibilityRole="alert" style={{ color: c.danger, lineHeight: 22, marginTop: 12 }}>{error}</Text>}
        <TouchableOpacity accessibilityRole="button"
          style={[styles.saveBtn, { backgroundColor: c.primary, opacity: saving || uploadingAvatar || !changed ? 0.5 : 1 }]}
          onPress={handleSave}
          disabled={saving || uploadingAvatar || !changed}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>保存</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, width: '100%', maxWidth: 600, alignSelf: 'center' },
  avatarSection: { alignItems: 'center', marginVertical: 24 },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    justifyContent: 'center', alignItems: 'center',
    overflow: 'hidden',
  },
  avatarBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: '700' },
  username: { fontSize: 14, marginTop: 8 },
  card: {
    borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  label: { fontSize: 13, fontWeight: '500', marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 16,
  },
  bioInput: { minHeight: 80 },
  saveBtn: {
    marginTop: 20, borderRadius: 12, height: 48,
    justifyContent: 'center', alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
