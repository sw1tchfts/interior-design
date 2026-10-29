import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Box3 } from 'three';
import { partsToGeometries } from '../../view3d/partsToGeometry';
import { getKind } from '../furniture/registry';
import { distanceToPolygonEdges } from '../geometry/polygon';
import { type Vec2, localToWorld } from '../geometry/vec2';
import { openingSpan } from '../room/openings';
import { roomPoints, validateRoomPoints } from '../room/roomOps';
import { parseProjectDoc } from '../schema/project';
import { itemInsideRoom } from '../snapping/snapping';
import { buildRoomFromScan, objectsInRoom, projectFromScan } from './importScan';
import { type ScanData, type ScanObject, parseRoomPlan } from './roomplan';
import { findScanRooms } from './scanRooms';

const apartment = () =>
  parseRoomPlan(JSON.parse(readFileSync(new URL('./fixtures/openplan3d-apartment.json', import.meta.url), 'utf8')));

/** Distance from the middle of an item's back (local -z) face to the nearest wall. */
function backGap(item: { dims: { depth: number }; transform: { x: number; z: number; rotationY: number } }, pts: Vec2[]) {
  const back = localToWorld([0, -item.dims.depth / 2], [item.transform.x, item.transform.z], item.transform.rotationY);
  return distanceToPolygonEdges(back, pts);
}

/** A rectangular scan, turned by `heading`, with a sofa against the far wall. */
function syntheticScan(heading: number): ScanData {
  const turn = (p: Vec2): Vec2 => [p[0] * Math.cos(heading) - p[1] * Math.sin(heading) + 10, p[0] * Math.sin(heading) + p[1] * Math.cos(heading) - 5];
  const corners: Vec2[] = [[0, 0], [5, 0], [5, 4], [0, 4]].map((p) => turn(p as Vec2));
  const sofa: ScanObject = {
    id: 'sofa', category: 'sofa', attributes: {}, center: turn([2.5, 4 - 0.45]), bottom: 0,
    width: 2.1, height: 0.85, depth: 0.9, rotationY: Math.PI - heading, confidence: 'high',
  };
  return {
    walls: corners.map((a, i) => ({ id: `w${i}`, a, b: corners[(i + 1) % 4]!, height: 2.5, thickness: 0 })),
    openings: [{ id: 'win', type: 'window', center: turn([2.5, 0]), width: 1.2, height: 1.2, bottom: 0.9 }],
    objects: [sofa],
    sections: [{ label: 'livingRoom', center: turn([2.5, 2]) }],
    floors: [],
  };
}

describe('RoomPlan import', () => {
  it('reads walls, openings, furniture and heights from a real scan', () => {
    const scan = apartment();
    expect(scan.walls).toHaveLength(20);
    expect(scan.openings.filter((o) => o.type === 'door')).toHaveLength(4);
    const windows = scan.openings.filter((o) => o.type === 'window');
    expect(windows).toHaveLength(4);
    for (const w of windows) expect(w.bottom).toBeGreaterThan(1.1);
    expect(scan.objects).toHaveLength(13);
    expect(scan.objects.find((o) => o.category === 'chair')!.attributes).toMatchObject({ ChairType: 'swivel', ChairArmType: 'existing' });
    expect(scan.objects.find((o) => o.category === 'sink')!.bottom).toBeGreaterThan(0.7);
    expect(scan.objects.find((o) => o.category === 'bed')!.bottom).toBeLessThan(0.01);
  });

  it('rejects files that are not RoomPlan scans', () => {
    expect(() => parseRoomPlan({ hello: 'world' })).toThrow(/RoomPlan/);
    expect(() => parseRoomPlan({ walls: [] })).toThrow(/no walls/);
  });

  it('finds the closed rooms and names them from the scan', () => {
    const rooms = findScanRooms(apartment());
    expect(rooms.map((r) => r.label)).toEqual(['Bedroom 1', 'Bedroom 2', 'Bathroom']);
    for (const r of rooms) expect(validateRoomPoints(r.points).ok).toBe(true);
    expect(rooms[0]!.points).toHaveLength(4);
    expect(rooms[0]!.area).toBeCloseTo(15.5, 0);
  });

  it('builds each room squared up, with its doors, windows and furniture against the walls', () => {
    const scan = apartment();
    for (const choice of findScanRooms(scan)) {
      const { room, items } = buildRoomFromScan(scan, choice);
      const pts = roomPoints(room);
      expect(validateRoomPoints(pts).ok).toBe(true);
      expect(room.ceilingHeight).toBeCloseTo(2.44, 2);
      expect(Math.min(...pts.map((p) => p[0]))).toBeCloseTo(0, 9);
      expect(Math.min(...pts.map((p) => p[1]))).toBeCloseTo(0, 9);
      // Every wall of these rooms was scanned within a few degrees of square.
      pts.forEach((p, i) => {
        const q = pts[(i + 1) % pts.length]!;
        expect(Math.min(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1]))).toBeLessThan(1e-9);
      });
      expect(room.openings.length).toBeGreaterThan(0);
      for (const o of room.openings) expect(openingSpan(room, o)).not.toBeNull();
      expect(items).toHaveLength(objectsInRoom(scan, choice).length);
      for (const item of items) {
        expect(itemInsideRoom(item, room)).toBe(true);
        if (item.source.type === 'scan' && ['bed', 'storage', 'sofa', 'toilet'].includes(item.source.category)) {
          expect(backGap(item, pts)).toBeLessThan(0.12);
        }
        // Scanned sizes must still produce furniture that exactly fills its box.
        const box = new Box3();
        for (const g of partsToGeometries(getKind(item.kind).parts(item.dims, item.params)).values()) {
          g.computeBoundingBox();
          box.union(g.boundingBox!);
        }
        expect(box.max.y).toBeCloseTo(item.dims.height, 3);
        expect(box.max.x - box.min.x).toBeCloseTo(item.dims.width, 3);
        expect(box.max.z - box.min.z).toBeCloseTo(item.dims.depth, 3);
      }
    }
  });

  it('maps categories and attributes to our kinds', () => {
    const scan = apartment();
    const all = findScanRooms(scan).flatMap((c) => buildRoomFromScan(scan, c).items);
    const byCategory = (c: string) => all.filter((i) => i.source.type === 'scan' && i.source.category === c);
    expect(byCategory('bed').every((i) => i.kind === 'bed' && /bed$/.test(i.name))).toBe(true);
    expect(byCategory('chair')[0]).toMatchObject({ kind: 'chair', name: 'Swivel chair', params: { arms: true, backStyle: 'solid' } });
    expect(byCategory('toilet')[0]).toMatchObject({ kind: 'box', name: 'Toilet', locked: true });
    const shelf = byCategory('storage').find((i) => i.source.type === 'scan' && i.source.attributes?.StorageType === 'shelf');
    expect(shelf).toMatchObject({ kind: 'cabinet', name: 'Shelf', params: { front: 'open' } });
    expect(all.find((i) => i.notes?.includes('low confidence'))).toBeDefined();
  });

  it('turns a skewed scan so walls line up with the grid and furniture keeps facing the room', () => {
    for (const heading of [0.4, -2.2, Math.PI / 2 + 0.1]) {
      const scan = syntheticScan(heading);
      const [choice] = findScanRooms(scan);
      expect(choice!.label).toBe('Living room');
      const { room, items } = buildRoomFromScan(scan, choice!);
      const pts = roomPoints(room);
      const xs = pts.map((p) => p[0]);
      const zs = pts.map((p) => p[1]);
      expect([Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)].sort()).toEqual([expect.closeTo(4, 9), expect.closeTo(5, 9)]);
      const [sofa] = items;
      expect(backGap(sofa!, pts)).toBeLessThan(1e-6);
      expect(itemInsideRoom(sofa!, room)).toBe(true);
      const [win] = room.openings;
      expect(win).toMatchObject({ type: 'window', sill: 0.9 });
      expect(openingSpan(room, win!)!.start).toBeCloseTo(1.9, 6);
    }
  });

  it('creates a project that survives a save and reload', () => {
    const scan = apartment();
    const [choice] = findScanRooms(scan);
    const doc = projectFromScan('Scan', scan, choice!);
    const restored = parseProjectDoc(JSON.parse(JSON.stringify(doc)));
    expect(restored).toEqual(doc);
    expect(restored.rooms[restored.roomOrder[0]!]!.name).toBe('Bedroom 1');
    expect(restored.layouts[restored.layoutOrder[0]!]!.itemOrder.length).toBeGreaterThan(0);
  });
});
