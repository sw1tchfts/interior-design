import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createItem, getKind } from '../furniture/registry';
import { defaultSettings, makeRoom } from '../schema/project';
import { lShapeRoomPoints, rectangleRoomPoints } from '../room/roomOps';
import { INCH, inches } from '../units/units';
import { dragItemTo, findCollisions, findWallSnap, itemInsideRoom, snapAngle, wallFacingAngle } from './snapping';

const sofaDef = getKind('sofa');
const sofa = () => createItem(sofaDef, sofaDef.presets[0]!, [2, 2]);

describe('snapping', () => {
  it('snaps angles', () => {
    expect(snapAngle(0.2, 15)).toBeCloseTo(Math.PI / 12);
    expect(snapAngle(Math.PI - 0.01, 90)).toBeCloseTo(Math.PI);
  });

  it('faces items into the room from each wall of a rectangle', () => {
    // Wall 0 runs along z = 0 (the top edge on screen); the room is at +z.
    expect(wallFacingAngle([0, 0], [4, 0])).toBeCloseTo(0);
    // Wall 1 is x = 4; facing into the room means -x.
    expect(wallFacingAngle([4, 0], [4, 3])).toBeCloseTo(-Math.PI / 2);
  });

  it('snaps an item flush to a nearby wall', () => {
    const room = makeRoom('r', rectangleRoomPoints(5, 4));
    const snap = findWallSnap(room, [2, 0.6], 0.96, 0.3);
    expect(snap?.wallIndex).toBe(0);
    expect(snap?.center[1]).toBeCloseTo(0.48);
    expect(findWallSnap(room, [2.5, 2], 0.96, 0.3)).toBeNull();
  });

  it('drags with grid snap and keeps the item inside the room', () => {
    const room = makeRoom('r', rectangleRoomPoints(5, 4));
    const settings = { ...defaultSettings(), wallSnap: false };
    const item = sofa();
    const t = dragItemTo(item, [2.0123, 2.0177], { settings, room, free: false, wallThreshold: 0.2 });
    expect(Math.abs(t.x / INCH - Math.round(t.x / INCH))).toBeLessThan(1e-9);
    const outside = dragItemTo(item, [10, 2], { settings, room, free: false, wallThreshold: 0.2 });
    expect(outside.x).toBe(item.transform.x);
  });

  it('never lets dragged items leave an L-shaped room', () => {
    const room = makeRoom('r', lShapeRoomPoints(6, 5, 2.5, 2));
    const settings = defaultSettings();
    fc.assert(
      fc.property(fc.double({ min: -2, max: 8, noNaN: true }), fc.double({ min: -2, max: 7, noNaN: true }), (x, z) => {
        const item = { ...sofa(), transform: { x: 2, z: 1.5, y: 0, rotationY: 0 } };
        expect(itemInsideRoom(item, room)).toBe(true);
        const t = dragItemTo(item, [x, z], { settings, room, free: false, wallThreshold: 0.2 });
        expect(itemInsideRoom({ ...item, transform: t }, room)).toBe(true);
      }),
    );
  });

  it('flags overlapping furniture but ignores rugs', () => {
    const a = sofa();
    const b = { ...sofa(), id: 'b', transform: { ...a.transform, x: a.transform.x + inches(40) } };
    const c = { ...sofa(), id: 'c', transform: { ...a.transform, x: a.transform.x + inches(200) } };
    const rugDef = getKind('rug');
    const rug = createItem(rugDef, rugDef.presets[0]!, [2, 2]);
    const hits = findCollisions([a, b, c, rug]);
    expect([...hits].sort()).toEqual([a.id, 'b'].sort());
  });
});
