import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ActivityIndicator,
  StyleSheet, Platform, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Theme } from '../theme/ThemeContext';

export interface PrivacyLockOverlayProps {
  locked: boolean;
  biometricAvailable: boolean;
  allowComposeWhenLocked: boolean;
  unlockPassword: string;
  unlocking: boolean;
  lockKeyboardH: Animated.Value;
  onUnlockPasswordChange: (val: string) => void;
  onUnlock: () => Promise<void>;
  onBiometricUnlock: () => Promise<void>;
  onCompose: () => void;
  onVoiceRecord: () => void;
  bottomInset: number;
  theme: Theme;
}

function PrivacyLockOverlay({
  locked,
  biometricAvailable,
  allowComposeWhenLocked,
  unlockPassword,
  unlocking,
  lockKeyboardH,
  onUnlockPasswordChange,
  onUnlock,
  onBiometricUnlock,
  onCompose,
  onVoiceRecord,
  bottomInset,
  theme,
}: PrivacyLockOverlayProps) {
  if (!locked) return null;

  const c = theme.colors;

  return (
    <View style={[styles.lockOverlay, { backgroundColor: c.lockBg }]}>
      <Animated.View style={[styles.lockInner, { transform: [{ translateY: lockKeyboardH }] }]}>
        <View style={styles.lockCard}>
          <Ionicons name="lock-closed" size={40} color={c.lockAccent} />
          <Text style={[styles.lockTitle, { color: c.text }]}>内容已锁定</Text>
          <Text style={[styles.lockSub, { color: c.textTertiary }]}>验证身份以解锁查看</Text>

          {biometricAvailable && (
            <TouchableOpacity style={[styles.biometricBtn, { borderColor: c.border }]} onPress={onBiometricUnlock}>
              <Ionicons name={Platform.OS === 'ios' ? 'scan' : 'finger-print'} size={32} color={c.lockAccent} />
              <Text style={[styles.biometricText, { color: c.lockAccent }]}>
                {Platform.OS === 'ios' ? 'Face ID / Touch ID' : '指纹解锁'}
              </Text>
            </TouchableOpacity>
          )}

          {biometricAvailable && (
            <View style={styles.lockDivider}>
              <View style={[styles.lockDividerLine, { backgroundColor: c.border }]} />
              <Text style={[styles.lockDividerText, { color: c.textTertiary }]}>或使用密码</Text>
              <View style={[styles.lockDividerLine, { backgroundColor: c.border }]} />
            </View>
          )}

          <TextInput
            style={[styles.lockInput, { borderColor: c.border, color: c.text }]}
            placeholder="请输入密码"
            placeholderTextColor={c.textTertiary}
            secureTextEntry
            value={unlockPassword}
            onChangeText={onUnlockPasswordChange}
            onSubmitEditing={onUnlock}
            returnKeyType="done"
          />
          <TouchableOpacity
            style={[styles.lockBtn, { backgroundColor: c.lockAccent }, (unlocking || !unlockPassword) && { opacity: 0.5 }]}
            onPress={onUnlock}
            disabled={unlocking || !unlockPassword}
          >
            {unlocking ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.lockBtnText}>密码解锁</Text>}
          </TouchableOpacity>
        </View>
      </Animated.View>

      {allowComposeWhenLocked && (
        <TouchableOpacity
          style={[styles.fab, { bottom: bottomInset + 24, backgroundColor: c.primary, shadowColor: c.fabShadow }]}
          onPress={onCompose}
          onLongPress={onVoiceRecord}
          delayLongPress={300}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

export default React.memo(PrivacyLockOverlay);

const styles = StyleSheet.create({
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center', alignItems: 'center', zIndex: 200,
  },
  lockInner: { flex: 1, justifyContent: 'center', alignItems: 'center', width: '100%' },
  lockCard: { alignItems: 'center', padding: 32, width: '80%' },
  lockTitle: { fontSize: 20, fontWeight: '700', marginTop: 16 },
  lockSub: { fontSize: 14, marginTop: 6, marginBottom: 24 },
  biometricBtn: {
    alignItems: 'center', gap: 8, paddingVertical: 20,
    width: '100%', borderWidth: 1, borderRadius: 16,
  },
  biometricText: { fontSize: 14, fontWeight: '500' },
  lockDivider: { flexDirection: 'row', alignItems: 'center', width: '100%', marginVertical: 16 },
  lockDividerLine: { flex: 1, height: 1 },
  lockDividerText: { marginHorizontal: 10, fontSize: 12 },
  lockInput: {
    width: '100%', borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 16, height: 48, fontSize: 16, textAlign: 'center',
  },
  lockBtn: {
    width: '100%', borderRadius: 12, height: 48,
    justifyContent: 'center', alignItems: 'center', marginTop: 14,
  },
  lockBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  fab: {
    position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28,
    justifyContent: 'center', alignItems: 'center',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 6,
  },
});
