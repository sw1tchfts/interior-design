import { BufferAttribute, BufferGeometry, Vector3 } from 'three';
import { inwardNormal, offsetPolygon } from '../domain/geometry/polygon';
import type { Vec2 } from '../domain/geometry/vec2';

export interface WallMesh {
  index: number;
  geometry: BufferGeometry;
  /** Midpoint of the interior face and the normal pointing into the room. */
  mid: Vector3;
  inward: Vector3;
}

const v3 = (p: Vec2, y: number) => new Vector3(p[0], y, p[1]);

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

/**
 * Builds one mitered prism per wall: the interior face sits on the room outline,
 * the wall extends outward by `thickness`. Returned per wall so the 3D view can
 * hide walls between the camera and the room (dollhouse cutaway).
 */
export function buildWallMeshes(pts: Vec2[], thickness: number, height: number): WallMesh[] {
  const outer = offsetPolygon(pts, thickness);
  const up = new Vector3(0, 1, 0);
  return pts.map((a, i) => {
    const j = (i + 1) % pts.length;
    const b = pts[j]!;
    const ao = outer[i]!;
    const bo = outer[j]!;
    const nIn = inwardNormal(a, b);
    const inward = new Vector3(nIn[0], 0, nIn[1]);
    const along = new Vector3(b[0] - a[0], 0, b[1] - a[1]).normalize();
    const pos: number[] = [];
    const nor: number[] = [];
    pushQuad(pos, nor, [v3(a, 0), v3(b, 0), v3(b, height), v3(a, height)], inward);
    pushQuad(pos, nor, [v3(bo, 0), v3(ao, 0), v3(ao, height), v3(bo, height)], inward.clone().negate());
    pushQuad(pos, nor, [v3(a, height), v3(b, height), v3(bo, height), v3(ao, height)], up);
    pushQuad(pos, nor, [v3(a, 0), v3(ao, 0), v3(ao, height), v3(a, height)], along.clone().negate());
    pushQuad(pos, nor, [v3(b, 0), v3(bo, 0), v3(bo, height), v3(b, height)], along);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return { index: i, geometry, mid: v3([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], height / 2), inward };
  });
}
