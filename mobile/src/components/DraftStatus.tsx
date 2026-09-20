import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import type { PendingMedia } from '../services/pendingMedia';

export default function DraftStatus({ visibility, onVisibility, status, onSave, pending, uploading, error, onRetry, onRemove }: {
  visibility: string; onVisibility: () => void; status: string; onSave: () => void;
  pending: PendingMedia[]; uploading: boolean; error: string; onRetry: () => void; onRemove: (id: string) => void;
}) {
  const { theme: { colors: c } } = useTheme();
  return <View style={{ backgroundColor: c.surface, paddingHorizontal: 16 }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="修改可见性" onPress={onVisibility} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name={visibility === 'public' ? 'globe-outline' : 'lock-closed-outline'} size={16} color={c.textSecondary} />
        <Text style={{ color: c.textSecondary, fontSize: 13 }}>{visibility === 'public' ? '公开可见' : '仅自己可见'}</Text>
        <Ionicons name="chevron-down" size={12} color={c.textSecondary} />
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="重试保存草稿" onPress={onSave} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text accessibilityLiveRegion="polite" style={{ color: status.includes('失败') ? c.danger : c.textSecondary, fontSize: 12 }}>{status}</Text>
      </TouchableOpacity>
    </View>
    {(pending.length > 0 || error) && <View style={{ paddingBottom: 8 }}>
      <Text accessibilityLiveRegion="polite" style={{ color: c.textSecondary, fontSize: 13 }}>{uploading ? '正在上传附件…' : error || '附件待上传，草稿保存在本机'}</Text>
      {pending.map(item => <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: 13 }}>{item.name.startsWith('voice_') ? '语音记录' : item.name}</Text>
        <TouchableOpacity disabled={uploading} accessibilityRole="button" accessibilityLabel={`移除待上传附件 ${item.name}`} style={{ minHeight: 44, justifyContent: 'center' }} onPress={() => onRemove(item.id)}><Text style={{ color: c.danger }}>移除</Text></TouchableOpacity>
      </View>)}
      {pending.length > 0 && !uploading && <TouchableOpacity accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }} onPress={onRetry}><Text style={{ color: c.primary }}>重试上传</Text></TouchableOpacity>}
    </View>}
  </View>;
}
