import { expect, it } from 'vitest';
import { composePosition } from '../windows/placement';

it('centers the first opening vertically and horizontally and restores exact saved coordinates', () => {
  const area = { x: -1920, y: 100, width: 1920, height: 1000 };
  expect(composePosition(area, 440, 200)).toEqual({ x: -1180, y: 500 });
  expect(composePosition(area, 440, 200, { x: -1500, y: 300 })).toEqual({ x: -1500, y: 300 });
});

it.each([
  { x: -1920, y: 0, width: 1920, height: 1040 },
  { x: 0, y: -1440, width: 2560, height: 1400 },
  { x: 1920, y: 120, width: 1280, height: 984 },
])('keeps all corner anchors inside target work area $x,$y', area => {
  for (const x of [area.x, area.x + area.width / 2, area.x + area.width - 1]) {
    for (const y of [area.y, area.y + area.height / 2, area.y + area.height - 1]) {
      const position = composePosition(area, 440, 500, { x, y });
      expect(position.x).toBeGreaterThanOrEqual(area.x);
      expect(position.y).toBeGreaterThanOrEqual(area.y);
      expect(position.x + 440).toBeLessThanOrEqual(area.x + area.width);
      expect(position.y + 500).toBeLessThanOrEqual(area.y + area.height);
    }
  }
});
