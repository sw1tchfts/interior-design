import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { makeRoom } from '../schema/project';
import { signedArea } from '../geometry/polygon';
import { type Vec2, cross, dot, normalize, sub } from '../geometry/vec2';
import {
  deleteVertex, insertVertex, lShapeRoomPoints, moveWall, normalizeWinding, rectangleRoomPoints, roomPoints,
  setWallLength, validateRoomPoints, wallLength,
} from './roomOps';

function cornerAngles(pts: Vec2[]): number[] {
  return pts.map((p, i) => {
    const prev = pts[(i - 1 + pts.length) % pts.length]!;
    const next = pts[(i + 1) % pts.length]!;
    const a = normalize(sub(prev, p));
    const b = normalize(sub(next, p));
    return Math.atan2(cross(a, b), dot(a, b));
  });
}

describe('room operations', () => {
  it('normalizes clockwise input to counter-clockwise and keeps walls on their edges', () => {
    const cw = makeRoom('r', [...lShapeRoomPoints(5, 4, 2, 1.5)].reverse());
    const edgeKey = (room: typeof cw, i: number) => {
      const a = room.vertices[i]!.p;
      const b = room.vertices[(i + 1) % room.vertices.length]!.p;
      return [a.join(','), b.join(',')].sort().join('|');
    };
    const before = new Map(cw.walls.map((w, i) => [w.id, edgeKey(cw, i)]));
    const r = normalizeWinding(cw);
    expect(signedArea(roomPoints(r))).toBeGreaterThan(0);
    r.walls.forEach((w, i) => expect(edgeKey(r, i)).toBe(before.get(w.id)));
  });

  it('sets a wall length on a rectangle and keeps it rectangular', () => {
    const r = makeRoom('r', rectangleRoomPoints(4, 3));
    const r2 = setWallLength(r, 0, 5);
    expect(roomPoints(r2)).toEqual([[0, 0], [5, 0], [5, 3], [0, 3]]);
  });

  it('sets wall lengths on an L-shape while keeping every angle', () => {
    const r = makeRoom('r', lShapeRoomPoints(5, 4, 2, 1.5));
    const before = cornerAngles(roomPoints(r));
    for (let i = 0; i < r.vertices.length; i++) {
      const r2 = setWallLength(r, i, wallLength(r, i) + 0.3);
      expect(wallLength(r2, i)).toBeCloseTo(wallLength(r, i) + 0.3, 9);
      const after = cornerAngles(roomPoints(r2));
      after.forEach((a, k) => expect(a).toBeCloseTo(before[k]!, 9));
    }
  });

  it('keeps angles for random length edits on random convex rooms', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 8 }),
        fc.double({ min: 2, max: 6, noNaN: true }),
        fc.integer({ min: 0, max: 7 }),
        fc.double({ min: -0.3, max: 0.3, noNaN: true }),
        (n, radius, wall, delta) => {
          const pts: Vec2[] = Array.from({ length: n }, (_, i) => {
            const t = (i / n) * 2 * Math.PI;
            return [radius * Math.cos(t), radius * Math.sin(t)];
          });
          const r = makeRoom('r', pts);
          const i = wall % n;
          const r2 = setWallLength(r, i, wallLength(r, i) + delta);
          const before = cornerAngles(pts);
          cornerAngles(roomPoints(r2)).forEach((a, k) => expect(a).toBeCloseTo(before[k]!, 6));
        },
      ),
    );
  });

  it('moves a wall outward and stretches neighbors', () => {
    const r = makeRoom('r', rectangleRoomPoints(4, 3));
    // Wall 1 is the +x wall; outward is +x.
    const r2 = moveWall(r, 1, 0.5);
    expect(roomPoints(r2)).toEqual([[0, 0], [4.5, 0], [4.5, 3], [0, 3]]);
  });

  it('inserts and deletes corners keeping walls parallel to vertices', () => {
    const r = makeRoom('r', rectangleRoomPoints(4, 3));
    const r2 = insertVertex(r, 0);
    expect(r2.vertices).toHaveLength(5);
    expect(r2.walls).toHaveLength(5);
    expect(r2.vertices[1]!.p).toEqual([2, 0]);
    const r3 = deleteVertex(r2, 1);
    expect(roomPoints(r3)).toEqual(roomPoints(r));
    expect(deleteVertex(makeRoom('t', [[0, 0], [1, 0], [0, 1]]), 0).vertices).toHaveLength(3);
  });

  it('validates outlines', () => {
    expect(validateRoomPoints(rectangleRoomPoints(4, 3)).ok).toBe(true);
    expect(validateRoomPoints([[0, 0], [4, 3], [4, 0], [0, 3]]).ok).toBe(false);
    expect(validateRoomPoints([[0, 0], [0.01, 0], [0, 1]]).ok).toBe(false);
  });
});
