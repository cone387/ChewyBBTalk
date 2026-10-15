import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { visibilityPresentation } from '../utils/visibilityPresentation';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import type { PendingMedia } from '../services/pendingMedia';

export default function DraftStatus({ visibility, onVisibility, status, onSave, pending, uploading, uploadingId, error, onRetry, onRetryItem, onRemove }: {
  visibility: string; onVisibility: () => void; status: string; onSave: () => void;
  pending: PendingMedia[]; uploading: boolean; error: string; onRetry: () => void; onRemove: (id: string) => void;
  uploadingId?: string; onRetryItem?: (item: PendingMedia) => void;
}) {
  const { theme: { colors: c } } = useTheme();
  return <View style={{ backgroundColor: c.surface, paddingHorizontal: 16 }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="修改可见性" onPress={onVisibility} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name={visibilityPresentation(visibility).icon} size={16} color={c.textSecondary} />
        <Text style={{ color: c.textSecondary, fontSize: 13 }}>{visibilityPresentation(visibility).label}</Text>
        <Ionicons name="chevron-down" size={12} color={c.textSecondary} />
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="重试保存草稿" onPress={onSave} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text accessibilityLiveRegion="polite" style={{ color: status.includes('失败') ? c.danger : c.textSecondary, fontSize: 12 }}>{status}</Text>
      </TouchableOpacity>
    </View>
    {(pending.length > 0 || error) && <View style={{ paddingBottom: 8 }}>
      <Text accessibilityLiveRegion="polite" style={{ color: c.textSecondary, fontSize: 13 }}>{uploading ? '正在上传附件…' : error || '附件待上传，草稿保存在本机'}</Text>
      <ScrollView style={{ maxHeight: 100 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
      {pending.map(item => <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: c.text, fontSize: 14 }}>{item.name.startsWith('voice_') ? '语音记录' : item.name}</Text>
          <Text style={{ color: item.error ? c.danger : c.textSecondary, fontSize: 12 }}>{uploadingId === item.id ? '正在上传…' : item.error ? '上传失败 · 文件已保留' : '待上传 · 文件已保留'}</Text></View>
        {onRetryItem && <TouchableOpacity disabled={uploading} accessibilityRole="button" accessibilityLabel={`重试上传 ${item.name}`}
          style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }} onPress={() => onRetryItem(item)}><Text style={{ color: c.primary }}>重试</Text></TouchableOpacity>}
        <TouchableOpacity disabled={uploading} accessibilityRole="button" accessibilityLabel={`移除待上传附件 ${item.name}`} style={{ minHeight: 44, justifyContent: 'center' }} onPress={() => onRemove(item.id)}><Text style={{ color: c.danger }}>移除</Text></TouchableOpacity>
      </View>)}
      </ScrollView>
      {pending.length > 0 && !uploading && <TouchableOpacity accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }} onPress={onRetry}><Text style={{ color: c.primary }}>重试上传</Text></TouchableOpacity>}
    </View>}
  </View>;
}
