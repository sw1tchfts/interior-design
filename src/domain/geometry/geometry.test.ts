import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { Object3D, Vector3 } from 'three';
import {
  area, centroid, convexPolygonsOverlap, isSimplePolygon, offsetPolygon, pointInPolygon, polygonInsidePolygon,
  signedArea,
} from './polygon';
import { type Vec2, localToWorld, worldToLocal } from './vec2';

const square: Vec2[] = [[0, 0], [4, 0], [4, 3], [0, 3]];

describe('polygon basics', () => {
  it('computes area, winding and centroid', () => {
    expect(signedArea(square)).toBeCloseTo(12);
    expect(signedArea([...square].reverse())).toBeCloseTo(-12);
    expect(centroid(square)).toEqual([2, 1.5]);
  });

  it('detects self intersections', () => {
    expect(isSimplePolygon(square)).toBe(true);
    expect(isSimplePolygon([[0, 0], [4, 3], [4, 0], [0, 3]])).toBe(false);
    expect(isSimplePolygon([[0, 0], [1, 0]])).toBe(false);
  });

  it('tests point containment', () => {
    expect(pointInPolygon([1, 1], square)).toBe(true);
    expect(pointInPolygon([5, 1], square)).toBe(false);
  });

  it('offsets outward with mitered corners', () => {
    const out = offsetPolygon(square, 0.1);
    expect(out[0]![0]).toBeCloseTo(-0.1);
    expect(out[0]![1]).toBeCloseTo(-0.1);
    expect(out[2]![0]).toBeCloseTo(4.1);
    expect(out[2]![1]).toBeCloseTo(3.1);
    expect(area(out)).toBeCloseTo(4.2 * 3.2);
  });

  it('offsets an L-shape including the reflex corner', () => {
    const l: Vec2[] = [[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]];
    const out = offsetPolygon(l, 0.1);
    expect(out[3]![0]).toBeCloseTo(2.1);
    expect(out[3]![1]).toBeCloseTo(2.1);
  });
});

describe('overlap and containment', () => {
  it('separates and overlaps rectangles', () => {
    const a: Vec2[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const b: Vec2[] = [[0.5, 0.5], [1.5, 0.5], [1.5, 1.5], [0.5, 1.5]];
    const c: Vec2[] = [[1, 0], [2, 0], [2, 1], [1, 1]];
    expect(convexPolygonsOverlap(a, b)).toBe(true);
    expect(convexPolygonsOverlap(a, c)).toBe(false); // touching only
  });

  it('checks a rectangle inside an L-shaped room', () => {
    const l: Vec2[] = [[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]];
    expect(polygonInsidePolygon([[0, 0], [1, 0], [1, 1], [0, 1]], l)).toBe(true);
    expect(polygonInsidePolygon([[1.5, 1.5], [3, 1.5], [3, 3], [1.5, 3]], l)).toBe(false);
  });
});

describe('localToWorld', () => {
  it('matches three.js Object3D rotation.y', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
        fc.double({ min: -5, max: 5, noNaN: true }),
        fc.double({ min: -5, max: 5, noNaN: true }),
        (angle, lx, lz) => {
          const o = new Object3D();
          o.position.set(1, 0, 2);
          o.rotation.y = angle;
          o.updateMatrixWorld();
          const w = o.localToWorld(new Vector3(lx, 0, lz));
          const ours = localToWorld([lx, lz], [1, 2], angle);
          expect(ours[0]).toBeCloseTo(w.x, 9);
          expect(ours[1]).toBeCloseTo(w.z, 9);
          const back = worldToLocal(ours, [1, 2], angle);
          expect(back[0]).toBeCloseTo(lx, 9);
          expect(back[1]).toBeCloseTo(lz, 9);
        },
      ),
    );
  });
});
