import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { writeDraft } from '../services/drafts';
import { isCurrentSession, type Session } from '../services/session';

export function useDraftAutosave(key: string, value: unknown | null, ready: boolean, session: Session) {
  const [status, setStatus] = useState('');
  const stopped = useRef(false);
  const mounted = useRef(true);
  const latest = useRef({ key, value, ready });
  latest.current = { key, value, ready };
  const revision = useRef(0);
  const save = useCallback(async () => {
    const snapshot = latest.current;
    if (!snapshot.ready || stopped.current || !isCurrentSession(session)) return;
    const current = ++revision.current;
    if (mounted.current) setStatus('正在保存到本机…');
    try {
      await writeDraft(snapshot.key, snapshot.value, session);
      if (mounted.current && current === revision.current && !stopped.current) setStatus(snapshot.value ? '草稿已保存到本机' : '');
    } catch (error) {
      if (mounted.current && current === revision.current) setStatus('本机保存失败，请重试');
      throw error;
    }
  }, [session]);
  const serialized = JSON.stringify(value);
  useEffect(() => {
    if (!ready || stopped.current) return;
    ++revision.current;
    setStatus(value ? '尚有修改未保存' : '');
    const timer = setTimeout(() => { void save().catch(() => {}); }, 400);
    return () => clearTimeout(timer);
  }, [key, serialized, ready, save]);
  useEffect(() => {
    mounted.current = true;
    const listener = AppState.addEventListener('change', state => {
      if (state !== 'active') void save().catch(() => {});
    });
    return () => { mounted.current = false; listener.remove(); void save().catch(() => {}); };
  }, [save]);
  const clear = useCallback(async () => {
    stopped.current = true;
    ++revision.current;
    try { await writeDraft(latest.current.key, null, session); }
    catch (error) { stopped.current = false; throw error; }
  }, [session]);
  const resume = useCallback(() => { stopped.current = false; setStatus(''); }, []);
  return { status, save, clear, resume };
}
