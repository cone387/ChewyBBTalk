import type { BBTalk } from '../types';

const VISIBILITY = {
  public: { label: '公开可见', shortLabel: '公开可见', icon: 'globe-outline' },
  private: { label: '仅自己可见', shortLabel: '仅自己', icon: 'lock-closed-outline' },
  friends: { label: '好友可见', shortLabel: '好友可见', icon: 'people-outline' },
} as const;

export function visibilityPresentation(visibility: BBTalk['visibility'] | string) {
  return VISIBILITY[visibility as keyof typeof VISIBILITY] ?? VISIBILITY.private;
}
