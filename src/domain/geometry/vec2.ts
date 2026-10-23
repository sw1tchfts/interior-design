// 2D vectors in plan space: [x, z] in meters.
export type Vec2 = [number, number];

export const v2 = (x: number, z: number): Vec2 => [x, z];
export const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
export const scale = (a: Vec2, s: number): Vec2 => [a[0] * s, a[1] * s];
export const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];
export const cross = (a: Vec2, b: Vec2) => a[0] * b[1] - a[1] * b[0];
export const length = (a: Vec2) => Math.hypot(a[0], a[1]);
export const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export function normalize(a: Vec2): Vec2 {
  const l = length(a);
  return l === 0 ? [0, 0] : [a[0] / l, a[1] / l];
}

/** Intersection of infinite lines p + t*r and q + u*s; null if parallel. */
export function lineIntersection(p: Vec2, r: Vec2, q: Vec2, s: Vec2): Vec2 | null {
  const denom = cross(r, s);
  if (Math.abs(denom) < 1e-12 * (length(r) * length(s) || 1)) return null;
  const t = cross(sub(q, p), s) / denom;
  return add(p, scale(r, t));
}

/** Closest point on segment ab to p, with its parameter t in [0, 1]. */
export function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): { point: Vec2; t: number } {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / len2));
  return { point: add(a, scale(ab, t)), t };
}

export function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const d1 = cross(sub(b, a), sub(c, a));
  const d2 = cross(sub(b, a), sub(d, a));
  const d3 = cross(sub(d, c), sub(a, c));
  const d4 = cross(sub(d, c), sub(b, c));
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  const eps = 1e-12;
  const onSeg = (p: Vec2, q: Vec2, r: Vec2) =>
    Math.min(p[0], q[0]) - eps <= r[0] && r[0] <= Math.max(p[0], q[0]) + eps &&
    Math.min(p[1], q[1]) - eps <= r[1] && r[1] <= Math.max(p[1], q[1]) + eps;
  if (Math.abs(d1) < eps && onSeg(a, b, c)) return true;
  if (Math.abs(d2) < eps && onSeg(a, b, d)) return true;
  if (Math.abs(d3) < eps && onSeg(c, d, a)) return true;
  if (Math.abs(d4) < eps && onSeg(c, d, b)) return true;
  return false;
}

/**
 * Maps a point in an object's local plan frame to world plan space.
 * Matches three.js `rotation.y = angle`: local +z maps to (sin, cos).
 */
export function localToWorld(local: Vec2, center: Vec2, angle: number): Vec2 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [center[0] + local[0] * c + local[1] * s, center[1] - local[0] * s + local[1] * c];
}

export function worldToLocal(world: Vec2, center: Vec2, angle: number): Vec2 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dx = world[0] - center[0];
  const dz = world[1] - center[1];
  return [dx * c - dz * s, dx * s + dz * c];
}

export const radToDeg = (r: number) => (r * 180) / Math.PI;
export const degToRad = (d: number) => (d * Math.PI) / 180;

/** Wraps an angle to (-PI, PI]. */
export function wrapAngle(a: number): number {
  let r = a % (2 * Math.PI);
  if (r <= -Math.PI) r += 2 * Math.PI;
  if (r > Math.PI) r -= 2 * Math.PI;
  return r;
}
