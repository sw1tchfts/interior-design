import { getKind } from '../furniture/registry';
import { boundingBox, distanceToPolygonEdges, pointInPolygon } from '../geometry/polygon';
import { type Vec2, closestPointOnSegment, dist, lerp, lineIntersection, wrapAngle } from '../geometry/vec2';
import { addOpening, spanIsFree } from '../room/openings';
import { roomPoints, validateRoomPoints, wallEndpoints, wallLength } from '../room/roomOps';
import { DEFAULT_WALL_THICKNESS, type Item, type ProjectDoc, type Room, createProject, makeRoom, newId } from '../schema/project';
import { itemInsideRoom, wallFacingAngle } from '../snapping/snapping';
import type { ScanData, ScanObject } from './roomplan';
import { guessFurniture } from './scanFurniture';
import type { ScanRoom } from './scanRooms';

/** Walls within this many degrees of square are made exactly square. */
const SQUARE_DEG = 3;
/** Furniture within this many degrees of a wall's angle is lined up with it. */
const ALIGN_DEG = 6;
/** Doors and windows farther than this from the room's walls belong to other rooms. */
const OPENING_REACH = 0.3;
/** How far a piece scanned slightly into a wall may be nudged back into the room. */
const NUDGE_REACH = 0.25;

const rad = (deg: number) => (deg * Math.PI) / 180;
const rotate = (p: Vec2, a: number): Vec2 => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

/** Rigid transform that turns the room so its longest wall runs along +x and starts its bounding box at the origin. */
function framing(pts: Vec2[]) {
  let longest = -1;
  let heading = 0;
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length]!;
    if (dist(p, q) > longest) {
      longest = dist(p, q);
      heading = Math.atan2(q[1] - p[1], q[0] - p[0]);
    }
  });
  const turn = -heading;
  const { min } = boundingBox(pts.map((p) => rotate(p, turn)));
  return {
    point: (p: Vec2): Vec2 => {
      const r = rotate(p, turn);
      return [r[0] - min[0], r[1] - min[1]];
    },
    // rotationY runs the opposite way to plan angles (local +z faces (sin r, cos r)), so subtract.
    rotationY: (r: number) => wrapAngle(r - turn),
  };
}

/** Makes walls that are within a few degrees of square exactly square, unless that breaks the outline. */
function squareUp(pts: Vec2[]): Vec2[] {
  const n = pts.length;
  const lines = pts.map((p, i) => {
    const q = pts[(i + 1) % n]!;
    const a = Math.atan2(q[1] - p[1], q[0] - p[0]);
    const square = Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
    const dir: Vec2 = Math.abs(a - square) < rad(SQUARE_DEG) ? [Math.cos(square), Math.sin(square)] : [q[0] - p[0], q[1] - p[1]];
    return { through: lerp(p, q, 0.5), dir };
  });
  const out = pts.map((p, i) => {
    const prev = lines[(i - 1 + n) % n]!;
    const cur = lines[i]!;
    return lineIntersection(prev.through, prev.dir, cur.through, cur.dir) ?? p;
  });
  return validateRoomPoints(out).ok ? out : pts;
}

/** Lines a rotation up with the nearest wall direction (or a quarter turn from it) when close. */
function alignToWalls(rotationY: number, room: Room): number {
  let best = rotationY;
  let gap = rad(ALIGN_DEG);
  for (let i = 0; i < room.walls.length; i++) {
    const [a, b] = wallEndpoints(room, i);
    for (let k = 0; k < 4; k++) {
      const candidate = wrapAngle(wallFacingAngle(a, b) + (k * Math.PI) / 2);
      const d = Math.abs(wrapAngle(rotationY - candidate));
      if (d < gap) {
        gap = d;
        best = candidate;
      }
    }
  }
  return best;
}

/** Moves a piece scanned slightly into a wall back inside the room, if a small nudge does it. */
function nudgeInside(item: Item, room: Room): Item {
  if (itemInsideRoom(item, room)) return item;
  const step = 0.01;
  for (let ring = 1; ring * step <= NUDGE_REACH; ring++) {
    const count = ring * 8;
    for (let k = 0; k < count; k++) {
      const a = (k / count) * 2 * Math.PI;
      const moved = { ...item, transform: { ...item.transform, x: item.transform.x + Math.cos(a) * ring * step, z: item.transform.z + Math.sin(a) * ring * step } };
      if (itemInsideRoom(moved, room)) return moved;
    }
  }
  return item;
}

/** Scanned objects whose center is in (or right at the edge of) the room. */
export function objectsInRoom(scan: ScanData, choice: ScanRoom): ScanObject[] {
  return scan.objects.filter((o) => pointInPolygon(o.center, choice.points) || distanceToPolygonEdges(o.center, choice.points) < 0.05);
}

/**
 * Turns one room of a scan into a Room (walls, doors, windows) and As-is furniture,
 * squared up and turned so its longest wall runs along +x.
 */
export function buildRoomFromScan(scan: ScanData, choice: ScanRoom): { room: Room; items: Item[] } {
  const frame = framing(choice.points);
  const squared = squareUp(choice.points.map(frame.point));
  // Squaring nudges the corners; keep the room's bounding box at the origin.
  const { min } = boundingBox(squared);
  const place = (p: Vec2): Vec2 => {
    const q = frame.point(p);
    return [q[0] - min[0], q[1] - min[1]];
  };
  let room = makeRoom(choice.label, squared.map((p) => [p[0] - min[0], p[1] - min[1]] as Vec2));
  const thicknesses = scan.walls.map((w) => w.thickness).filter((t) => t > 0.02);
  const thickness = thicknesses.length ? median(thicknesses) : DEFAULT_WALL_THICKNESS;
  room = { ...room, ceilingHeight: median(scan.walls.map((w) => w.height)), walls: room.walls.map((w) => ({ ...w, thickness })) };

  for (const so of scan.openings) {
    const c = place(so.center);
    let best: { wall: number; along: number; d: number } | null = null;
    for (let i = 0; i < room.walls.length; i++) {
      const [a, b] = wallEndpoints(room, i);
      const { point, t } = closestPointOnSegment(c, a, b);
      const d = dist(c, point);
      if (d < OPENING_REACH && (!best || d < best.d)) best = { wall: i, along: t * dist(a, b), d };
    }
    if (!best) continue;
    const len = wallLength(room, best.wall);
    const width = Math.min(so.width, len);
    const offset = Math.max(0, Math.min(best.along - width / 2, len - width));
    if (!spanIsFree(room, best.wall, offset, offset + width)) continue;
    room = addOpening(room, {
      id: newId(), wallId: room.walls[best.wall]!.id, type: so.type, offset, width,
      height: Math.min(so.height, room.ceilingHeight - so.bottom), sill: so.bottom, hinge: 'start', swing: 'in',
    });
  }

  const items = objectsInRoom(scan, choice).map((o) => {
    const guess = guessFurniture(o);
    const c = place(o.center);
    const notes = [guess.note, o.confidence === 'low' ? 'Scanned with low confidence: check its size and position.' : undefined].filter(Boolean);
    const item: Item = {
      id: newId(),
      kind: guess.kind,
      name: guess.name,
      dims: { width: o.width, depth: o.depth, height: o.height },
      params: { ...getKind(guess.kind).defaults, ...guess.params },
      transform: { x: c[0], z: c[1], y: o.bottom > 0.03 ? o.bottom : 0, rotationY: alignToWalls(frame.rotationY(o.rotationY), room) },
      colors: {},
      source: {
        type: 'scan', objectId: o.id, category: o.category,
        ...(Object.keys(o.attributes).length ? { attributes: o.attributes } : {}),
      },
      ...(guess.locked ? { locked: true } : {}),
      ...(notes.length ? { notes: notes.join(' ') } : {}),
    };
    return nudgeInside(item, room);
  });
  return { room, items };
}

/** A new project holding one room of a scan and its furniture. */
export function projectFromScan(name: string, scan: ScanData, choice: ScanRoom): ProjectDoc {
  const { room, items } = buildRoomFromScan(scan, choice);
  const doc = createProject(name, roomPoints(room));
  const roomId = doc.roomOrder[0]!;
  doc.rooms[roomId] = { ...room, id: roomId };
  const layout = doc.layouts[doc.layoutOrder[0]!]!;
  for (const item of items) {
    layout.items[item.id] = item;
    layout.itemOrder.push(item.id);
  }
  return doc;
}
