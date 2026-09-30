import { expect, it } from 'vitest';
import { parseTags, cleanContent, parseAndClean } from '../tagParser';
import { nextVisibility, visibilityLabel, visibilityIcon } from '../visibilityCycle';
import { calculateWindowHeight } from '../resizeController';

it.each([
  ['hello #work notes #work done #life end', ['work', 'life'], 'hello notes done end'],
  ['#旅行 日记 #work 内容', ['旅行', 'work'], '日记 内容'],
  ['C# code and incomplete #tag', [], 'C# code and incomplete #tag'],
  ['## heading and # normal text', [], '## heading and # normal text'],
  ['#first\n#second\tcontent', ['first', 'second'], 'content'],
  ['', [], ''],
])('extracts only completed tag markers from %s', (content, tags, cleanedContent) => {
  expect(parseAndClean(content as string)).toEqual({ tags, cleanedContent });
});

it('does not retain regex state across parser calls or change non-tag content', () => {
  expect(parseTags('#work note')).toEqual(['work']);
  expect(parseTags('#work note')).toEqual(['work']);
  expect(cleanContent('one two')).toBe('one two');
});

it('cycles only between supported visibility states and presents matching labels', () => {
  expect(nextVisibility('private')).toBe('public');
  expect(nextVisibility('public')).toBe('private');
  expect(visibilityLabel('private')).toBe('仅自己');
  expect(visibilityLabel('public')).toBe('公开');
  expect(visibilityIcon('private')).toBe('🔒');
  expect(visibilityIcon('public')).toBe('🌐');
});

it.each([
  [{ textareaHeight: 0, hasFilePreview: false, filePreviewHeight: 200, tagBarHeight: 0 }, 160],
  [{ textareaHeight: 100, hasFilePreview: false, filePreviewHeight: 200, tagBarHeight: 0 }, 170],
  [{ textareaHeight: 100, hasFilePreview: true, filePreviewHeight: 96, tagBarHeight: 32 }, 298],
  [{ textareaHeight: 1000, hasFilePreview: true, filePreviewHeight: 1000, tagBarHeight: 1000 }, 500],
  [{ textareaHeight: 100, hasFilePreview: false, filePreviewHeight: 0, tagBarHeight: -1 }, 170],
])('bounds compose height for %j', (dimensions, height) => {
  expect(calculateWindowHeight(dimensions)).toBe(height);
});
