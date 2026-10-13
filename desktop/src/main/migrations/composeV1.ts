import type { SettingsSchema } from '../store';
import type { SubmissionIntent, SubmissionPayload } from '../../shared/ipc-types';

/** One-time persisted-data migration. Legacy fields never cross the API boundary. */
export function migrateComposeV1(compose: SettingsSchema['compose']): SettingsSchema['compose'] {
  if ((compose.submissionsVersion ?? 0) >= 1) return compose;
  type HistoricalIntent = Omit<SubmissionIntent, 'payload'> & {
    payload: Omit<SubmissionPayload, 'tags'> & { tags?: string[]; post_tags?: string };
  };
  const submissions = Object.fromEntries(Object.entries(compose.submissions ?? {}).map(([scope, saved]) => {
    const intent = saved as HistoricalIntent;
    const { post_tags, ...payload } = intent.payload;
    const migrated = !Array.isArray(payload.tags) || typeof post_tags === 'string';
    const tags = payload.tags ?? [...new Set((post_tags ?? '').split(',').map(tag => tag.trim()).filter(Boolean))];
    return [scope, {
      ...intent, payload: { ...payload, tags },
      ...(migrated && intent.state === 'pending' ? { receiptCheckRequired: true } : {}),
    }];
  }));
  return { ...compose, submissions, submissionsVersion: 1 };
}
