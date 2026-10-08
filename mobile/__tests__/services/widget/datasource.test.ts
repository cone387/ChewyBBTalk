import { selectWidgetItems, toWidgetItem } from '../../../src/services/widget/datasource';
import type { BBTalk } from '../../../src/types';
import type { WidgetConfig } from '../../../src/services/widget/types';

const config = (overrides: Partial<WidgetConfig> = {}): WidgetConfig => ({
  strategy: 'recent', recentCount: 5, tagIds: [], manualUids: [], includePrivate: false,
  ...overrides,
});

const talk = (id: string, updatedAt: string, opts: Partial<BBTalk> = {}): BBTalk => ({
  id, content: `content-${id}`, visibility: 'public', tags: [], attachments: [],
  createdAt: updatedAt, updatedAt, ...opts,
});

describe('selectWidgetItems strategy ordering', () => {
  it('pinned keeps only pinned talks sorted by updatedAt descending', () => {
    const talks = [
      talk('plain', '2026-01-07T00:00:00.000Z'),
      talk('p2', '2026-01-03T00:00:00.000Z', { isPinned: true }),
      talk('p1', '2026-01-05T00:00:00.000Z', { isPinned: true }),
    ];
    const items = selectWidgetItems(config({ strategy: 'pinned' }), talks);
    expect(items.map((i) => i.uid)).toEqual(['p1', 'p2']);
  });

  it('pinned honors the recentCount limit', () => {
    const talks = [
      talk('p0', '2026-01-06T00:00:00.000Z', { isPinned: true }),
      talk('p1', '2026-01-05T00:00:00.000Z', { isPinned: true }),
      talk('p2', '2026-01-03T00:00:00.000Z', { isPinned: true }),
      talk('p3', '2026-01-01T00:00:00.000Z', { isPinned: true }),
    ];
    const items = selectWidgetItems(config({ strategy: 'pinned', recentCount: 3 }), talks);
    expect(items.map((i) => i.uid)).toEqual(['p0', 'p1', 'p2']);
  });

  it('recent puts pinned first, then newest updates', () => {
    const talks = [
      talk('n2', '2026-01-07T00:00:00.000Z'),
      talk('p1', '2026-01-02T00:00:00.000Z', { isPinned: true }),
      talk('n1', '2026-01-06T00:00:00.000Z'),
    ];
    const items = selectWidgetItems(config(), talks);
    expect(items.map((i) => i.uid)).toEqual(['p1', 'n2', 'n1']);
  });

  it('recent does not reorder the input array in place', () => {
    const talks = [talk('a', '2026-01-01T00:00:00.000Z'), talk('b', '2026-01-02T00:00:00.000Z')];
    selectWidgetItems(config(), talks);
    expect(talks.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('tags keeps only talks matching a configured tag id, newest first', () => {
    const tagA = { id: 'tag-a', name: 'A', color: '#111111' };
    const other = { id: 'tag-b', name: 'B', color: '#222222' };
    const talks = [
      talk('t2', '2026-01-02T00:00:00.000Z', { tags: [other] }),
      talk('a1', '2026-01-03T00:00:00.000Z', { tags: [tagA] }),
      talk('a2', '2026-01-04T00:00:00.000Z', { tags: [other, tagA] }),
    ];
    const items = selectWidgetItems(config({ strategy: 'tags', tagIds: ['tag-a'] }), talks);
    expect(items.map((i) => i.uid)).toEqual(['a2', 'a1']);
  });

  it('manual caps the output at ten items in config order', () => {
    const talks = Array.from({ length: 12 }, (_, i) => talk(`u${i}`, `2026-01-01T00:00:0${i % 10}.000Z`));
    const manualUids = [...talks.map((t) => t.id)].reverse();
    const items = selectWidgetItems(config({ strategy: 'manual', manualUids }), talks);
    expect(items.map((i) => i.uid)).toEqual(manualUids.slice(0, 10));
  });

  it('filters non-public talks unless includePrivate is on', () => {
    const talks = [
      talk('pub', '2026-01-01T00:00:00.000Z'),
      talk('priv', '2026-01-02T00:00:00.000Z', { visibility: 'private' }),
    ];
    expect(selectWidgetItems(config(), talks).map((i) => i.uid)).toEqual(['pub']);
    expect(selectWidgetItems(config({ includePrivate: true }), talks).map((i) => i.uid)).toEqual(['priv', 'pub']);
  });
});

describe('toWidgetItem details', () => {
  it('detects the first image through type or mimeType', () => {
    const mixed: BBTalk = {
      ...talk('x', '2026-01-01T00:00:00.000Z'),
      attachments: [
        { uid: 'a1', url: 'https://e.example/audio.mp3', type: 'audio' },
        { uid: 'a2', url: 'https://e.example/photo.png', type: 'file', mimeType: 'image/png' },
        { uid: 'a3', url: 'https://e.example/second.jpg', type: 'image' },
      ],
    };
    expect(toWidgetItem(mixed).thumbnailUrl).toBe('https://e.example/photo.png');
  });

  it('uses an explicit image type even without mimeType', () => {
    const only: BBTalk = {
      ...talk('x', '2026-01-01T00:00:00.000Z'),
      attachments: [{ uid: 'a1', url: 'https://e.example/pic.jpg', type: 'image' }],
    };
    expect(toWidgetItem(only).thumbnailUrl).toBe('https://e.example/pic.jpg');
  });

  it('coerces a missing isPinned flag to false', () => {
    const item = toWidgetItem(talk('x', '2026-01-01T00:00:00.000Z'));
    expect(item.isPinned).toBe(false);
    expect(item.thumbnailUrl).toBeNull();
    expect(item.uid).toBe('x');
  });
});
