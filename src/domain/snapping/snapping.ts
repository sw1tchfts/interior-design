import { convexPolygonsOverlap, inwardNormal, polygonInsidePolygon } from '../geometry/polygon';
import { type Vec2, add, closestPointOnSegment, dist, dot, scale, sub, wrapAngle } from '../geometry/vec2';
import { getKind, itemFootprint } from '../furniture/registry';
import type { Item, Room, Settings } from '../schema/project';
import { roomPoints } from '../room/roomOps';

export const snapToGrid = (v: number, step: number) => (step > 0 ? Math.round(v / step) * step : v);
export const snapPointToGrid = (p: Vec2, step: number): Vec2 => [snapToGrid(p[0], step), snapToGrid(p[1], step)];

export function snapAngle(angle: number, stepDeg: number): number {
  const step = (stepDeg * Math.PI) / 180;
  return wrapAngle(Math.round(angle / step) * step);
}

/** Item rotation that puts its back against the wall, facing into the room. */
export function wallFacingAngle(a: Vec2, b: Vec2): number {
  const n = inwardNormal(a, b);
  return Math.atan2(n[0], n[1]);
}

export interface WallSnap {
  wallIndex: number;
  center: Vec2;
  rotationY: number;
}

/**
 * If the item's back would be within `threshold` of a wall, returns the
 * position and rotation that place it flush against that wall.
 */
export function findWallSnap(room: Room, center: Vec2, depth: number, threshold: number): WallSnap | null {
  const pts = roomPoints(room);
  let best: (WallSnap & { gap: number }) | null = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const { point, t } = closestPointOnSegment(center, a, b);
    if (t <= 0 || t >= 1) continue;
    const n = inwardNormal(a, b);
    const offset = dot(sub(center, point), n); // distance into the room
    if (offset < 0) continue;
    const gap = Math.abs(offset - depth / 2);
    if (gap > threshold) continue;
    if (!best || gap < best.gap) {
      best = { wallIndex: i, center: add(point, scale(n, depth / 2)), rotationY: wallFacingAngle(a, b), gap };
    }
  }
  return best && { wallIndex: best.wallIndex, center: best.center, rotationY: best.rotationY };
}

export function itemInsideRoom(item: Item, room: Room): boolean {
  return polygonInsidePolygon(itemFootprint(item), roomPoints(room), 1e-4);
}

export interface DragOptions {
  settings: Settings;
  room: Room;
  /** Disable all snapping (Alt key). */
  free: boolean;
  /** Wall snap distance in meters (depends on zoom). */
  wallThreshold: number;
}

/**
 * Computes where a dragged item lands given the raw pointer target for its center.
 * Applies grid snap, wall snap and the keep-inside-room constraint.
 */
export function dragItemTo(item: Item, target: Vec2, opts: DragOptions): Item['transform'] {
  const { settings, room } = opts;
  let center: Vec2 = opts.free ? target : snapPointToGrid(target, settings.snapStep);
  let rotationY = item.transform.rotationY;
  if (!opts.free && settings.wallSnap && getKind(item.kind).collides) {
    const snap = findWallSnap(room, target, item.dims.depth, opts.wallThreshold);
    if (snap) {
      center = snap.center;
      rotationY = snap.rotationY;
    }
  }
  const candidate = { ...item.transform, x: center[0], z: center[1], rotationY };
  if (!settings.keepInsideRoom || itemInsideRoom({ ...item, transform: candidate }, room)) return candidate;

  // Slide along one axis if the full move would leave the room.
  for (const t of [
    { ...item.transform, x: center[0] },
    { ...item.transform, z: center[1] },
  ]) {
    if (itemInsideRoom({ ...item, transform: t }, room)) return t;
  }
  return item.transform;
}

/** Ids of items whose footprints overlap another colliding item. */
export function findCollisions(items: Item[]): Set<string> {
  const solid = items.filter((i) => !i.hidden && getKind(i.kind).collides);
  const polys = solid.map(itemFootprint);
  const hits = new Set<string>();
  for (let i = 0; i < solid.length; i++) {
    for (let j = i + 1; j < solid.length; j++) {
      // Quick reject by distance before the SAT test.
      const a = solid[i]!, b = solid[j]!;
      const reach = Math.hypot(a.dims.width, a.dims.depth) / 2 + Math.hypot(b.dims.width, b.dims.depth) / 2;
      if (dist([a.transform.x, a.transform.z], [b.transform.x, b.transform.z]) > reach) continue;
      if (convexPolygonsOverlap(polys[i]!, polys[j]!, 1e-4)) {
        hits.add(a.id);
        hits.add(b.id);
      }
    }
  }
  return hits;
}
