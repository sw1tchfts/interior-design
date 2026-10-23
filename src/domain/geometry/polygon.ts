import {
  type Vec2, add, closestPointOnSegment, cross, dist, dot, lineIntersection, normalize, scale, segmentsIntersect, sub,
} from './vec2';

/** Shoelace area; positive for counter-clockwise in (x, z) math orientation. */
export function signedArea(pts: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

export const area = (pts: Vec2[]) => Math.abs(signedArea(pts));

export function perimeter(pts: Vec2[]): number {
  let p = 0;
  for (let i = 0; i < pts.length; i++) p += dist(pts[i]!, pts[(i + 1) % pts.length]!);
  return p;
}

export function centroid(pts: Vec2[]): Vec2 {
  const a = signedArea(pts);
  if (Math.abs(a) < 1e-12) {
    const s = pts.reduce((acc, p) => add(acc, p), [0, 0] as Vec2);
    return scale(s, 1 / Math.max(1, pts.length));
  }
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    const f = p[0] * q[1] - q[0] * p[1];
    cx += (p[0] + q[0]) * f;
    cz += (p[1] + q[1]) * f;
  }
  return [cx / (6 * a), cz / (6 * a)];
}

export function edges(pts: Vec2[]): [Vec2, Vec2][] {
  return pts.map((p, i) => [p, pts[(i + 1) % pts.length]!]);
}

/** True when no two non-adjacent edges touch and no edge is degenerate. */
export function isSimplePolygon(pts: Vec2[]): boolean {
  const n = pts.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    if (dist(pts[i]!, pts[(i + 1) % n]!) < 1e-9) return false;
  }
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    for (let j = i + 1; j < n; j++) {
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      if (segmentsIntersect(a, b, pts[j]!, pts[(j + 1) % n]!)) return false;
    }
  }
  return Math.abs(signedArea(pts)) > 1e-9;
}

export function pointInPolygon(p: Vec2, pts: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!;
    const b = pts[j]!;
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) {
      inside = !inside;
    }
  }
  return inside;
}

export function distanceToPolygonEdges(p: Vec2, pts: Vec2[]): number {
  let best = Infinity;
  for (const [a, b] of edges(pts)) best = Math.min(best, dist(p, closestPointOnSegment(p, a, b).point));
  return best;
}

/** Outward unit normal of edge a->b for a counter-clockwise polygon. */
export function outwardNormal(a: Vec2, b: Vec2): Vec2 {
  const d = normalize(sub(b, a));
  return [d[1], -d[0]];
}

export const inwardNormal = (a: Vec2, b: Vec2): Vec2 => scale(outwardNormal(a, b), -1);

/**
 * Offsets a counter-clockwise polygon outward by d using mitered corners.
 * Very sharp corners are clamped to `miterLimit * d` from the original vertex.
 */
export function offsetPolygon(pts: Vec2[], d: number, miterLimit = 4): Vec2[] {
  const n = pts.length;
  return pts.map((p, i) => {
    const prev = pts[(i - 1 + n) % n]!;
    const next = pts[(i + 1) % n]!;
    const n1 = outwardNormal(prev, p);
    const n2 = outwardNormal(p, next);
    const hit = lineIntersection(add(prev, scale(n1, d)), sub(p, prev), add(p, scale(n2, d)), sub(next, p));
    if (!hit) return add(p, scale(n1, d));
    const off = sub(hit, p);
    const maxLen = miterLimit * Math.abs(d);
    const len = Math.hypot(off[0], off[1]);
    if (len > maxLen) {
      const bis = normalize(add(n1, n2));
      return add(p, scale(bis, maxLen));
    }
    return hit;
  });
}

/** Separating-axis test for two convex polygons (any winding). */
export function convexPolygonsOverlap(a: Vec2[], b: Vec2[], tolerance = 1e-6): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      const axis: Vec2 = [-(q[1] - p[1]), q[0] - p[0]];
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (const v of a) { const d = dot(v, axis); minA = Math.min(minA, d); maxA = Math.max(maxA, d); }
      for (const v of b) { const d = dot(v, axis); minB = Math.min(minB, d); maxB = Math.max(maxB, d); }
      const scaleTol = tolerance * Math.hypot(axis[0], axis[1]);
      if (maxA <= minB + scaleTol || maxB <= minA + scaleTol) return false;
    }
  }
  return true;
}

/** True if `inner` (any polygon) lies fully inside `outer` (simple polygon). */
export function polygonInsidePolygon(inner: Vec2[], outer: Vec2[], tolerance = 1e-6): boolean {
  for (const p of inner) {
    if (!pointInPolygon(p, outer) && distanceToPolygonEdges(p, outer) > tolerance) return false;
  }
  for (let i = 0; i < inner.length; i++) {
    const a = inner[i]!;
    const b = inner[(i + 1) % inner.length]!;
    for (let j = 0; j < outer.length; j++) {
      const c = outer[j]!;
      const d = outer[(j + 1) % outer.length]!;
      if (properCrossing(a, b, c, d, tolerance)) return false;
    }
  }
  return true;
}

// Strict crossing (endpoints touching or collinear overlap don't count).
function properCrossing(a: Vec2, b: Vec2, c: Vec2, d: Vec2, tol: number): boolean {
  const d1 = cross(sub(b, a), sub(c, a));
  const d2 = cross(sub(b, a), sub(d, a));
  const d3 = cross(sub(d, c), sub(a, c));
  const d4 = cross(sub(d, c), sub(b, c));
  const lab = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const lcd = Math.hypot(d[0] - c[0], d[1] - c[1]);
  const t1 = tol * lab;
  const t2 = tol * lcd;
  return ((d1 > t1 && d2 < -t1) || (d1 < -t1 && d2 > t1)) && ((d3 > t2 && d4 < -t2) || (d3 < -t2 && d4 > t2));
}

export function boundingBox(pts: Vec2[]): { min: Vec2; max: Vec2 } {
  const min: Vec2 = [Infinity, Infinity];
  const max: Vec2 = [-Infinity, -Infinity];
  for (const p of pts) {
    min[0] = Math.min(min[0], p[0]); min[1] = Math.min(min[1], p[1]);
    max[0] = Math.max(max[0], p[0]); max[1] = Math.max(max[1], p[1]);
  }
  return { min, max };
}
