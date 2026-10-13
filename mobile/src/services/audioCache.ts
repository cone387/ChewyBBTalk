import * as FileSystem from 'expo-file-system/legacy';
import type { Attachment } from '../types';

/** A bounded filename for a server/account/source identity, not an auth token. */
export function audioCachePath(attachment: Attachment, scope: string | null): string {
  const identity = JSON.stringify([scope, attachment.uid, attachment.url]);
  let first = 0x811c9dc5, second = 0x1505;
  for (let index = 0; index < identity.length; index++) {
    const value = identity.charCodeAt(index);
    first = Math.imul(first ^ value, 0x01000193);
    second = Math.imul(second, 33) ^ value;
  }
  const key = [first, second].map(value => (value >>> 0).toString(16).padStart(8, '0')).join('');
  const ext = /\.([a-z0-9]{1,8})$/i.exec(attachment.filename || '')?.[1] || 'm4a';
  // v2 deliberately does not trust old unscoped or interrupted cache files.
  return `${FileSystem.cacheDirectory}audio_v2_${key}.${ext}`;
}

let sequence = 0;
export function audioStagingPath(destination: string): string {
  return `${destination}.${Date.now()}_${++sequence}.part`;
}
