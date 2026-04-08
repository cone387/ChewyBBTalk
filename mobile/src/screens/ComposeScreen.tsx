import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { createBBTalkAsync, updateBBTalkAsync } from '../store/slices/bbtalkSlice';
import { loadTags } from '../store/slices/tagSlice';
import { attachmentApi } from '../services/api/mediaApi';
import type { Attachment, BBTalk } from '../types';

export default function ComposeScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const dispatch = useAppDispatch();
  const { tags } = useAppSelector(s => s.tag);

  const editItem: BBTalk | undefined = route.params?.editItem;
  const isEditing = !!editItem;

  const [content, setContent] = useState(editItem?.content || '');
  const [selectedTags, setSelectedTags] = useState<string[]>(
    editItem?.tags.map(t => t.name) || []
  );
  const [visibility, setVisibility] = useState<'public' | 'private'>(
    (editItem?.visibility as 'public' | 'private') || 'private'
  );
  const [attachments, setAttachments] = useState<Attachment[]>(editItem?.attachments || []);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newTag, setNewTag] = useState('');

  useEffect(() => {
    if (tags.length === 0) dispatch(loadTags());
  }, [dispatch, tags.length]);

  const toggleTag = (name: string) => {
    setSelectedTags(prev =>
      prev.includes(name) ? prev.filter(t => t !== name) : [...prev, name]
    );
  };

  const addNewTag = () => {
    const name = newTag.trim();
    if (name && !selectedTags.includes(name)) {
      setSelectedTags(prev => [...prev, name]);
    }
    setNewTag('');
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      setUploading(true);
      try {
        for (const asset of result.assets) {
          const fileName = asset.fileName || `photo_${Date.now()}.jpg`;
          const mimeType = asset.mimeType || 'image/jpeg';
          const att = await attachmentApi.upload(asset.uri, fileName, mimeType);
          setAttachments(prev => [...prev, att]);
        }
      } catch (err: any) {
        Alert.alert('上传失败', err.message || '请重试');
      } finally {
        setUploading(false);
      }
    }
  };

  const removeAttachment = (uid: string) => {
    setAttachments(prev => prev.filter(a => a.uid !== uid));
  };

  const handleSubmit = async () => {
    if (!content.trim()) {
      Alert.alert('提示', '请输入内容');
      return;
    }

    setSubmitting(true);
    try {
      if (isEditing && editItem) {
        await dispatch(updateBBTalkAsync({
          id: editItem.id,
          data: {
            content,
            tags: selectedTags.map(name => ({
              id: '', name, color: '', sortOrder: 0, bbtalkCount: 0,
            })),
            visibility,
            attachments,
          },
        })).unwrap();
      } else {
        await dispatch(createBBTalkAsync({
          content,
          tags: selectedTags,
          visibility,
          attachments,
        })).unwrap();
      }
      dispatch(loadTags());
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('失败', err.message || '请重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      {/* 内容输入 */}
      <TextInput
        style={styles.textInput}
        placeholder="分享你的想法..."
        value={content}
        onChangeText={setContent}
        multiline
        textAlignVertical="top"
        autoFocus={!isEditing}
      />

      {/* 附件预览 */}
      {attachments.length > 0 && (
        <View style={styles.attachmentRow}>
          {attachments.filter(a => a.type === 'image').map(att => (
            <View key={att.uid} style={styles.attachmentItem}>
              <Image source={{ uri: att.url }} style={styles.attachmentImage} />
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => removeAttachment(att.uid)}
              >
                <Text style={styles.removeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* 添加图片 */}
      <TouchableOpacity style={styles.addImageBtn} onPress={pickImage} disabled={uploading}>
        {uploading ? (
          <ActivityIndicator size="small" />
        ) : (
          <Text style={styles.addImageText}>📷 添加图片</Text>
        )}
      </TouchableOpacity>

      {/* 标签选择 */}
      <Text style={styles.sectionTitle}>标签</Text>
      <View style={styles.tagRow}>
        {tags.map(tag => (
          <TouchableOpacity
            key={tag.id}
            style={[styles.tagChip, selectedTags.includes(tag.name) && styles.tagChipActive]}
            onPress={() => toggleTag(tag.name)}
          >
            <Text style={[
              styles.tagChipText,
              selectedTags.includes(tag.name) && styles.tagChipTextActive,
            ]}>
              {tag.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 新标签输入 */}
      <View style={styles.newTagRow}>
        <TextInput
          style={styles.newTagInput}
          placeholder="添加新标签"
          value={newTag}
          onChangeText={setNewTag}
          onSubmitEditing={addNewTag}
          returnKeyType="done"
        />
        {newTag.trim() ? (
          <TouchableOpacity style={styles.newTagBtn} onPress={addNewTag}>
            <Text style={styles.newTagBtnText}>添加</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* 已选新标签 */}
      {selectedTags.filter(name => !tags.some(t => t.name === name)).length > 0 && (
        <View style={[styles.tagRow, { marginTop: 8 }]}>
          {selectedTags.filter(name => !tags.some(t => t.name === name)).map(name => (
            <TouchableOpacity
              key={name}
              style={[styles.tagChip, styles.tagChipActive]}
              onPress={() => toggleTag(name)}
            >
              <Text style={[styles.tagChipText, styles.tagChipTextActive]}>{name} ✕</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* 可见性 */}
      <Text style={styles.sectionTitle}>可见性</Text>
      <View style={styles.visibilityRow}>
        <TouchableOpacity
          style={[styles.visibilityBtn, visibility === 'private' && styles.visibilityBtnActive]}
          onPress={() => setVisibility('private')}
        >
          <Text style={[styles.visibilityText, visibility === 'private' && styles.visibilityTextActive]}>
            🔒 仅自己
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.visibilityBtn, visibility === 'public' && styles.visibilityBtnActive]}
          onPress={() => setVisibility('public')}
        >
          <Text style={[styles.visibilityText, visibility === 'public' && styles.visibilityTextActive]}>
            🌐 公开
          </Text>
        </TouchableOpacity>
      </View>

      {/* 发布按钮 */}
      <TouchableOpacity
        style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
        onPress={handleSubmit}
        disabled={submitting || !content.trim()}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitText}>{isEditing ? '更新' : '发布'}</Text>
        )}
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  textInput: {
    fontSize: 16,
    lineHeight: 24,
    minHeight: 160,
    color: '#1F2937',
    padding: 0,
    marginBottom: 16,
  },
  attachmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  attachmentItem: { position: 'relative' },
  attachmentImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  removeBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  addImageBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  addImageText: { fontSize: 14, color: '#374151' },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 10,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  tagChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  tagChipActive: { backgroundColor: '#4F46E5' },
  tagChipText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  tagChipTextActive: { color: '#fff' },
  newTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  newTagInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  newTagBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#4F46E5',
    borderRadius: 10,
  },
  newTagBtnText: { color: '#fff', fontSize: 14, fontWeight: '500' },
  visibilityRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  visibilityBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  visibilityBtnActive: { backgroundColor: '#4F46E5' },
  visibilityText: { fontSize: 14, color: '#374151', fontWeight: '500' },
  visibilityTextActive: { color: '#fff' },
  submitBtn: {
    backgroundColor: '#4F46E5',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
