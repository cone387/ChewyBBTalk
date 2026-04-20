import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Modal, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bbtalkApi } from '../services/api/bbtalkApi';
import type { Comment } from '../types';
import type { Theme } from '../theme/ThemeContext';

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
    if (!content) return;
    setSubmitting(true);
    try {
      const comment = await bbtalkApi.createComment(bbtalkId, content);
      onCommentAdded(comment);
      setText('');
      onClose();
    } catch (e: any) {
      Alert.alert('发送失败', e.message || '请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <View style={[styles.container, { backgroundColor: c.cardBg, paddingBottom: insets.bottom + 8 }]}>
          <View style={styles.handle} />
          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              style={[styles.input, { backgroundColor: c.surfaceSecondary, color: c.text }]}
              placeholder="写一条评论..."
              placeholderTextColor={c.textTertiary}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={500}
              editable={!submitting}
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
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  keyboardView: { justifyContent: 'flex-end' },
  container: {
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    paddingHorizontal: 16, paddingTop: 8,
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
