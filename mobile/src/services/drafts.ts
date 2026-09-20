import AsyncStorage from '@react-native-async-storage/async-storage';
import { isCurrentSession, type Session } from './session';

// One queue per key also orders writes across editor remounts.
const queues = new Map<string, Promise<void>>();
export function writeDraft(key: string, value: unknown | null, session: Session): Promise<void> {
  const serialized = value === null ? null : JSON.stringify(value);
  const next = (queues.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
    if (!isCurrentSession(session)) throw new Error('账号已切换，请重新打开编辑器');
    if (serialized === null) await AsyncStorage.removeItem(key);
    else await AsyncStorage.setItem(key, serialized);
  });
  queues.set(key, next);
  void next.finally(() => { if (queues.get(key) === next) queues.delete(key); }).catch(() => {});
  return next;
}

export async function readDraft(key: string): Promise<string | null> {
  await queues.get(key)?.catch(() => {});
  return AsyncStorage.getItem(key);
}

export async function waitForDraftWrites(scope: string) {
  await Promise.allSettled([...queues.entries()].filter(([key]) => key.startsWith(`compose_draft:${scope}`)).map(([, promise]) => promise));
}
