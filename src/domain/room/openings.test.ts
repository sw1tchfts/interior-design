import { describe, expect, it } from 'vitest';
import { pointInPolygon } from '../geometry/polygon';
import { type Vec2, dist } from '../geometry/vec2';
import { type Opening, type Room, makeRoom } from '../schema/project';
import { INCH } from '../units/units';
import {
  OPENING_PRESETS, addOpening, changeOpeningType, createOpening, doorLeaves, dragOpeningTo, findOpeningSpot,
  openingSpan, setOpeningSpan, wallFrame, wallPoint,
} from './openings';
import {
  deleteVertex, insertVertex, lShapeRoomPoints, normalizeWinding, rectangleRoomPoints, roomPoints, setRoomPoints, setWallLength,
} from './roomOps';

const door = OPENING_PRESETS.find((p) => p.id === 'door-30')!;
const window36 = OPENING_PRESETS.find((p) => p.id === 'window-36')!;

function withOpening(room: Room, wallIndex: number, offset: number, p = door): [Room, Opening] {
  const o = createOpening(p, room.walls[wallIndex]!.id, offset);
  return [addOpening(room, o), o];
}

/** World positions of an opening's two edges on the interior face, in either order. */
function edgePoints(room: Room, id: string): Vec2[] {
  const o = room.openings.find((x) => x.id === id)!;
  const s = openingSpan(room, o)!;
  const f = wallFrame(room, s.wallIndex);
  return [wallPoint(f, s.start), wallPoint(f, s.end)].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
}

function expectSamePoints(a: Vec2[], b: Vec2[]) {
  a.forEach((p, i) => {
    expect(p[0]).toBeCloseTo(b[i]![0], 9);
    expect(p[1]).toBeCloseTo(b[i]![1], 9);
  });
}

describe('openings', () => {
  it('keeps an opening on a shortened wall and restores it when the wall grows back', () => {
    const [room, o] = withOpening(makeRoom('r', rectangleRoomPoints(4, 3)), 0, 3);
    expect(openingSpan(room, o)).toMatchObject({ wallIndex: 0, start: 3 });
    const short = setWallLength(room, 0, 3.2);
    const s = openingSpan(short, o)!;
    expect(s.end).toBeCloseTo(3.2, 9);
    expect(s.end - s.start).toBeCloseTo(door.width, 9);
    expect(openingSpan(setWallLength(short, 0, 4), o)!.start).toBe(3);
  });

  it('places new openings centered on the longest free wall, avoiding existing ones', () => {
    const room = makeRoom('r', rectangleRoomPoints(4, 3));
    const spot = findOpeningSpot(room, door.width, INCH)!;
    expect([0, 2]).toContain(spot.wallIndex);
    expect(spot.offset / INCH).toBeCloseTo(Math.round(spot.offset / INCH), 9);
    expect(Math.abs(spot.offset + door.width / 2 - 2)).toBeLessThanOrEqual(INCH);

    // Fill wall 1 so only its two leftover stretches remain; the bigger one wins.
    const [r2] = withOpening(room, 1, 1, { ...door, width: 1.5 });
    const next = findOpeningSpot(r2, 0.5, 0, [1])!;
    expect(next.wallIndex).toBe(1);
    expect(next.offset).toBeCloseTo(0.25, 9);
    expect(findOpeningSpot(r2, 1.2, 0, [1])).toBeNull();
  });

  it('drags along the nearest wall with snapping and refuses overlaps', () => {
    const [room, o] = withOpening(makeRoom('r', rectangleRoomPoints(4, 3)), 0, 1);
    expect(dragOpeningTo(room, o, [2.013, 0.2], 0.1, INCH)).toEqual({ wallId: room.walls[0]!.id, offset: 75 * INCH });
    // Past the end of the wall it stops at the corner.
    expect(dragOpeningTo(room, o, [3.95, -0.5], 0, INCH)).toEqual({ wallId: room.walls[0]!.id, offset: 4 - door.width });
    // Near the +x wall it hops over to it.
    expect(dragOpeningTo(room, o, [3.9, 1.5], 0, 0)).toEqual({ wallId: room.walls[1]!.id, offset: 1.5 });
    const [r2] = withOpening(room, 0, 2.5);
    expect(dragOpeningTo(r2, o, [2.6, 0], 0, 0)).toBeNull();
  });

  it('moves and resizes along the wall without overlapping', () => {
    const [room, o] = withOpening(makeRoom('r', rectangleRoomPoints(4, 3)), 0, 1);
    expect(setOpeningSpan(room, o.id, 3.9, 1)!.openings[0]).toMatchObject({ offset: 3, width: 1 });
    const [r2] = withOpening(room, 0, 2.5);
    expect(setOpeningSpan(r2, o.id, 1, 2)).toBeNull();
  });

  it('keeps openings in place when corners are added or removed', () => {
    const base = makeRoom('r', rectangleRoomPoints(4, 3));
    const [r1, near] = withOpening(base, 0, 0.5);
    const [room, far] = withOpening(r1, 0, 3);
    const split = insertVertex(room, 0, 0.5);
    expect(split.openings.find((x) => x.id === near.id)!.wallId).toBe(split.walls[0]!.id);
    expect(split.openings.find((x) => x.id === far.id)!.wallId).toBe(split.walls[1]!.id);
    for (const id of [near.id, far.id]) expectSamePoints(edgePoints(split, id), edgePoints(room, id));

    const merged = deleteVertex(split, 1);
    for (const id of [near.id, far.id]) expectSamePoints(edgePoints(merged, id), edgePoints(room, id));
  });

  it('mirrors openings when a clockwise outline is flipped to counter-clockwise', () => {
    const cw = [...lShapeRoomPoints(5, 4, 2, 1.5)].reverse();
    const [room, o] = withOpening(makeRoom('r', cw), 2, 0.4);
    const hingePoint = (r: Room) => {
      const x = r.openings[0]!;
      const s = openingSpan(r, x)!;
      return wallPoint(wallFrame(r, s.wallIndex), x.hinge === 'start' ? s.start : s.end);
    };
    const flipped = normalizeWinding(room);
    expect(flipped.openings[0]!.hinge).toBe('end');
    expectSamePoints(edgePoints(flipped, o.id), edgePoints(room, o.id));
    expectSamePoints([hingePoint(flipped)], [hingePoint(room)]);
  });

  it('drops openings when a redraw changes the number of walls', () => {
    const [room] = withOpening(makeRoom('r', rectangleRoomPoints(4, 3)), 0, 1);
    expect(setRoomPoints(room, lShapeRoomPoints(5, 4, 2, 1.5)).openings).toEqual([]);
  });

  it('swings doors into or out of the room', () => {
    const room0 = makeRoom('r', rectangleRoomPoints(4, 3));
    const [room, o] = withOpening(room0, 0, 1);
    const pts = roomPoints(room);
    const [inLeaf] = doorLeaves(room, o, 0.1);
    expect(inLeaf!.hinge).toEqual([1, 0]);
    expect(pointInPolygon(inLeaf!.open, pts)).toBe(true);
    expect(dist(inLeaf!.open, inLeaf!.hinge)).toBeCloseTo(door.width, 9);

    const outRoom = { ...room, openings: [{ ...o, swing: 'out' as const, hinge: 'end' as const }] };
    const [outLeaf] = doorLeaves(outRoom, outRoom.openings[0]!, 0.1);
    expect(outLeaf!.hinge[0]).toBeCloseTo(1 + door.width, 9);
    expect(outLeaf!.hinge[1]).toBeCloseTo(-0.1, 9);
    expect(pointInPolygon(outLeaf!.open, pts)).toBe(false);

    const double = { ...room, openings: [{ ...o, type: 'double_door' as const }] };
    const leaves = doorLeaves(double, double.openings[0]!, 0.1);
    expect(leaves).toHaveLength(2);
    expectSamePoints([leaves[0]!.closed], [leaves[1]!.closed]);
    expect(doorLeaves({ ...room, openings: [{ ...o, type: 'window' }] }, { ...o, type: 'window' }, 0.1)).toEqual([]);
  });

  it('swaps height and sill when switching between doors and windows', () => {
    const o = createOpening(door, 'w', 0);
    const w = changeOpeningType(o, 'window');
    expect(w).toMatchObject({ type: 'window', width: door.width, sill: window36.sill, height: window36.height });
    expect(changeOpeningType(w, 'door')).toMatchObject({ sill: 0, height: door.height });
    expect(changeOpeningType(o, 'pocket_door')).toMatchObject({ sill: 0, height: door.height });
  });
});
