import AsyncStorage from '@react-native-async-storage/async-storage';
import { isCurrentSession, type Session } from './session';

// v1 may contain unfiltered responses from Expo's missing URLSearchParams.size.
function key(name: string, session: Session) { return `calendar:${session.scope}:v2:${name}`; }
export async function readCalendarCache<T>(name: string, session: Session): Promise<T | null> {
  if (!session.scope || !isCurrentSession(session)) return null;
  try {
    const raw = await AsyncStorage.getItem(key(name, session));
    return raw && isCurrentSession(session) ? JSON.parse(raw) as T : null;
  } catch { return null; }
}
export async function writeCalendarCache<T>(name: string, value: T, session: Session) {
  if (!session.scope || !isCurrentSession(session)) return;
  await AsyncStorage.setItem(key(name, session), JSON.stringify(value));
}
