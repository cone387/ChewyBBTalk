import React, { useState, useRef, useEffect } from 'react';
import {
  View, TextInput, TouchableOpacity, StyleSheet,
  Modal, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
  NativeSyntheticEvent, TextInputKeyPressEventData,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bbtalkApi } from '../services/api/bbtalkApi';
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

  useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setText('');
    }
  }, [visible]);

  const handleSend = async () => {
    const content = text.trim();
    if (!content || submitting) return;
    setSubmitting(true);
    try {
      const comment = await bbtalkApi.createComment(bbtalkId, content);
      onCommentAdded(comment);
      setText('');
      onClose();
    } catch (e: any) {
      if (isWeb) {
        window.alert('发送失败: ' + (e.message || '请稍后重试'));
      } else {
        Alert.alert('发送失败', e.message || '请稍后重试');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    // Enter to send (without Shift for newline)
    if (isWeb && e.nativeEvent.key === 'Enter' && !(e as any).nativeEvent.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!visible) return null;

  const inputContent = (
    <View style={[styles.container, { backgroundColor: c.cardBg, paddingBottom: isWeb ? 12 : insets.bottom + 8 }]}>
      {!isWeb && <View style={styles.handle} />}
      <View style={styles.inputRow}>
        <TextInput
          ref={inputRef}
          style={[styles.input, { backgroundColor: c.surfaceSecondary, color: c.text }]}
          placeholder="写一条评论... (Enter 发送)"
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
    </View>
  );

  if (isWeb) {
    // Web: use a simple fixed-bottom overlay instead of Modal (which has aria-hidden issues)
    return (
      <View style={styles.webOverlay}>
        <TouchableOpacity style={styles.webBackdrop} activeOpacity={1} onPress={onClose} />
        {inputContent}
      </View>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
      <KeyboardAvoidingView behavior="padding" style={styles.keyboardView}>
        {inputContent}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Native Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  keyboardView: { justifyContent: 'flex-end' },
  // Web overlay
  webOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999,
    justifyContent: 'flex-end',
  },
  webBackdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  // Shared
  container: {
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    paddingHorizontal: 16, paddingTop: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 10,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB',
    alignSelf: 'center', marginBottom: 12,
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
