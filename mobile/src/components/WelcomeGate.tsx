import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { getSession, isCurrentSession, onSessionChange, type Session } from '../services/session';
import { dismissWelcomeOpening, getWelcomeOpening, welcomeOpeningDismissed } from '../services/welcomeOpening';
import { welcomeApi, type WelcomeQuote } from '../services/api/welcomeApi';
import { createPrivacyOperation } from '../services/privacyOperation';
import { historyIsLocked, historyPrivacyIsReady, subscribeHistoryPrivacy, recordHistoryActivity } from '../services/historyPrivacy';
import { useTheme } from '../theme/ThemeContext';
import WelcomeCard from './WelcomeCard';

type Props = React.PropsWithChildren<{ onSettings: () => void }>;
export default function WelcomeGate(props: Props) {
  const session = useSyncExternalStore(onSessionChange, getSession, getSession);
  return <Opening key={session.generation} {...props} session={session} />;
}

function Opening({ session, children, onSettings }: Props & { session: Session }) {
  const [done, setDone] = useState(() => welcomeOpeningDismissed(session));
  const locked = useSyncExternalStore(subscribeHistoryPrivacy, historyIsLocked, historyIsLocked);
  const ready = useSyncExternalStore(subscribeHistoryPrivacy, historyPrivacyIsReady, historyPrivacyIsReady);
  const opened = useRef(false);
  const showing = ready && !locked && !done;
  if (showing) opened.current = true;
  const enter = () => { dismissWelcomeOpening(session); setDone(true); };
  // Keep Home mounted: its lock screen owns unlock and locked quick-compose.
  return <View style={{ flex: 1 }} onTouchStart={recordHistoryActivity}>
    <View style={{ flex: 1, display: showing ? 'none' : 'flex' }} accessibilityElementsHidden={showing} importantForAccessibility={showing ? 'no-hide-descendants' : 'auto'}>{children}</View>
    {opened.current && !done && <View style={{ flex: 1, display: showing ? 'flex' : 'none' }} accessibilityElementsHidden={!showing} importantForAccessibility={showing ? 'auto' : 'no-hide-descendants'}>
      <OpeningContent session={session} onEnter={enter} onSettings={() => { enter(); onSettings(); }} />
    </View>}
  </View>;
}

function OpeningContent({ session, onEnter, onSettings }: { session: Session; onEnter: () => void; onSettings: () => void }) {
  const [quote, setQuote] = useState<WelcomeQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);
  const sending = useRef(false);
  const enter = useRef(onEnter);
  enter.current = onEnter;
  const { theme } = useTheme();
  useEffect(() => {
    alive.current = true;
    const opening = getWelcomeOpening(session);
    opening.quote.then(value => {
      if (!alive.current || !isCurrentSession(session)) return;
      if (value) setQuote(value); else enter.current();
    });
    return () => { alive.current = false; };
  }, [session]);
  const next = async () => {
    const operation = createPrivacyOperation();
    if (sending.current || !operation.isCurrent()) return;
    sending.current = true; setBusy(true); setError('');
    try {
      const result = await welcomeApi.next();
      if (alive.current && operation.isCurrent()) {
        if (result.quote) setQuote(result.quote); else onEnter();
      }
    } catch {
      if (alive.current && operation.isCurrent()) setError('暂时无法换句，请重试或进入记录。');
    } finally { sending.current = false; if (alive.current) setBusy(false); }
  };
  if (!quote) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, backgroundColor: theme.colors.background }}>
    <ActivityIndicator color={theme.colors.primary} /><Text style={{ color: theme.colors.textSecondary }}>正在打开你的扉页…</Text>
    <TouchableOpacity accessibilityRole="button" onPress={onEnter} style={{ padding: 16, minHeight: 48 }}><Text style={{ color: theme.colors.primary }}>直接进入记录</Text></TouchableOpacity>
  </View>;
  return <WelcomeCard quote={quote} busy={busy} error={error} onEnter={onEnter} onNext={() => void next()} onSettings={onSettings} />;
}
