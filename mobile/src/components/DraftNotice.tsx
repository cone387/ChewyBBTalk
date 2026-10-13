import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { listDrafts, onDraftsChange } from '../services/drafts';
import { getSession, isCurrentSession } from '../services/session';
import { useTheme } from '../theme/ThemeContext';

export default function DraftNotice() {
  const [count, setCount] = useState(0);
  const [failed, setFailed] = useState(false);
  const navigation = useNavigation<any>();
  const { theme: { colors: c } } = useTheme();
  useEffect(() => {
    let active = true;
    const session = getSession();
    const refresh = () => { void listDrafts(session).then(entries => {
      if (active && isCurrentSession(session)) { setCount(entries.length); setFailed(false); }
    }).catch(() => { if (active) setFailed(true); }); };
    refresh();
    const unsubscribe = onDraftsChange(refresh);
    const unfocus = navigation.addListener('focus', refresh);
    return () => { active = false; unsubscribe(); unfocus(); };
  }, [navigation]);
  if (!count && !failed) return null;
  return <TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate('Drafts')}
    style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: c.surface }}>
    <Text style={{ color: c.primary, fontSize: 14 }}>{failed ? '未完成记录暂时无法读取 · 点击重试' : `有 ${count} 条未完成记录 · 继续编辑`}</Text>
  </TouchableOpacity>;
}
