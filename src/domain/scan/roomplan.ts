import { z } from 'zod';
import type { Vec2 } from '../geometry/vec2';
import type { OpeningType } from '../schema/project';

// Reads Apple RoomPlan `CapturedRoom` JSON (as exported by apps such as OpenPlan3D)
// into plain scan data in our conventions: meters, plan points [x, z], heights
// measured up from the scanned floor.
//
// RoomPlan transforms are column-major 4x4 matrices in a Y-up, right-handed
// frame like ours: column 0 is the element's width axis, column 2 its depth
// axis (the side furniture faces), and indices 12-14 the center.

export interface ScanWall {
  id: string;
  a: Vec2;
  b: Vec2;
  height: number;
  /** 0 when the scan doesn't know (raw RoomPlan walls have no thickness). */
  thickness: number;
}

export interface ScanOpening {
  id: string;
  type: OpeningType;
  center: Vec2;
  width: number;
  height: number;
  /** Height of the bottom edge above the floor. */
  bottom: number;
}

export type ScanConfidence = 'low' | 'medium' | 'high';

export interface ScanObject {
  id: string;
  category: string;
  attributes: Record<string, string>;
  center: Vec2;
  bottom: number;
  width: number;
  height: number;
  depth: number;
  /** Matches our `rotationY`: the side the object faces is local +z. */
  rotationY: number;
  confidence?: ScanConfidence;
}

export interface ScanSection {
  label: string;
  center: Vec2;
}

export interface ScanData {
  walls: ScanWall[];
  openings: ScanOpening[];
  objects: ScanObject[];
  sections: ScanSection[];
  /** Floor outlines, when the scan provides them (a bounding shape on multi-room scans). */
  floors: Vec2[][];
}

const num3 = z.array(z.number()).length(3);
const mat4 = z.array(z.number()).length(16);
/** RoomPlan encodes enums as `{ "door": { "isOpen": false } }`; accept plain strings too. */
const tagged = z.union([z.string(), z.record(z.string(), z.unknown())]);

const SurfaceSchema = z.object({
  identifier: z.string(),
  category: tagged,
  dimensions: num3,
  transform: mat4,
  polygonCorners: z.array(num3).optional(),
  // openPlan3D's editable-plan extension.
  style: z.string().optional(),
  sillHeight: z.number().optional(),
});

const ObjectSchema = z.object({
  identifier: z.string(),
  category: tagged,
  dimensions: num3,
  transform: mat4,
  attributes: z.record(z.string(), z.unknown()).optional(),
  confidence: tagged.optional(),
});

const CapturedRoomSchema = z.object({
  walls: z.array(SurfaceSchema),
  doors: z.array(SurfaceSchema).default([]),
  windows: z.array(SurfaceSchema).default([]),
  openings: z.array(SurfaceSchema).default([]),
  objects: z.array(ObjectSchema).default([]),
  floors: z.array(SurfaceSchema).default([]),
  sections: z.array(z.object({ label: z.string(), center: num3 })).default([]),
});

type Surface = z.infer<typeof SurfaceSchema>;

const tagName = (t: z.infer<typeof tagged>) => (typeof t === 'string' ? t : (Object.keys(t)[0] ?? 'unknown'));
const planCenter = (t: number[]): Vec2 => [t[12]!, t[14]!];

function axis(t: number[], col: 0 | 2): Vec2 {
  const v: Vec2 = [t[col * 4]!, t[col * 4 + 2]!];
  const len = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / len, v[1] / len];
}

/** Applies a column-major 4x4 transform to a local point; returns [x, y, z]. */
function apply(t: number[], [x, y, z]: number[]): [number, number, number] {
  return [
    t[0]! * x! + t[4]! * y! + t[8]! * z! + t[12]!,
    t[1]! * x! + t[5]! * y! + t[9]! * z! + t[13]!,
    t[2]! * x! + t[6]! * y! + t[10]! * z! + t[14]!,
  ];
}

const DOOR_STYLES: Record<string, OpeningType> = { double: 'double_door', sliding: 'sliding_door', patio: 'sliding_door' };

/** Parses RoomPlan JSON. Throws an Error with a readable message if it isn't one. */
export function parseRoomPlan(raw: unknown): ScanData {
  const parsed = CapturedRoomSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("This doesn't look like a RoomPlan scan (expected walls, doors, windows and objects).");
  }
  const room = parsed.data;
  if (room.walls.length === 0) throw new Error('The scan has no walls.');

  // The scan's origin is wherever the phone started; measure heights from the floor instead.
  const floorY = Math.min(...room.walls.map((w) => w.transform[13]! - w.dimensions[1]! / 2));

  const walls: ScanWall[] = room.walls
    .filter((w) => w.dimensions[0]! > 0.01)
    .map((w) => {
      const c = planCenter(w.transform);
      const d = axis(w.transform, 0);
      const half = w.dimensions[0]! / 2;
      return {
        id: w.identifier,
        a: [c[0] - d[0] * half, c[1] - d[1] * half],
        b: [c[0] + d[0] * half, c[1] + d[1] * half],
        height: w.dimensions[1]!,
        thickness: w.dimensions[2]!,
      };
    });

  const opening = (s: Surface, type: OpeningType): ScanOpening => {
    const [width, height] = s.dimensions as [number, number];
    const bottom = s.sillHeight ?? Math.max(0, s.transform[13]! - height / 2 - floorY);
    return { id: s.identifier, type, center: planCenter(s.transform), width, height, bottom: type === 'window' ? bottom : 0 };
  };

  const objects: ScanObject[] = room.objects.map((o) => {
    const z = axis(o.transform, 2);
    const [width, height, depth] = o.dimensions as [number, number, number];
    const attributes = Object.fromEntries(
      Object.entries(o.attributes ?? {}).filter((e): e is [string, string] => typeof e[1] === 'string'),
    );
    const confidence = o.confidence && tagName(o.confidence);
    return {
      id: o.identifier,
      category: tagName(o.category),
      attributes,
      center: planCenter(o.transform),
      bottom: Math.max(0, o.transform[13]! - height / 2 - floorY),
      width,
      height,
      depth,
      rotationY: Math.atan2(z[0], z[1]),
      confidence: confidence === 'low' || confidence === 'medium' || confidence === 'high' ? confidence : undefined,
    };
  });

  return {
    walls,
    openings: [
      ...room.doors.map((d) => opening(d, DOOR_STYLES[d.style ?? ''] ?? 'door')),
      ...room.windows.map((w) => opening(w, 'window')),
      ...room.openings.map((o) => opening(o, 'opening')),
    ],
    objects,
    sections: room.sections.map((s) => ({ label: s.label, center: [s.center[0]!, s.center[2]!] })),
    floors: room.floors
      .filter((f) => (f.polygonCorners?.length ?? 0) >= 3)
      .map((f) => f.polygonCorners!.map((p) => {
        const w = apply(f.transform, p);
        return [w[0], w[2]] as Vec2;
      })),
  };
}
