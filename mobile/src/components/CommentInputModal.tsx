import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Animated, Keyboard,
  NativeSyntheticEvent, TextInputKeyPressEventData, BackHandler,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bbtalkApi } from '../services/api/bbtalkApi';
import { xAlert } from '../utils/crossAlert';
import type { Comment } from '../types';
import type { Theme } from '../theme/ThemeContext';

const isWeb = Platform.OS === 'web';

interface Props {
  visible: boolean;
  bbtalkId: string;
  onClose: () => void;
  onCommentAdded: (comment: Comment) => void;
  theme: Theme;
}

export default function CommentInputModal({ visible, bbtalkId, onClose, onCommentAdded, theme }: Props) {
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 动画值：蒙层透明度 + 面板滑入
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(200)).current;
  const [mounted, setMounted] = useState(false);

  // 打开/关闭动画
  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(overlayAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 2 }),
      ]).start(() => {
        setTimeout(() => inputRef.current?.focus(), 50);
      });
    } else {
      Animated.parallel([
        Animated.timing(overlayAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 200, duration: 150, useNativeDriver: true }),
      ]).start(() => {
        setMounted(false);
        setText('');
      });
    }
  }, [visible]);

  // Android 返回键关闭
  useEffect(() => {
    if (!visible || isWeb) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  const handleSend = useCallback(async () => {
    const content = text.trim();
    if (!content || submitting) return;
    setSubmitting(true);
    try {
      const comment = await bbtalkApi.createComment(bbtalkId, content);
      onCommentAdded(comment);
      setText('');
      onClose();
    } catch (e: any) {
      xAlert('发送失败', e.message || '请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }, [text, submitting, bbtalkId, onCommentAdded, onClose]);

  const handleKeyPress = useCallback((e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (isWeb && e.nativeEvent.key === 'Enter' && !(e as any).nativeEvent.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  if (!mounted) return null;

  const inputBar = (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: c.cardBg, paddingBottom: isWeb ? 12 : insets.bottom + 8, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <View style={styles.handle} />
      <View style={styles.inputRow}>
        <TextInput
          ref={inputRef}
          style={[styles.input, { backgroundColor: c.surfaceSecondary, color: c.text }]}
          placeholder="写一条评论..."
          placeholderTextColor={c.textTertiary}
          value={text}
          onChangeText={setText}
          onKeyPress={handleKeyPress}
          multiline={!isWeb}
          maxLength={500}
          editable={!submitting}
          onSubmitEditing={isWeb ? handleSend : undefined}
          blurOnSubmit={isWeb}
        />
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: text.trim() ? c.primary : c.border }]}
          onPress={handleSend}
          disabled={!text.trim() || submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={18} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </Animated.View>
  );

  if (isWeb) {
    return (
      <View style={styles.webOverlay}>
        <Animated.View style={[styles.backdrop, { opacity: overlayAnim }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        </Animated.View>
        {inputBar}
      </View>
    );
  }

  return (
    <View style={styles.nativeOverlay} pointerEvents="box-none">
      <Animated.View style={[styles.backdrop, { opacity: overlayAnim }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      </Animated.View>
      <KeyboardAvoidingView behavior="padding" style={styles.keyboardView} pointerEvents="box-none">
        {inputBar}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  // 原生端：绝对定位覆盖层，不使用 Modal
  nativeOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    justifyContent: 'flex-end',
  },
  // 半透明蒙层 — 极轻，几乎无感
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  keyboardView: { justifyContent: 'flex-end' },
  // Web
  webOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999,
    justifyContent: 'flex-end',
  },
  // 输入面板
  container: {
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    paddingHorizontal: 16, paddingTop: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 10,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB',
    alignSelf: 'center', marginBottom: 10,
  },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    flex: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 15, maxHeight: 120, minHeight: 40,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
  },
});
