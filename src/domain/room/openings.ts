import { outwardNormal } from '../geometry/polygon';
import { type Vec2, add, closestPointOnSegment, cross, dist, normalize, scale, sub } from '../geometry/vec2';
import { type Opening, type OpeningType, type Room, newId } from '../schema/project';
import { snapToGrid } from '../snapping/snapping';
import { inches } from '../units/units';
import { wallEndpoints, wallLength } from './roomOps';

export interface OpeningDef {
  label: string;
  /** Hinged doors draw a swing and can open into or out of the room. */
  swings: boolean;
  /** The hinge (or pocket) side matters. */
  handed: boolean;
  defaults: { width: number; height: number; sill: number };
}

export const OPENING_DEFS: Record<OpeningType, OpeningDef> = {
  door: { label: 'Door', swings: true, handed: true, defaults: { width: inches(32), height: inches(80), sill: 0 } },
  double_door: { label: 'Double door', swings: true, handed: false, defaults: { width: inches(60), height: inches(80), sill: 0 } },
  sliding_door: { label: 'Sliding door', swings: false, handed: false, defaults: { width: inches(72), height: inches(80), sill: 0 } },
  pocket_door: { label: 'Pocket door', swings: false, handed: true, defaults: { width: inches(30), height: inches(80), sill: 0 } },
  opening: { label: 'Cased opening', swings: false, handed: false, defaults: { width: inches(36), height: inches(80), sill: 0 } },
  window: { label: 'Window', swings: false, handed: false, defaults: { width: inches(36), height: inches(48), sill: inches(32) } },
};

export interface OpeningPreset {
  id: string;
  label: string;
  type: OpeningType;
  width: number;
  height: number;
  sill: number;
}

const preset = (id: string, label: string, type: OpeningType, size: Partial<OpeningDef['defaults']> = {}): OpeningPreset => ({
  id, label, type, ...OPENING_DEFS[type].defaults, ...size,
});

export const OPENING_PRESETS: OpeningPreset[] = [
  preset('door-30', 'Interior door', 'door', { width: inches(30) }),
  preset('door-36', 'Entry door', 'door', { width: inches(36) }),
  preset('double-door-60', 'Double door', 'double_door'),
  preset('sliding-door-72', 'Sliding door', 'sliding_door'),
  preset('pocket-door-30', 'Pocket door', 'pocket_door'),
  preset('opening-36', 'Cased opening', 'opening'),
  preset('window-36', 'Window', 'window'),
  preset('window-60', 'Wide window', 'window', { width: inches(60) }),
  preset('window-72', 'Picture window', 'window', { width: inches(72), height: inches(60), sill: inches(20) }),
];

export function createOpening(p: OpeningPreset, wallId: string, offset: number): Opening {
  return { id: newId(), wallId, type: p.type, offset, width: p.width, height: p.height, sill: p.sill, hinge: 'start', swing: 'in' };
}

/** A wall's interior face as a local frame: `dir` runs from start to end, `outward` leaves the room. */
export interface WallFrame {
  a: Vec2;
  b: Vec2;
  dir: Vec2;
  outward: Vec2;
  length: number;
}

export function wallFrame(room: Room, wallIndex: number): WallFrame {
  const [a, b] = wallEndpoints(room, wallIndex);
  return { a, b, dir: normalize(sub(b, a)), outward: outwardNormal(a, b), length: dist(a, b) };
}

/** Point on a wall `along` meters from its start, `out` meters outward from the interior face. */
export const wallPoint = (f: WallFrame, along: number, out = 0): Vec2 => add(add(f.a, scale(f.dir, along)), scale(f.outward, out));

export interface OpeningSpan {
  wallIndex: number;
  /** Distances from the wall's start to each edge of the opening. */
  start: number;
  end: number;
}

export const wallIndexOf = (room: Room, wallId: string) => room.walls.findIndex((w) => w.id === wallId);

/**
 * Where an opening actually sits. Stored offsets aren't rewritten when walls are
 * resized, so a shortened wall pushes the opening back inside (and growing the
 * wall again restores it). Null if its wall no longer exists.
 */
export function openingSpan(room: Room, o: Opening): OpeningSpan | null {
  const wallIndex = wallIndexOf(room, o.wallId);
  if (wallIndex < 0) return null;
  const len = wallLength(room, wallIndex);
  const width = Math.min(o.width, len);
  const start = Math.max(0, Math.min(o.offset, len - width));
  return { wallIndex, start, end: start + width };
}

const OVERLAP_TOLERANCE = 1e-6;

/** True if [start, end] on the wall is clear of other openings (touching is fine). */
export function spanIsFree(room: Room, wallIndex: number, start: number, end: number, ignoreId?: string): boolean {
  const wallId = room.walls[wallIndex]?.id;
  return room.openings.every((o) => {
    if (o.id === ignoreId || o.wallId !== wallId) return true;
    const s = openingSpan(room, o)!;
    return end <= s.start + OVERLAP_TOLERANCE || start >= s.end - OVERLAP_TOLERANCE;
  });
}

/** Stretches of a wall not taken by openings. */
function freeGaps(room: Room, wallIndex: number): [number, number][] {
  const wallId = room.walls[wallIndex]!.id;
  const taken = room.openings
    .filter((o) => o.wallId === wallId)
    .map((o) => openingSpan(room, o)!)
    .sort((p, q) => p.start - q.start);
  const gaps: [number, number][] = [];
  let at = 0;
  for (const s of taken) {
    if (s.start > at) gaps.push([at, s.start]);
    at = Math.max(at, s.end);
  }
  const len = wallLength(room, wallIndex);
  if (len > at) gaps.push([at, len]);
  return gaps;
}

/**
 * Finds a place for a new opening: centered in the widest free stretch of the first
 * listed wall that has room. Lists every wall, longest first, when `walls` is omitted.
 */
export function findOpeningSpot(
  room: Room,
  width: number,
  snapStep: number,
  walls?: number[],
): { wallIndex: number; offset: number } | null {
  const order = walls ?? room.walls.map((_, i) => i).sort((i, j) => wallLength(room, j) - wallLength(room, i));
  for (const wallIndex of order) {
    const gap = freeGaps(room, wallIndex)
      .filter(([s, e]) => e - s >= width - OVERLAP_TOLERANCE)
      .sort((p, q) => q[1] - q[0] - (p[1] - p[0]))[0];
    if (!gap) continue;
    const centered = (gap[0] + gap[1] - width) / 2;
    const snapped = snapToGrid(centered, snapStep);
    const offset = snapped >= gap[0] && snapped + width <= gap[1] ? snapped : centered;
    return { wallIndex, offset };
  }
  return null;
}

/**
 * Where a dragged opening lands: on the wall nearest the pointer (among walls long
 * enough to hold it), `grab` meters before the pointer, snapped to the grid and kept
 * on the wall. Null if that spot overlaps another opening.
 */
export function dragOpeningTo(
  room: Room,
  o: Opening,
  pointer: Vec2,
  grab: number,
  snapStep: number,
): { wallId: string; offset: number } | null {
  let best: { wallIndex: number; along: number; d: number } | null = null;
  for (let i = 0; i < room.walls.length; i++) {
    const [a, b] = wallEndpoints(room, i);
    const len = dist(a, b);
    if (len < o.width) continue;
    const { point, t } = closestPointOnSegment(pointer, a, b);
    const d = dist(pointer, point);
    if (!best || d < best.d) best = { wallIndex: i, along: t * len, d };
  }
  if (!best) return null;
  const len = wallLength(room, best.wallIndex);
  const offset = Math.max(0, Math.min(snapToGrid(best.along - grab, snapStep), len - o.width));
  if (!spanIsFree(room, best.wallIndex, offset, offset + o.width, o.id)) return null;
  return { wallId: room.walls[best.wallIndex]!.id, offset };
}

export const addOpening = (room: Room, o: Opening): Room => ({ ...room, openings: [...room.openings, o] });

export const removeOpening = (room: Room, id: string): Room => ({ ...room, openings: room.openings.filter((o) => o.id !== id) });

export const updateOpening = (room: Room, id: string, patch: Partial<Opening>): Room => ({
  ...room,
  openings: room.openings.map((o) => (o.id === id ? { ...o, ...patch } : o)),
});

/**
 * Moves or resizes an opening along its wall, keeping it on the wall.
 * Null if it would overlap another opening.
 */
export function setOpeningSpan(room: Room, id: string, offset: number, width: number): Room | null {
  const o = room.openings.find((x) => x.id === id);
  const wallIndex = o ? wallIndexOf(room, o.wallId) : -1;
  if (!o || wallIndex < 0) return null;
  const len = wallLength(room, wallIndex);
  const w = Math.min(width, len);
  const start = Math.max(0, Math.min(offset, len - w));
  if (!spanIsFree(room, wallIndex, start, start + w, id)) return null;
  return updateOpening(room, id, { offset: start, width: w });
}

/** Switches type, swapping in the new type's default height and sill when going between doors and windows. */
export function changeOpeningType(o: Opening, type: OpeningType): Opening {
  const d = OPENING_DEFS[type].defaults;
  const wasRaised = o.sill > 0;
  const isRaised = d.sill > 0;
  return wasRaised === isRaised ? { ...o, type } : { ...o, type, height: d.height, sill: d.sill };
}

/** A door leaf in plan: it turns about `hinge`, from `closed` (across the opening) to `open` (90 degrees). */
export interface DoorLeaf {
  hinge: Vec2;
  closed: Vec2;
  open: Vec2;
  /** SVG arc sweep flag for drawing the swing from `open` to `closed`. */
  sweep: 0 | 1;
}

/** Leaves of a hinged door, drawn on the face it swings toward. Walls are `thickness` thick. */
export function doorLeaves(room: Room, o: Opening, thickness: number): DoorLeaf[] {
  const span = openingSpan(room, o);
  if (!span || !OPENING_DEFS[o.type].swings) return [];
  const f = wallFrame(room, span.wallIndex);
  const face = o.swing === 'in' ? 0 : thickness;
  const toward = scale(f.outward, o.swing === 'in' ? -1 : 1);
  const leaf = (hingeAt: number, closedAt: number): DoorLeaf => {
    const hinge = wallPoint(f, hingeAt, face);
    const closed = wallPoint(f, closedAt, face);
    const open = add(hinge, scale(toward, Math.abs(closedAt - hingeAt)));
    return { hinge, closed, open, sweep: cross(sub(open, hinge), sub(closed, hinge)) > 0 ? 1 : 0 };
  };
  if (o.type === 'double_door') {
    const mid = (span.start + span.end) / 2;
    return [leaf(span.start, mid), leaf(span.end, mid)];
  }
  return o.hinge === 'start' ? [leaf(span.start, span.end)] : [leaf(span.end, span.start)];
}
