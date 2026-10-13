import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { listOutbox, onOutboxChange, type QueuedSubmission } from '../services/outbox';
import { getSession, isCurrentSession } from '../services/session';
import { useTheme } from '../theme/ThemeContext';

export default function OutboxNotice() {
  const navigation = useNavigation<any>();
  const { theme: { colors: c } } = useTheme();
  const [items, setItems] = useState<QueuedSubmission[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const session = getSession();
    const refresh = () => { void listOutbox(session).then(value => {
      if (active && isCurrentSession(session)) { setItems(value); setError(false); }
    }).catch(() => { if (active) setError(true); }); };
    refresh(); const stop = onOutboxChange(refresh);
    const focus = navigation.addListener('focus', refresh);
    return () => { active = false; stop(); focus(); };
  }, [navigation]);
  if (!items.length && !error) return null;
  const pending = items.filter(item => item.state !== 'synced');
  const problem = pending.some(item => ['failed', 'conflict'].includes(item.state));
  const syncing = pending.some(item => item.state === 'syncing');
  return <TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate('Outbox')}
    style={{ minHeight: 48, padding: 16, justifyContent: 'center', backgroundColor: c.surface }}>
    <Text accessibilityLiveRegion="polite" style={{ color: problem || error ? c.danger : c.primary, fontSize: 14 }}>
      {error ? '无法读取同步状态 · 点击重试' : pending.length ? `${pending.length} 条记录已保存在本机 · ${problem ? '需要处理' : syncing ? '正在同步…' : '等待同步'}` : '已保存到服务器 · 查看同步记录'}
    </Text>
  </TouchableOpacity>;
}
