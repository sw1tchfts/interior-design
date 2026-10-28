import { describe, expect, it } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { type WallHole, buildWallMeshes } from './wallGeometry';
import { lShapeRoomPoints, rectangleRoomPoints } from '../domain/room/roomOps';

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

  // Wall 0 of this rectangle runs along z = 0 from x = 0 to 4; the room is at +z.
  const door: WallHole = { start: 1, end: 1.9, bottom: 0, top: 2.03 };
  const win: WallHole = { start: 2.5, end: 3.4, bottom: 0.8, top: 2 };
  const hits = (mesh: Mesh, origin: Vector3, dir: Vector3) => new Raycaster(origin, dir).intersectObject(mesh).length;

  it('cuts doors and windows straight through a wall', () => {
    const [wall] = buildWallMeshes(rectangleRoomPoints(4, 3), 0.1, 2.4, [[door, win]]);
    const mesh = new Mesh(wall!.geometry, new MeshBasicMaterial({ side: DoubleSide }));
    const through = (x: number, y: number) => hits(mesh, new Vector3(x, y, 1), new Vector3(0, 0, -1));
    expect(through(1.45, 1)).toBe(0); // door
    expect(through(2.95, 1.4)).toBe(0); // window
    expect(through(2.95, 0.4)).toBe(2); // below the window: interior and exterior faces
    expect(through(1.45, 2.2)).toBe(2); // above the door
    expect(through(0.5, 1)).toBe(2);
    // From inside a hole, sideways rays hit the jambs.
    expect(hits(mesh, new Vector3(1.45, 1, -0.05), new Vector3(1, 0, 0))).toBeGreaterThan(0);
    expect(hits(mesh, new Vector3(2.95, 1.4, -0.05), new Vector3(0, -1, 0))).toBe(1); // sill

    const pos = wall!.geometry.getAttribute('position');
    const nor = wall!.geometry.getAttribute('normal');
    let interiorArea = 0;
    for (let i = 0; i < pos.count; i += 3) {
      const tri = [0, 1, 2].map((k) => new Vector3().fromBufferAttribute(pos, i + k));
      const geometric = new Vector3().subVectors(tri[1]!, tri[0]!).cross(new Vector3().subVectors(tri[2]!, tri[0]!));
      const n = new Vector3().fromBufferAttribute(nor, i);
      expect(geometric.dot(n)).toBeGreaterThan(0);
      if (n.z > 0.99 && Math.abs(tri[0]!.z) < 1e-6) interiorArea += geometric.length() / 2;
    }
    expect(interiorArea).toBeCloseTo(4 * 2.4 - 0.9 * 2.03 - 0.9 * 1.2, 5);
  });

  it('opens the top of short walls where a door passes through', () => {
    const [stub] = buildWallMeshes(rectangleRoomPoints(4, 3), 0.1, 0.12, [[door, win]]);
    const mesh = new Mesh(stub!.geometry, new MeshBasicMaterial({ side: DoubleSide }));
    const down = (x: number) => hits(mesh, new Vector3(x, 5, -0.05), new Vector3(0, -1, 0));
    expect(down(1.45)).toBe(0);
    expect(down(2.95)).toBe(1); // the window starts above the stub
    expect(down(0.5)).toBe(1);
    expect(down(-0.05)).toBe(1); // mitered corner
  });
});
