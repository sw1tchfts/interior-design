import { isSimplePolygon, outwardNormal, signedArea } from '../geometry/polygon';
import { type Vec2, add, dist, lerp, lineIntersection, normalize, scale, sub } from '../geometry/vec2';
import { type Room, newId } from '../schema/project';
import { INCH } from '../units/units';

export const MIN_WALL_LENGTH = 2 * INCH;

export const roomPoints = (room: Room): Vec2[] => room.vertices.map((v) => v.p);

export function rectangleRoomPoints(width: number, length: number): Vec2[] {
  return [[0, 0], [width, 0], [width, length], [0, length]];
}

/** L-shaped room with the notch cut from the far corner (+x, +z). */
export function lShapeRoomPoints(width: number, length: number, notchWidth: number, notchLength: number): Vec2[] {
  return [
    [0, 0],
    [width, 0],
    [width, length - notchLength],
    [width - notchWidth, length - notchLength],
    [width - notchWidth, length],
    [0, length],
  ];
}

export type Validation = { ok: true } | { ok: false; reason: string };

export function validateRoomPoints(pts: Vec2[]): Validation {
  if (pts.length < 3) return { ok: false, reason: 'A room needs at least 3 corners.' };
  for (let i = 0; i < pts.length; i++) {
    if (dist(pts[i]!, pts[(i + 1) % pts.length]!) < MIN_WALL_LENGTH) {
      return { ok: false, reason: 'Walls must be at least 2" long.' };
    }
  }
  if (!isSimplePolygon(pts)) return { ok: false, reason: 'Walls cannot cross each other.' };
  return { ok: true };
}

/** Ensures counter-clockwise winding, keeping each wall attached to the same edge. */
export function normalizeWinding(room: Room): Room {
  if (signedArea(roomPoints(room)) >= 0) return room;
  const n = room.vertices.length;
  const vertices = [...room.vertices].reverse();
  const walls = vertices.map((_, k) => room.walls[(((n - 2 - k) % n) + n) % n]!);
  return { ...room, vertices, walls };
}

/** Replaces the room outline. Keeps ids when the corner count is unchanged. */
export function setRoomPoints(room: Room, pts: Vec2[]): Room {
  const same = pts.length === room.vertices.length;
  const thickness = room.walls[0]?.thickness ?? 0.1143;
  const next: Room = {
    ...room,
    vertices: pts.map((p, i) => ({ id: same ? room.vertices[i]!.id : newId(), p: [p[0], p[1]] as Vec2 })),
    walls: pts.map((_, i) => (same ? room.walls[i]! : { id: newId(), thickness })),
    openings: same ? room.openings : [],
  };
  return normalizeWinding(next);
}

export function moveVertex(room: Room, index: number, p: Vec2): Room {
  return {
    ...room,
    vertices: room.vertices.map((v, i) => (i === index ? { ...v, p: [p[0], p[1]] as Vec2 } : v)),
  };
}

export function wallEndpoints(room: Room, wallIndex: number): [Vec2, Vec2] {
  const n = room.vertices.length;
  return [room.vertices[wallIndex]!.p, room.vertices[(wallIndex + 1) % n]!.p];
}

export function wallLength(room: Room, wallIndex: number): number {
  const [a, b] = wallEndpoints(room, wallIndex);
  return dist(a, b);
}

/**
 * Sets wall i (A to B) to `length`, keeping A fixed and every corner angle unchanged.
 * B slides along AB; the next wall (B to C) moves parallel so C slides along the
 * wall after it (C to D). Triangles can't keep their angles, so only B moves.
 */
export function setWallLength(room: Room, wallIndex: number, length: number): Room {
  const pts = roomPoints(room);
  const n = pts.length;
  const iA = wallIndex;
  const iB = (wallIndex + 1) % n;
  const iC = (wallIndex + 2) % n;
  const iD = (wallIndex + 3) % n;
  const A = pts[iA]!, B = pts[iB]!, C = pts[iC]!, D = pts[iD]!;
  const dir = normalize(sub(B, A));
  const B2 = add(A, scale(dir, length));
  const next = [...pts];
  next[iB] = B2;
  if (n >= 4) {
    const C2 = lineIntersection(B2, sub(C, B), C, sub(D, C)) ?? add(C, sub(B2, B));
    next[iC] = C2;
  }
  return pts.reduce((r, _, i) => (next[i] === pts[i] ? r : moveVertex(r, i, next[i]!)), room);
}

/**
 * Moves wall i parallel to itself by `delta` meters along its outward normal.
 * Neighboring walls keep their direction and stretch or shrink to meet it.
 */
export function moveWall(room: Room, wallIndex: number, delta: number): Room {
  const pts = roomPoints(room);
  const n = pts.length;
  const iA = wallIndex;
  const iB = (wallIndex + 1) % n;
  const prev = pts[(iA - 1 + n) % n]!;
  const next = pts[(iB + 1) % n]!;
  const A = pts[iA]!, B = pts[iB]!;
  const shift = scale(outwardNormal(A, B), delta);
  const A1 = add(A, shift);
  const B1 = add(B, shift);
  const dirAB = sub(B, A);
  const A2 = lineIntersection(A1, dirAB, prev, sub(A, prev)) ?? A1;
  const B2 = lineIntersection(A1, dirAB, B, sub(next, B)) ?? B1;
  return moveVertex(moveVertex(room, iA, A2), iB, B2);
}

/** Splits wall i at parameter t, inserting a new corner. */
export function insertVertex(room: Room, wallIndex: number, t = 0.5): Room {
  const [a, b] = wallEndpoints(room, wallIndex);
  const p = lerp(a, b, t);
  const vertices = [...room.vertices];
  vertices.splice(wallIndex + 1, 0, { id: newId(), p });
  const walls = [...room.walls];
  walls.splice(wallIndex + 1, 0, { ...room.walls[wallIndex]!, id: newId() });
  return { ...room, vertices, walls };
}

/** Removes a corner, merging its two walls. Rooms keep at least 3 corners. */
export function deleteVertex(room: Room, index: number): Room {
  const n = room.vertices.length;
  if (n <= 3) return room;
  const vertices = room.vertices.filter((_, i) => i !== index);
  const walls = room.walls.filter((_, i) => i !== index);
  // Wall (index - 1) now runs to the vertex after the removed one.
  return { ...room, vertices, walls };
}

export const wallLabel = (index: number) =>
  index < 26 ? String.fromCharCode(65 + index) : `W${index + 1}`;
