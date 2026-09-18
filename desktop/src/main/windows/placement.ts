interface Area { x: number; y: number; width: number; height: number }
/** Coordinates are Electron logical pixels, including negative monitor origins. */
export function composePosition(area: Area, width: number, height: number, saved?: { x: number; y: number }) {
  const x = saved ? saved.x : area.x + (area.width - width) / 2;
  const y = saved ? saved.y : area.y + (area.height - height) / 2;
  return {
    x: Math.round(Math.max(area.x, Math.min(x, area.x + area.width - width))),
    y: Math.round(Math.max(area.y, Math.min(y, area.y + area.height - height))),
  };
}
