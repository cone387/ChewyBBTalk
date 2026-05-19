// Feature: mobile-ui-appstore-ready, Property 2: Animation duration respects reduced motion preference
import * as fc from 'fast-check';
import { getAnimationDuration, ANIMATION_DURATION } from '../../src/utils/animationConfig';

describe('Property 2: Animation duration respects reduced motion preference', () => {
  it('returns 0 when reduced motion is true', () => {
    fc.assert(
      fc.property(fc.constant(true), (reducedMotion) => {
        expect(getAnimationDuration(reducedMotion)).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it('returns a value between 200 and 300 (inclusive) when reduced motion is false', () => {
    fc.assert(
      fc.property(fc.constant(false), (reducedMotion) => {
        const duration = getAnimationDuration(reducedMotion);
        expect(duration).toBeGreaterThanOrEqual(200);
        expect(duration).toBeLessThanOrEqual(300);
      }),
      { numRuns: 100 },
    );
  });

  it('ANIMATION_DURATION constant is within 200-300ms range', () => {
    expect(ANIMATION_DURATION).toBeGreaterThanOrEqual(200);
    expect(ANIMATION_DURATION).toBeLessThanOrEqual(300);
  });
});
