import { type Vec2, add, dist, length, normalize, scale, sub } from '../geometry/vec2';
import { snapPointToGrid, snapToGrid } from '../snapping/snapping';

export interface DrawSnapOptions {
  gridStep: number;
  angleStepDeg: number;
  /** Distance (m) within which the cursor snaps to the first corner to close. */
  closeThreshold: number;
  free: boolean;
}

/** Where the next corner goes while drawing a room outline. */
export function snapDrawPoint(raw: Vec2, points: Vec2[], opts: DrawSnapOptions): { p: Vec2; closes: boolean } {
  const first = points[0];
  if (first && points.length >= 3 && dist(raw, first) < opts.closeThreshold) return { p: first, closes: true };
  const last = points[points.length - 1];
  if (opts.free) return { p: raw, closes: false };
  if (!last) return { p: snapPointToGrid(raw, opts.gridStep), closes: false };
  const v = sub(raw, last);
  const step = (opts.angleStepDeg * Math.PI) / 180;
  const ang = Math.round(Math.atan2(v[1], v[0]) / step) * step;
  const len = snapToGrid(length(v), opts.gridStep);
  const p = add(last, [len * Math.cos(ang), len * Math.sin(ang)]);
  return { p: [Math.abs(p[0]) < 1e-12 ? 0 : p[0], Math.abs(p[1]) < 1e-12 ? 0 : p[1]], closes: false };
}

/** Places the next corner `len` meters from the last one, toward the cursor. */
export function placeTypedLength(points: Vec2[], cursor: Vec2, len: number): Vec2 | null {
  const last = points[points.length - 1];
  if (!last) return null;
  const dir = normalize(sub(cursor, last));
  if (dir[0] === 0 && dir[1] === 0) return null;
  return add(last, scale(dir, len));
}
