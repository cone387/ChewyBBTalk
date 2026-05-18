/**
 * TagParser — extracts inline #tag patterns from content.
 *
 * A valid tag is:
 *   - `#` preceded by start-of-string or whitespace/newline
 *   - Followed by one or more non-whitespace, non-# characters
 *   - Terminated by a space (the space is part of the marker)
 *
 * Example: "hello #world foo" → tags: ["world"], cleaned: "hello foo"
 */

/** Regex matching `#tagname ` patterns (with lookbehind for start/whitespace). */
const TAG_REGEX = /(?:^|(?<=\s))#([^\s#]+)\s/g;

export interface TagParseResult {
  tags: string[];
  cleanedContent: string;
}

/**
 * Extract all unique tag names from content.
 */
export function parseTags(content: string): string[] {
  const tags: string[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(TAG_REGEX.source, TAG_REGEX.flags);
  while ((match = regex.exec(content)) !== null) {
    const tag = match[1];
    if (!tags.includes(tag)) {
      tags.push(tag);
    }
  }
  return tags;
}

/**
 * Remove all `#tagname ` markers from content, preserving other text.
 * Collapses resulting double-spaces and trims.
 */
export function cleanContent(content: string): string {
  return content
    .replace(new RegExp(TAG_REGEX.source, TAG_REGEX.flags), ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Parse tags and produce cleaned content in one pass.
 */
export function parseAndClean(content: string): TagParseResult {
  const tags = parseTags(content);
  const cleanedContent = cleanContent(content);
  return { tags, cleanedContent };
}
