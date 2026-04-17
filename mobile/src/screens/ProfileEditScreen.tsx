import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { getCurrentUser, updateCachedUser } from '../services/auth';
import { userApi } from '../services/api/userApi';
import { attachmentApi } from '../services/api/mediaApi';
import { useTheme } from '../theme/ThemeContext';

export default function ProfileEditScreen() {
  const currentUser = getCurrentUser();
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

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets.length) return;
    setUploadingAvatar(true);
    try {
      const asset = result.assets[0];
      const att = await attachmentApi.upload(asset.uri, asset.fileName || `avatar_${Date.now()}.jpg`, asset.mimeType || 'image/jpeg');
      setAvatarUrl(att.url);
    } catch (e: any) {
      Alert.alert('上传失败', e.message);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    if (!displayName.trim()) {
      Alert.alert('提示', '显示名称不能为空');
      return;
    }
    setSaving(true);
    try {
      const updated = await userApi.updateProfile({
        display_name: displayName.trim(),
        bio: bio.trim(),
        email: email.trim(),
        ...(avatarUrl ? { avatar: avatarUrl } : {}),
      });
      await updateCachedUser(updated);
      Alert.alert('成功', '个人信息已更新', [
        { text: '好的', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert('保存失败', e.message || '请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  if (!currentUser) return null;

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary }]}>
      <View style={[styles.content, { paddingBottom: insets.bottom + 20 }]}>
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={pickAvatar} activeOpacity={0.7} disabled={uploadingAvatar}>
            {avatarUrl ? (
              <Image source={avatarUrl} style={styles.avatar} contentFit="cover" />
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
            onChangeText={setDisplayName}
            placeholder="输入显示名称"
            placeholderTextColor={c.textTertiary}
          />

          <Text style={[styles.label, { color: c.textSecondary }]}>邮箱</Text>
          <TextInput
            style={[styles.input, { borderColor: c.border, color: c.text }]}
            value={email}
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
            onChangeText={setBio}
            placeholder="输入个人简介"
            placeholderTextColor={c.textTertiary}
            multiline
            textAlignVertical="top"
          />
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: c.primary, opacity: saving ? 0.6 : 1 }]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>保存</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, padding: 16 },
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
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
  },
  bioInput: { minHeight: 80 },
  saveBtn: {
    marginTop: 20, borderRadius: 12, height: 48,
    justifyContent: 'center', alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
