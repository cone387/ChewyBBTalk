import { visibilityPresentation } from '../../src/utils/visibilityPresentation';

it('distinguishes friends from private on every visibility label', () => {
  expect(visibilityPresentation('friends')).toEqual({ label: '好友可见', shortLabel: '好友可见', icon: 'people-outline' });
  expect(visibilityPresentation('private').label).toBe('仅自己可见');
  expect(visibilityPresentation('public').label).toBe('公开可见');
});
