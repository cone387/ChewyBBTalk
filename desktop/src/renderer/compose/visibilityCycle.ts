/**
 * Visibility cycle helper.
 * Cycles: private → public → friends → private
 */

export type Visibility = 'public' | 'private';

const CYCLE: Visibility[] = ['private', 'public'];

/**
 * Returns the next visibility in the cycle.
 */
export function nextVisibility(current: Visibility): Visibility {
  const idx = CYCLE.indexOf(current);
  return CYCLE[(idx + 1) % CYCLE.length];
}

/**
 * Returns a display label for the visibility value.
 */
export function visibilityLabel(v: Visibility): string {
  switch (v) {
    case 'private':
      return '仅自己';
    case 'public':
      return '公开';
  }
}

/**
 * Returns an emoji icon for the visibility value.
 */
export function visibilityIcon(v: Visibility): string {
  switch (v) {
    case 'private':
      return '🔒';
    case 'public':
      return '🌐';
  }
}
