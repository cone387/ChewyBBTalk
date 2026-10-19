import React, { useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { HeaderHeightContext } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { welcomeApi, type WelcomeConfig, type WelcomeQuote } from '../services/api/welcomeApi';
import { createPrivacyOperation } from '../services/privacyOperation';
import WelcomeCard from '../components/WelcomeCard';

export default function WelcomeSettingsScreen() {
  const { theme } = useTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const [config, setConfig] = useState<WelcomeConfig | null>(null);
  const [text, setText] = useState('');
  const [source, setSource] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [preview, setPreview] = useState<WelcomeQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(false);
  const alive = useRef(true);
  const pending = useRef(false);
  const scroll = useRef<ScrollView>(null);

  const load = async () => {
    const operation = createPrivacyOperation();
    if (pending.current || !operation.isCurrent()) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const result = await welcomeApi.get();
      if (alive.current && operation.isCurrent()) { setConfig(result); setReload(false); }
      else if (alive.current) { setError('页面已重新锁定或切到后台，请重新载入文案池。草稿会保留。'); setReload(true); }
    } catch {
      if (alive.current && operation.isCurrent()) { setError('暂时无法载入文案，请重试。'); setReload(true); }
      else if (alive.current) { setError('请求已中断，请重新载入文案池。'); setReload(true); }
    } finally { pending.current = false; if (alive.current) setBusy(false); }
  };
  useEffect(() => { alive.current = true; void load(); return () => { alive.current = false; }; }, []);

  const save = async (next: WelcomeConfig, clearDraft = false) => {
    const operation = createPrivacyOperation();
    if (pending.current || reload || !operation.isCurrent()) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const result = await welcomeApi.save(next);
      if (alive.current && operation.isCurrent()) {
        setConfig(result);
        if (clearDraft) { setText(''); setSource(''); setEditing(null); }
      }
      else if (alive.current) { setError('页面已切到后台或重新锁定。请载入最新文案池，确认保存结果；草稿会保留。'); setReload(true); }
    } catch (cause) {
      if (alive.current && operation.isCurrent()) {
        const conflict = (cause as { status?: number }).status === 409;
        setError(conflict ? '文案池已在其他设备更新。重新载入后可继续编辑，草稿会保留。' : '保存失败，草稿已保留，请重试。');
        setReload(conflict);
      }
      else if (alive.current) { setError('请求已中断，请载入最新文案池后重试。草稿会保留。'); setReload(true); }
    } finally { pending.current = false; if (alive.current) setBusy(false); }
  };
  const add = () => {
    if (!config) return;
    const body = text.trim();
    if (!body) { setError('先写下一句话吧。'); return; }
    if (config.quotes.some(item => item.id !== editing && item.text === body)) { setError('这句话已经在文案池里了。'); return; }
    if (!editing && config.quotes.length >= 200) { setError('文案池最多保存 200 条。'); return; }
    if (editing && !config.quotes.some(item => item.id === editing)) {
      setEditing(null); setError('原文案已被删除。草稿已保留，可作为新文案加入。'); return;
    }
    const quote = { id: editing ?? `native-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`, text: body, source: source.trim() };
    void save({ ...config, quotes: editing ? config.quotes.map(item => item.id === editing ? quote : item) : [...config.quotes, quote] }, true);
  };
  const button = (label: string, action: () => void, accessibilityLabel = label, primary = false) => <TouchableOpacity
    accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled: busy }} disabled={busy}
    onPress={action} style={[styles.button, { backgroundColor: primary ? c.primary : c.surfaceSecondary }]}>
    <Text style={{ color: primary ? '#fff' : c.primary, fontWeight: '600', fontSize: 15 }}>{label}</Text>
  </TouchableOpacity>;

  if (preview) return <WelcomeCard quote={preview} preview onEnter={() => setPreview(null)} />;
  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={headerHeight}>
    <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
      <Text style={[styles.title, { color: c.text }]}>把喜欢的话，写在今天之前。</Text>
      <Text style={[styles.description, { color: c.textSecondary }]}>只展示你自己的文案。每次重新打开应用，从文案池中选一句；一轮内不重复，两条以上时避免连续相同。</Text>
      {error ? <View accessibilityLiveRegion="polite" style={[styles.card, { backgroundColor: c.surfaceSecondary }]}>
        <Text style={{ color: c.danger }}>{error}</Text>
        {reload && button('重新载入', () => void load())}
      </View> : null}
      {busy && <ActivityIndicator color={c.primary} />}
      {config && <>
        <View style={[styles.card, styles.row, { backgroundColor: c.cardBg }]}>
          <View style={{ flex: 1 }}><Text style={[styles.label, { color: c.text }]}>开启文案欢迎页</Text><Text style={{ color: c.textSecondary, marginTop: 6 }}>与 Web 同步，关闭后直接进入记录</Text></View>
          <Switch accessibilityLabel="开启文案欢迎页" value={config.enabled} disabled={busy || reload} onValueChange={enabled => void save({ ...config, enabled })} trackColor={{ true: c.primary }} />
        </View>
        <View style={[styles.card, { backgroundColor: c.cardBg }]}>
          <Text style={[styles.label, { color: c.text }]}>{editing ? '编辑这句话' : '写下一句'}</Text>
          <TextInput accessibilityLabel="文案正文" placeholder="想在下一次打开时遇见的话…" placeholderTextColor={c.textTertiary} multiline maxLength={1000} value={text} onChangeText={setText} editable={!busy}
            style={[styles.input, { minHeight: 120, textAlignVertical: 'top', color: c.text, borderColor: c.border }]} />
          <Text style={{ color: c.textSecondary, textAlign: 'right' }}>{text.length} / 1000</Text>
          <TextInput accessibilityLabel="出处（可选）" placeholder="出处（可选）" placeholderTextColor={c.textTertiary} maxLength={200} value={source} onChangeText={setSource} editable={!busy}
            style={[styles.input, { color: c.text, borderColor: c.border }]} />
          {button(editing ? '保存修改' : '加入文案池', add, undefined, true)}
          {editing && button('取消编辑', () => { setEditing(null); setText(''); setSource(''); })}
        </View>
        <Text style={[styles.label, { color: c.text }]}>我的文案池 · {config.quotes.length}</Text>
        {!config.quotes.length && <View style={[styles.card, { backgroundColor: c.cardBg }]}><Text style={{ color: c.text }}>还没有文案</Text><Text style={[styles.description, { color: c.textSecondary }]}>加入第一句，开启后下次启动就能遇见它。文案池为空时直接进入记录。</Text></View>}
        {config.quotes.map((quote, index) => <View key={quote.id} style={[styles.card, { backgroundColor: c.cardBg }]}>
          <Text selectable style={{ color: c.text, fontSize: 17, lineHeight: 28 }}>{quote.text}</Text>
          {!!quote.source && <Text style={{ color: c.textSecondary }}>— {quote.source}</Text>}
          <View style={styles.actions}>
            {button('预览', () => setPreview(quote), `预览文案 ${index + 1}`)}
            {button('编辑', () => { setEditing(quote.id); setText(quote.text); setSource(quote.source); scroll.current?.scrollTo({ y: 0, animated: true }); }, `编辑文案 ${index + 1}`)}
            {button('删除', () => void save({ ...config, quotes: config.quotes.filter(item => item.id !== quote.id) }), `删除文案 ${index + 1}`)}
          </View>
        </View>)}
      </>}
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 18, width: '100%', maxWidth: 760, alignSelf: 'center' },
  title: { fontSize: 27, fontWeight: '700', lineHeight: 38, marginTop: 12 },
  description: { fontSize: 14, lineHeight: 23 },
  card: { padding: 18, borderRadius: 20, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  label: { fontSize: 17, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 12, padding: 13, fontSize: 16, lineHeight: 25, minHeight: 48 },
  button: { minHeight: 46, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
