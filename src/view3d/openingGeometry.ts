import { type OpeningSpan, type WallFrame, openingSpan, wallPoint } from '../domain/room/openings';
import type { Opening, Room } from '../domain/schema/project';
import { inches } from '../domain/units/units';
import type { WallHole } from './wallGeometry';

/** The holes each wall needs for its doors and windows (indexed like `room.walls`). */
export function wallHoles(room: Room): WallHole[][] {
  const holes: WallHole[][] = room.walls.map(() => []);
  for (const o of room.openings) {
    const s = openingSpan(room, o);
    if (s) holes[s.wallIndex]!.push({ start: s.start, end: s.end, bottom: o.sill, top: o.sill + o.height });
  }
  return holes;
}

export type OpeningMaterial = 'trim' | 'leaf' | 'glass';

export interface OpeningBox {
  /** Size along the wall, up, and across the wall. */
  size: [number, number, number];
  /** Center in world coordinates. */
  pos: [number, number, number];
  material: OpeningMaterial;
}

const TRIM_W = inches(2.5);
const TRIM_D = inches(0.75);
const FRAME = inches(1.75);
const LEAF_T = inches(1.75);
const LEAF_GAP = inches(0.125);
const GLASS_T = 0.006;

/**
 * Boxes that dress an opening in 3D: casing on the interior face, door leaves
 * (shown closed), and window or slider frames with glass. Boxes are axis-aligned
 * to the wall: rotate each by `rotationY` about its center.
 */
export function openingBoxes(o: Opening, span: OpeningSpan, f: WallFrame, thickness: number, ceiling: number) {
  const boxes: OpeningBox[] = [];
  const { start, end } = span;
  const bottom = Math.min(o.sill, ceiling);
  const top = Math.min(o.sill + o.height, ceiling);
  if (top - bottom < 1e-3) return { rotationY: 0, boxes };

  // `out` is measured from the interior face away from the room.
  const box = (u0: number, u1: number, y0: number, y1: number, out0: number, out1: number, material: OpeningMaterial) => {
    if (u1 - u0 < 1e-4 || y1 - y0 < 1e-4) return;
    const p = wallPoint(f, (u0 + u1) / 2, (out0 + out1) / 2);
    boxes.push({ size: [u1 - u0, y1 - y0, Math.abs(out1 - out0)], pos: [p[0], (y0 + y1) / 2, p[1]], material });
  };
  const framedGlass = (u0: number, u1: number, y0: number, y1: number, out0: number, out1: number, mullion: boolean) => {
    box(u0, u0 + FRAME, y0, y1, out0, out1, 'trim');
    box(u1 - FRAME, u1, y0, y1, out0, out1, 'trim');
    box(u0 + FRAME, u1 - FRAME, y0, y0 + FRAME, out0, out1, 'trim');
    box(u0 + FRAME, u1 - FRAME, y1 - FRAME, y1, out0, out1, 'trim');
    if (mullion) box((u0 + u1) / 2 - FRAME / 2, (u0 + u1) / 2 + FRAME / 2, y0 + FRAME, y1 - FRAME, out0, out1, 'trim');
    const mid = (out0 + out1) / 2;
    box(u0 + FRAME, u1 - FRAME, y0 + FRAME, y1 - FRAME, mid - GLASS_T / 2, mid + GLASS_T / 2, 'glass');
  };

  // Casing around the opening on the interior face, kept within the wall.
  const left = Math.max(0, start - TRIM_W);
  const right = Math.min(f.length, end + TRIM_W);
  box(left, start, bottom, top, -TRIM_D, 0, 'trim');
  box(end, right, bottom, top, -TRIM_D, 0, 'trim');
  if (top + TRIM_W <= ceiling) box(left, right, top, top + TRIM_W, -TRIM_D, 0, 'trim');

  const leafT = Math.min(LEAF_T, thickness);
  const leafOut: [number, number] = o.swing === 'in' ? [0, leafT] : [thickness - leafT, thickness];
  switch (o.type) {
    case 'door':
      box(start + LEAF_GAP, end - LEAF_GAP, bottom, top - LEAF_GAP, ...leafOut, 'leaf');
      break;
    case 'double_door': {
      const mid = (start + end) / 2;
      box(start + LEAF_GAP, mid - LEAF_GAP / 2, bottom, top - LEAF_GAP, ...leafOut, 'leaf');
      box(mid + LEAF_GAP / 2, end - LEAF_GAP, bottom, top - LEAF_GAP, ...leafOut, 'leaf');
      break;
    }
    case 'sliding_door': {
      const mid = (start + end) / 2;
      const lap = Math.min(0.05, (end - start) * 0.05);
      const d = Math.min(FRAME, thickness * 0.3);
      framedGlass(start, mid + lap, bottom, top, thickness * 0.25, thickness * 0.25 + d, false);
      framedGlass(mid - lap, end, bottom, top, thickness * 0.55, thickness * 0.55 + d, false);
      break;
    }
    case 'window': {
      const d = Math.min(FRAME * 1.5, thickness * 0.6);
      framedGlass(start, end, bottom, top, thickness / 2 - d / 2, thickness / 2 + d / 2, end - start > 1.2);
      // Stool (interior sill) and apron below it.
      if (bottom >= TRIM_W) {
        box(left, right, bottom - inches(1), bottom, -inches(2.5), thickness / 2 - d / 2, 'trim');
        box(left, right, bottom - inches(1) - TRIM_W, bottom - inches(1), -TRIM_D, 0, 'trim');
      }
      break;
    }
  }
  // Local +x runs along the wall and local +z points into the room.
  return { rotationY: Math.atan2(-f.dir[1], f.dir[0]), boxes };
}
