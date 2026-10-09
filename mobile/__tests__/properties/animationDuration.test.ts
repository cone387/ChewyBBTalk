// Feature: mobile-ui-appstore-ready, Property 2: Animation duration respects reduced motion preference
import { getAnimationDuration, ANIMATION_DURATION } from '../../src/utils/animationConfig';

describe('Property 2: Animation duration respects reduced motion preference', () => {
  it.each([
    { reducedMotion: true, expected: 0 },
    { reducedMotion: false, expected: ANIMATION_DURATION },
  ])('respects reduced motion = $reducedMotion', ({ reducedMotion, expected }) => {
    expect(getAnimationDuration(reducedMotion)).toBe(expected);
  });

  it('ANIMATION_DURATION constant is within 200-300ms range', () => {
    expect(ANIMATION_DURATION).toBeGreaterThanOrEqual(200);
    expect(ANIMATION_DURATION).toBeLessThanOrEqual(300);
  });
});
