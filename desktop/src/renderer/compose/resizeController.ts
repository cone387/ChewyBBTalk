/**
 * ResizeController — calculates the target Compose window height
 * based on content dimensions, file preview, and tag bar.
 */

export const MIN_WINDOW_HEIGHT = 160;
export const MAX_WINDOW_HEIGHT = 500;
export const MAX_TEXTAREA_HEIGHT = 300;
export const TITLEBAR_HEIGHT = 32;
export const TOOLBAR_HEIGHT = 38;
export const FILE_PREVIEW_HEIGHT = 96;
export const TAG_BAR_HEIGHT = 32;

/** Minimum textarea visible area (2 lines at ~20px line-height + padding). */
const MIN_TEXTAREA_HEIGHT = 56;

export interface ResizeDimensions {
  /** Current scrollHeight of the textarea content. */
  textareaHeight: number;
  /** Whether the file preview area is visible. */
  hasFilePreview: boolean;
  /** Height of the file preview area (0 if hidden). */
  filePreviewHeight: number;
  /** Height of the tag pills bar (0 if no tags). */
  tagBarHeight: number;
}

/**
 * Calculate the target window height based on content dimensions.
 * Sums: titlebar + textarea (capped) + file preview + tag bar + toolbar.
 * Result is clamped to [MIN_WINDOW_HEIGHT, MAX_WINDOW_HEIGHT].
 */
export function calculateWindowHeight(dimensions: ResizeDimensions): number {
  const textareaH = Math.max(
    MIN_TEXTAREA_HEIGHT,
    Math.min(dimensions.textareaHeight, MAX_TEXTAREA_HEIGHT),
  );

  const filePreviewH = dimensions.hasFilePreview
    ? Math.min(dimensions.filePreviewHeight, FILE_PREVIEW_HEIGHT)
    : 0;

  const tagBarH = dimensions.tagBarHeight > 0 ? dimensions.tagBarHeight : 0;

  const total = TITLEBAR_HEIGHT + textareaH + filePreviewH + tagBarH + TOOLBAR_HEIGHT;

  return Math.max(MIN_WINDOW_HEIGHT, Math.min(MAX_WINDOW_HEIGHT, total));
}
