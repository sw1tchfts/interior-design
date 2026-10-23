import { describe, expect, it } from 'vitest';
import { placeTypedLength, snapDrawPoint } from './drawSnap';

const opts = { gridStep: 0.1, angleStepDeg: 45, closeThreshold: 0.2, free: false };

describe('drawing snaps', () => {
  it('snaps the first corner to the grid', () => {
    expect(snapDrawPoint([1.04, 2.96], [], opts).p).toEqual([1, 3]);
  });

  it('snaps direction to 45 degree steps and length to the grid', () => {
    const { p } = snapDrawPoint([3.03, 0.2], [[0, 0]], opts);
    expect(p[0]).toBeCloseTo(3.0);
    expect(p[1]).toBeCloseTo(0);
  });

  it('closes on the first corner', () => {
    const pts: [number, number][] = [[0, 0], [3, 0], [3, 2]];
    expect(snapDrawPoint([0.1, 0.05], pts, opts)).toEqual({ p: [0, 0], closes: true });
  });

  it('places a typed length toward the cursor', () => {
    const p = placeTypedLength([[1, 1]], [1, 5], 2.5);
    expect(p![0]).toBeCloseTo(1);
    expect(p![1]).toBeCloseTo(3.5);
  });
});
