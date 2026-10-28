import { BufferAttribute, BufferGeometry, Vector3 } from 'three';
import { inwardNormal, offsetPolygon } from '../domain/geometry/polygon';
import { type Vec2, add, dist, dot, lerp, scale, sub } from '../domain/geometry/vec2';

export interface WallMesh {
  index: number;
  geometry: BufferGeometry;
  /** Midpoint of the interior face and the normal pointing into the room. */
  mid: Vector3;
  inward: Vector3;
}

/** A rectangular hole through a wall, e.g. a door or window. */
export interface WallHole {
  /** Distances along the interior face from the wall's start corner. */
  start: number;
  end: number;
  /** Heights above the floor. */
  bottom: number;
  top: number;
}

const v3 = (p: Vec2, y: number) => new Vector3(p[0], y, p[1]);
const EPS = 1e-4;

function pushQuad(pos: number[], nor: number[], q: Vector3[], hint: Vector3) {
  const [p0, p1, p2, p3] = q as [Vector3, Vector3, Vector3, Vector3];
  const n = new Vector3().subVectors(p1, p0).cross(new Vector3().subVectors(p2, p0));
  if (n.lengthSq() < 1e-16) n.subVectors(p2, p1).cross(new Vector3().subVectors(p3, p1));
  n.normalize();
  const flip = n.dot(hint) < 0;
  if (flip) n.negate();
  const tris = flip ? [p0, p2, p1, p0, p3, p2] : [p0, p1, p2, p0, p2, p3];
  for (const t of tris) {
    pos.push(t.x, t.y, t.z);
    nor.push(n.x, n.y, n.z);
  }
}

/** Clamps holes to [lo, hi] and the wall height, sorted, with overlaps trimmed away. */
function fitHoles(holes: WallHole[], lo: number, hi: number, height: number): WallHole[] {
  const fitted: WallHole[] = [];
  for (const h of [...holes].sort((p, q) => p.start - q.start)) {
    const start = Math.max(h.start, lo, fitted[fitted.length - 1]?.end ?? -Infinity);
    const end = Math.min(h.end, hi);
    const bottom = Math.max(0, h.bottom);
    const top = Math.min(h.top, height);
    if (end - start > EPS && top - bottom > EPS) fitted.push({ start, end, bottom, top });
  }
  return fitted;
}

/** Rectangles [u0, u1, y0, y1] that cover a wall face from `from` to `to` except for the holes. */
function faceRects(from: number, to: number, holes: WallHole[], height: number): [number, number, number, number][] {
  if (holes.length === 0) return [[from, to, 0, height]];
  const rects: [number, number, number, number][] = [];
  let u = from;
  for (const h of holes) {
    if (h.start - u > EPS) rects.push([u, h.start, 0, height]);
    if (h.bottom > EPS) rects.push([h.start, h.end, 0, h.bottom]);
    if (height - h.top > EPS) rects.push([h.start, h.end, h.top, height]);
    u = h.end;
  }
  if (to - u > EPS) rects.push([u, to, 0, height]);
  return rects;
}

/**
 * Builds one mitered prism per wall: the interior face sits on the room outline,
 * the wall extends outward by `thickness`. `holes[i]` cuts doors and windows
 * straight through wall i. Returned per wall so the 3D view can hide walls
 * between the camera and the room (dollhouse cutaway).
 */
export function buildWallMeshes(pts: Vec2[], thickness: number, height: number, holes: WallHole[][] = []): WallMesh[] {
  const outer = offsetPolygon(pts, thickness);
  const up = new Vector3(0, 1, 0);
  const down = new Vector3(0, -1, 0);
  return pts.map((a, i) => {
    const j = (i + 1) % pts.length;
    const b = pts[j]!;
    const ao = outer[i]!;
    const bo = outer[j]!;
    const nIn = inwardNormal(a, b);
    const inward = new Vector3(nIn[0], 0, nIn[1]);
    const along = new Vector3(b[0] - a[0], 0, b[1] - a[1]).normalize();
    const len = dist(a, b);
    const dir = scale(sub(b, a), 1 / len);
    // Positions along the wall, measured on the interior face, map onto both faces.
    const uAo = dot(sub(ao, a), dir);
    const uBo = dot(sub(bo, a), dir);
    const inner = (u: number, y: number) => v3(add(a, scale(dir, u)), y);
    const outerAt = (u: number, y: number) => v3(Math.abs(uBo - uAo) < 1e-9 ? ao : lerp(ao, bo, (u - uAo) / (uBo - uAo)), y);
    // Holes must pass cleanly through both faces.
    const cut = fitHoles(holes[i] ?? [], Math.max(0, uAo), Math.min(len, uBo), height);

    const pos: number[] = [];
    const nor: number[] = [];
    for (const [u0, u1, y0, y1] of faceRects(0, len, cut, height)) {
      pushQuad(pos, nor, [inner(u0, y0), inner(u1, y0), inner(u1, y1), inner(u0, y1)], inward);
    }
    for (const [u0, u1, y0, y1] of faceRects(uAo, uBo, cut, height)) {
      pushQuad(pos, nor, [outerAt(u1, y0), outerAt(u0, y0), outerAt(u0, y1), outerAt(u1, y1)], inward.clone().negate());
    }
    // Top, interrupted where a hole reaches the top of the wall. Each piece runs
    // between [inner u, outer u] pairs; the ends use the mitered corners.
    let from: [number, number] = [0, uAo];
    const pushTop = (to: [number, number]) => {
      if (to[0] - from[0] > EPS || to[1] - from[1] > EPS) {
        pushQuad(pos, nor, [inner(from[0], height), inner(to[0], height), outerAt(to[1], height), outerAt(from[1], height)], up);
      }
    };
    for (const h of cut.filter((c) => height - c.top <= EPS)) {
      pushTop([h.start, h.start]);
      from = [h.end, h.end];
    }
    pushTop([len, uBo]);
    pushQuad(pos, nor, [v3(a, 0), v3(ao, 0), v3(ao, height), v3(a, height)], along.clone().negate());
    pushQuad(pos, nor, [v3(b, 0), v3(bo, 0), v3(bo, height), v3(b, height)], along);
    // Reveals: jambs, head and sill inside each hole.
    for (const h of cut) {
      pushQuad(pos, nor, [inner(h.start, h.bottom), outerAt(h.start, h.bottom), outerAt(h.start, h.top), inner(h.start, h.top)], along);
      pushQuad(pos, nor, [inner(h.end, h.bottom), outerAt(h.end, h.bottom), outerAt(h.end, h.top), inner(h.end, h.top)], along.clone().negate());
      if (height - h.top > EPS) {
        pushQuad(pos, nor, [inner(h.start, h.top), inner(h.end, h.top), outerAt(h.end, h.top), outerAt(h.start, h.top)], down);
      }
      if (h.bottom > EPS) {
        pushQuad(pos, nor, [inner(h.start, h.bottom), inner(h.end, h.bottom), outerAt(h.end, h.bottom), outerAt(h.start, h.bottom)], up);
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return { index: i, geometry, mid: v3([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], height / 2), inward };
  });
}
