import { pointInPolygon, signedArea } from '../geometry/polygon';
import { type Vec2, closestPointOnSegment, cross, dist, normalize, sub } from '../geometry/vec2';
import type { ScanData } from './roomplan';

export interface ScanRoom {
  /** Outline along the wall lines, counter-clockwise. */
  points: Vec2[];
  label: string;
  area: number;
}

/** Wall ends closer than this are treated as meeting. */
const JOIN = 0.08;
const MIN_ROOM_AREA = 0.5;
/** Corners turning less than this are dropped as noise. */
const STRAIGHT_DEG = 4;

const LABELS: Record<string, string> = {
  bedroom: 'Bedroom',
  bathroom: 'Bathroom',
  kitchen: 'Kitchen',
  livingRoom: 'Living room',
  diningRoom: 'Dining room',
  unidentified: 'Room',
};

function prettyLabel(label: string): string {
  return LABELS[label] ?? (label.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()) || 'Room');
}

/** Splits wall segments wherever another wall's end touches them (T-junctions). */
function splitSegments(segs: [Vec2, Vec2][]): [Vec2, Vec2][] {
  const ends = segs.flatMap(([a, b]) => [a, b]);
  return segs.flatMap(([a, b]) => {
    const len = dist(a, b);
    const cuts = ends
      .map((p) => ({ p, ...closestPointOnSegment(p, a, b) }))
      .filter(({ p, point, t }) => t * len > JOIN && (1 - t) * len > JOIN && dist(p, point) < JOIN)
      .map(({ t }) => t)
      .sort((x, y) => x - y);
    const ts = [0, ...cuts, 1];
    const at = (t: number): Vec2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    return ts.slice(1).map((t, i): [Vec2, Vec2] => [at(ts[i]!), at(t)]);
  });
}

/** Drops corners that barely turn, so a wall scanned in pieces becomes one wall. */
function simplify(pts: Vec2[]): Vec2[] {
  let out = pts;
  for (let changed = true; changed && out.length > 3; ) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const prev = out[(i - 1 + out.length) % out.length]!;
      const next = out[(i + 1) % out.length]!;
      const u = normalize(sub(out[i]!, prev));
      const v = normalize(sub(next, out[i]!));
      const turn = Math.abs(Math.atan2(cross(u, v), u[0] * v[0] + u[1] * v[1]));
      if (turn < (STRAIGHT_DEG * Math.PI) / 180 || dist(prev, out[i]!) < 0.01) {
        out = out.filter((_, k) => k !== i);
        changed = true;
        break;
      }
    }
  }
  return out;
}

/**
 * Finds the rooms in a scan: the closed loops formed by its walls, labeled with
 * RoomPlan's section names where a section center falls inside. Falls back to
 * the scan's floor outline when the walls don't close.
 */
export function findScanRooms(scan: ScanData): ScanRoom[] {
  // Nodes: wall ends merged when they're within JOIN of each other.
  const nodes: Vec2[] = [];
  const nodeOf = (p: Vec2) => {
    const i = nodes.findIndex((n) => dist(n, p) < JOIN);
    if (i >= 0) return i;
    nodes.push(p);
    return nodes.length - 1;
  };
  const adj = new Map<number, Set<number>>();
  const link = (i: number, j: number) => {
    if (i === j) return;
    if (!adj.has(i)) adj.set(i, new Set());
    if (!adj.has(j)) adj.set(j, new Set());
    adj.get(i)!.add(j);
    adj.get(j)!.add(i);
  };
  for (const [a, b] of splitSegments(scan.walls.map((w) => [w.a, w.b]))) link(nodeOf(a), nodeOf(b));

  // Dangling wall ends can't bound a room.
  for (let pruned = true; pruned; ) {
    pruned = false;
    for (const [i, ns] of adj) {
      if (ns.size >= 2) continue;
      for (const j of ns) adj.get(j)!.delete(i);
      adj.delete(i);
      pruned = true;
    }
  }

  // Trace faces with the face on the left of each directed edge: at each node, take
  // the neighbor just clockwise of the one we came from. Interior faces come out
  // counter-clockwise (positive area); the outside comes out clockwise.
  const angle = (from: number, to: number) => Math.atan2(nodes[to]![1] - nodes[from]![1], nodes[to]![0] - nodes[from]![0]);
  const sorted = new Map([...adj].map(([i, ns]) => [i, [...ns].sort((p, q) => angle(i, p) - angle(i, q))]));
  const seen = new Set<string>();
  const loops: Vec2[][] = [];
  for (const [start, ns] of sorted) {
    for (const first of ns) {
      if (seen.has(`${start}>${first}`)) continue;
      const loop: number[] = [];
      let [u, v] = [start, first];
      while (!seen.has(`${u}>${v}`) && loop.length <= nodes.length) {
        seen.add(`${u}>${v}`);
        loop.push(u);
        const around = sorted.get(v)!;
        const back = around.indexOf(u);
        const w = around[(back - 1 + around.length) % around.length]!;
        [u, v] = [v, w];
      }
      loops.push(loop.map((i) => nodes[i]!));
    }
  }

  let rooms = loops
    .map(simplify)
    .filter((pts) => pts.length >= 3 && signedArea(pts) > MIN_ROOM_AREA)
    .map((points) => ({ points, label: 'Room', area: signedArea(points) }));
  if (rooms.length === 0) {
    rooms = scan.floors
      .map((f) => (signedArea(f) < 0 ? [...f].reverse() : f))
      .filter((f) => signedArea(f) > MIN_ROOM_AREA)
      .map((points) => ({ points, label: 'Room', area: signedArea(points) }));
  }

  for (const room of rooms) {
    const section = scan.sections.find((s) => pointInPolygon(s.center, room.points));
    if (section) room.label = prettyLabel(section.label);
  }
  // Number repeated names: "Bedroom 1", "Bedroom 2".
  const counts = new Map<string, number>();
  for (const r of rooms) counts.set(r.label, (counts.get(r.label) ?? 0) + 1);
  const seenNames = new Map<string, number>();
  for (const r of rooms) {
    if (counts.get(r.label)! < 2) continue;
    const n = (seenNames.get(r.label) ?? 0) + 1;
    seenNames.set(r.label, n);
    r.label = `${r.label} ${n}`;
  }
  return rooms.sort((p, q) => q.area - p.area);
}
