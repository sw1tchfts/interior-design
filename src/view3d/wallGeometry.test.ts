import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { buildWallMeshes } from './wallGeometry';
import { lShapeRoomPoints } from '../domain/room/roomOps';

describe('wall geometry', () => {
  it('builds one closed prism per wall with outward-facing normals', () => {
    const pts = lShapeRoomPoints(5, 4, 2, 1.5);
    const walls = buildWallMeshes(pts, 0.1, 2.4);
    expect(walls).toHaveLength(6);
    for (const w of walls) {
      const bb = w.geometry.boundingBox!;
      expect(bb.min.y).toBe(0);
      expect(bb.max.y).toBeCloseTo(2.4);
      // Every triangle's normal should point away from the prism's centroid.
      const pos = w.geometry.getAttribute('position');
      const nor = w.geometry.getAttribute('normal');
      const center = new Vector3();
      bb.getCenter(center);
      for (let i = 0; i < pos.count; i += 3) {
        const tri = [0, 1, 2].map((k) => new Vector3().fromBufferAttribute(pos, i + k));
        const c = tri[0]!.clone().add(tri[1]!).add(tri[2]!).divideScalar(3);
        const n = new Vector3().fromBufferAttribute(nor, i);
        const geometric = new Vector3().subVectors(tri[1]!, tri[0]!).cross(new Vector3().subVectors(tri[2]!, tri[0]!));
        expect(geometric.dot(n)).toBeGreaterThan(0); // winding matches normal
        expect(n.dot(c.sub(center))).toBeGreaterThan(-1e-9);
      }
    }
  });
});
