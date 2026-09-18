import React, { useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ActivityIndicator,
  StyleSheet, Platform, Animated, Modal, Keyboard, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Theme } from '../theme/ThemeContext';
import ComposeScreen from '../screens/ComposeScreen';
import type { BiometricUnlockResult } from '../hooks/usePrivacyMode';

export interface PrivacyLockOverlayProps {
  locked: boolean;
  biometricAvailable: boolean;
  allowComposeWhenLocked: boolean;
  unlockPassword: string;
  unlocking: boolean;
  lockKeyboardH: Animated.Value;
  onUnlockPasswordChange: (val: string) => void;
  onUnlock: () => Promise<void>;
  onBiometricUnlock: () => Promise<BiometricUnlockResult>;
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
    <View style={[styles.lockOverlay, { backgroundColor: c.surfaceSecondary }]}>
      <Animated.View style={[styles.lockInner, { transform: [{ translateY: lockKeyboardH }] }]}>
        <View style={[
          styles.lockCard,
          {
            backgroundColor: c.cardBg,
            borderColor: c.borderLight,
            shadowColor: '#000',
          },
        ]}>
          {/* Logo 圆 — 使用主题主色，与整体配色一致 */}
          <View style={styles.logoWrap}>
            <View style={[styles.logo, { backgroundColor: c.primary }]}>
              <Ionicons name="lock-closed" size={32} color="#fff" />
            </View>
          </View>

          <Text style={[styles.lockTitle, { color: c.text }]}>内容已锁定</Text>
          <Text style={[styles.lockSub, { color: c.textSecondary }]}>验证身份以解锁查看</Text>

          {biometricAvailable && (
            <TouchableOpacity
              style={[styles.biometricBtn, { borderColor: c.border, backgroundColor: c.primaryLight }]}
              onPress={onBiometricUnlock}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={Platform.OS === 'ios' ? '使用 Face ID 或 Touch ID 解锁' : '使用指纹解锁'}
            >
              <Ionicons
                name={Platform.OS === 'ios' ? 'scan' : 'finger-print'}
                size={28}
                color={c.primary}
              />
              <Text style={[styles.biometricText, { color: c.primary }]}>
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

          <View style={[styles.inputWrap, { borderColor: c.border, backgroundColor: c.surface }]}>
            <Ionicons name="key-outline" size={18} color={c.textTertiary} />
            <TextInput
              style={[styles.lockInput, { color: c.text }]}
              placeholder="请输入密码"
              placeholderTextColor={c.textTertiary}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="ascii-capable"
              textContentType="password"
              value={unlockPassword}
              onChangeText={onUnlockPasswordChange}
              onSubmitEditing={onUnlock}
              returnKeyType="done"
            />
          </View>

          <TouchableOpacity
            style={[
              styles.lockBtn,
              { backgroundColor: c.primary },
              (unlocking || !unlockPassword) && { opacity: 0.5 },
            ]}
            onPress={onUnlock}
            disabled={unlocking || !unlockPassword}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="密码解锁"
          >
            {unlocking
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.lockBtnText}>解锁</Text>}
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
          accessibilityRole="button"
          accessibilityLabel="锁定状态下新建碎碎念"
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

function PrivacyEntry(props: PrivacyLockOverlayProps) {
  if (!props.locked) return null;
  return props.allowComposeWhenLocked
    ? <LockedComposer {...props} />
    : <PrivacyLockOverlay {...props} />;
}

function LockedComposer(props: PrivacyLockOverlayProps) {
  const [showUnlock, setShowUnlock] = useState(false);
  const authenticating = useRef(false);
  const c = props.theme.colors;
  const closeUnlock = () => {
    if (props.unlocking) return;
    Keyboard.dismiss(); props.onUnlockPasswordChange(''); setShowUnlock(false);
  };
  const requestUnlock = async () => {
    if (authenticating.current) return;
    Keyboard.dismiss();
    if (!props.biometricAvailable) { setShowUnlock(true); return; }
    authenticating.current = true;
    try {
      const result = await props.onBiometricUnlock();
      if (result === 'password') setShowUnlock(true);
    } finally { authenticating.current = false; }
  };
  return (
    <View style={[StyleSheet.absoluteFillObject, { zIndex: 200, backgroundColor: props.theme.colors.background }]}>
      <ComposeScreen lockedCapture onRequestUnlock={requestUnlock} />
      <Modal visible={showUnlock} transparent animationType="fade" onRequestClose={closeUnlock}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[styles.passwordBackdrop, { backgroundColor: c.overlay }]}>
          <View accessibilityViewIsModal style={[styles.passwordDialog, { backgroundColor: c.cardBg }]}>
            <Text style={[styles.lockTitle, { color: c.text }]}>输入密码</Text>
            <TextInput accessibilityLabel="解锁密码" autoFocus secureTextEntry
              style={[styles.passwordInput, { color: c.text, borderColor: c.border }]}
              placeholder="请输入密码" placeholderTextColor={c.textTertiary}
              autoCapitalize="none" autoCorrect={false} textContentType="password"
              value={props.unlockPassword} onChangeText={props.onUnlockPasswordChange}
              editable={!props.unlocking} returnKeyType="done"
              onSubmitEditing={() => { if (!props.unlocking) void props.onUnlock(); }} />
            <View style={styles.passwordActions}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="取消认证" disabled={props.unlocking}
                onPress={closeUnlock} style={styles.passwordAction}>
                <Text style={{ color: c.textSecondary }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="密码解锁"
                disabled={props.unlocking || !props.unlockPassword} onPress={props.onUnlock}
                style={[styles.passwordAction, { opacity: props.unlocking || !props.unlockPassword ? 0.5 : 1 }]}>
                {props.unlocking ? <ActivityIndicator color={c.primary} /> : <Text style={{ color: c.primary }}>解锁</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

export default React.memo(PrivacyEntry);

const styles = StyleSheet.create({
  passwordBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  passwordDialog: { width: '100%', maxWidth: 360, borderRadius: 16, padding: 24 },
  passwordInput: { minHeight: 48, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, marginTop: 20, fontSize: 16 },
  passwordActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 12 },
  passwordAction: { minHeight: 44, minWidth: 64, alignItems: 'center', justifyContent: 'center' },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center', alignItems: 'center', zIndex: 200,
  },
  lockInner: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    width: '100%', paddingHorizontal: 20,
  },
  lockCard: {
    width: '100%', maxWidth: 420,
    alignItems: 'center',
    padding: 28, paddingTop: 32,
    borderRadius: 20, borderWidth: 1,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 4,
  },
  logoWrap: { marginBottom: 16 },
  logo: {
    width: 64, height: 64, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
  },
  lockTitle: { fontSize: 20, fontWeight: '700' },
  lockSub: { fontSize: 13, marginTop: 6, marginBottom: 24 },
  biometricBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingVertical: 14, width: '100%',
    borderWidth: 1, borderRadius: 14,
  },
  biometricText: { fontSize: 14, fontWeight: '600' },
  lockDivider: { flexDirection: 'row', alignItems: 'center', width: '100%', marginVertical: 16 },
  lockDividerLine: { flex: 1, height: 1 },
  lockDividerText: { marginHorizontal: 12, fontSize: 12 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    width: '100%', borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, height: 48, gap: 8,
  },
  lockInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
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
