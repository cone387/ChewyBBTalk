/**
 * Animation configuration utilities.
 * Centralizes duration values and respects reduced motion preferences.
 */

/** Standard animation duration in milliseconds (200-300ms range per design system) */
export const ANIMATION_DURATION = 250;

/**
 * Returns the appropriate animation duration based on the user's reduced motion preference.
 * @param reducedMotion - Whether the user prefers reduced motion
 * @returns 0 when reduced motion is enabled, ANIMATION_DURATION (250ms) otherwise
 */
export function getAnimationDuration(reducedMotion: boolean): number {
  return reducedMotion ? 0 : ANIMATION_DURATION;
}
