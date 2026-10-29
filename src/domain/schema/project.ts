import { z } from 'zod';
import { nanoid } from 'nanoid';
import { FOOT, INCH } from '../units/units';
import type { Vec2 } from '../geometry/vec2';

// Conventions (see CLAUDE.md):
// - All lengths in meters. World is Y-up, floor at y = 0. Plan (x, z) == world (x, z).
// - Room vertices are the interior wall faces, counter-clockwise in (x, z) math
//   orientation (positive signed area). Wall i runs from vertex i to vertex i+1,
//   and `walls` is parallel to `vertices`.
// - Furniture origin is the footprint center on the floor; the front faces local +z.
// - Openings hang on a wall by id. `offset` runs along the wall from its start
//   vertex to the opening's near edge; seen from inside the room, that is the left end.

export const CURRENT_SCHEMA_VERSION = 3;

const vec2 = z.tuple([z.number(), z.number()]);

export const SettingsSchema = z.object({
  unitSystem: z.enum(['imperial', 'metric']),
  precision: z.enum(['1', '1/2', '1/4', '1/8', '1/16', 'cm', 'mm']),
  snapStep: z.number().min(0),
  rotationSnapDeg: z.number().positive(),
  wallSnap: z.boolean(),
  keepInsideRoom: z.boolean(),
});

export const WallSchema = z.object({
  id: z.string(),
  thickness: z.number().positive(),
  heightOverride: z.number().positive().optional(),
});

export const OPENING_TYPES = ['door', 'double_door', 'sliding_door', 'pocket_door', 'opening', 'window'] as const;

export const OpeningSchema = z.object({
  id: z.string(),
  wallId: z.string(),
  type: z.enum(OPENING_TYPES),
  offset: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  /** Height of the bottom of the opening above the floor (0 for doors). */
  sill: z.number().min(0),
  /** The jamb with the hinges (or the pocket): the wall's start or end side. */
  hinge: z.enum(['start', 'end']),
  /** Whether a hinged door swings into the room or out of it. */
  swing: z.enum(['in', 'out']),
});

export const RoomSchema = z.object({
  id: z.string(),
  name: z.string(),
  vertices: z.array(z.object({ id: z.string(), p: vec2 })).min(3),
  walls: z.array(WallSchema),
  ceilingHeight: z.number().positive(),
  openings: z.array(OpeningSchema),
  materials: z.object({ floor: z.string(), walls: z.string() }),
});

export const ItemSchema = z.object({
  id: z.string(),
  kind: z.string(),
  name: z.string(),
  dims: z.object({ width: z.number().positive(), depth: z.number().positive(), height: z.number().positive() }),
  params: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])),
  transform: z.object({ x: z.number(), z: z.number(), y: z.number(), rotationY: z.number() }),
  colors: z.record(z.string(), z.string()),
  originItemId: z.string().optional(),
  source: z.discriminatedUnion('type', [
    z.object({ type: z.literal('manual') }),
    /** Imported from a RoomPlan scan: the object's id, category and attributes there. */
    z.object({
      type: z.literal('scan'),
      objectId: z.string(),
      category: z.string(),
      attributes: z.record(z.string(), z.string()).optional(),
    }),
  ]),
  locked: z.boolean().optional(),
  hidden: z.boolean().optional(),
  notes: z.string().optional(),
});

export const LayoutSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  name: z.string(),
  kind: z.enum(['as_is', 'proposal']),
  items: z.record(z.string(), ItemSchema),
  itemOrder: z.array(z.string()),
});

export const ProjectDocSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  id: z.string(),
  name: z.string(),
  clientName: z.string().optional(),
  notes: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  settings: SettingsSchema,
  rooms: z.record(z.string(), RoomSchema),
  roomOrder: z.array(z.string()),
  layouts: z.record(z.string(), LayoutSchema),
  layoutOrder: z.array(z.string()),
});

export type Settings = z.infer<typeof SettingsSchema>;
export type Wall = z.infer<typeof WallSchema>;
export type Opening = z.infer<typeof OpeningSchema>;
export type OpeningType = Opening['type'];
export type Room = z.infer<typeof RoomSchema>;
export type Item = z.infer<typeof ItemSchema>;
export type Layout = z.infer<typeof LayoutSchema>;
export type ProjectDoc = z.infer<typeof ProjectDocSchema>;

export const DEFAULT_WALL_THICKNESS = 4.5 * INCH;
export const DEFAULT_CEILING_HEIGHT = 8 * FOOT;

export const newId = () => nanoid(10);

export function defaultSettings(): Settings {
  return {
    unitSystem: 'imperial',
    precision: '1/4',
    snapStep: INCH,
    rotationSnapDeg: 15,
    wallSnap: true,
    keepInsideRoom: true,
  };
}

export function makeRoom(name: string, points: Vec2[]): Room {
  return {
    id: newId(),
    name,
    vertices: points.map((p) => ({ id: newId(), p: [p[0], p[1]] as Vec2 })),
    walls: points.map(() => ({ id: newId(), thickness: DEFAULT_WALL_THICKNESS })),
    ceilingHeight: DEFAULT_CEILING_HEIGHT,
    openings: [],
    materials: { floor: '#d9c3a3', walls: '#f3f0ea' },
  };
}

export function createProject(name: string, roomPoints: Vec2[]): ProjectDoc {
  const now = new Date().toISOString();
  const room = makeRoom('Room 1', roomPoints);
  const layout: Layout = { id: newId(), roomId: room.id, name: 'As-is', kind: 'as_is', items: {}, itemOrder: [] };
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: newId(),
    name,
    createdAt: now,
    updatedAt: now,
    settings: defaultSettings(),
    rooms: { [room.id]: room },
    roomOrder: [room.id],
    layouts: { [layout.id]: layout },
    layoutOrder: [layout.id],
  };
}

type RawDoc = { schemaVersion?: unknown; rooms?: Record<string, { openings?: unknown }> };

/** Upgrades a document from the keyed schema version to the next one. */
const MIGRATIONS: Record<number, (doc: RawDoc) => RawDoc> = {
  // v2: openings gained `hinge` and `swing`; 'cased' and 'slider' were renamed.
  1: (doc) => ({
    ...doc,
    schemaVersion: 2,
    rooms: Object.fromEntries(
      Object.entries(doc.rooms ?? {}).map(([id, room]) => [
        id,
        Array.isArray(room?.openings)
          ? {
              ...room,
              openings: room.openings.map((o: { type?: unknown }) => ({
                hinge: 'start',
                swing: 'in',
                ...o,
                type: o.type === 'cased' ? 'opening' : o.type === 'slider' ? 'sliding_door' : o.type,
              })),
            }
          : room,
      ]),
    ),
  }),
  // v3: items can come from a scan (`source.type: 'scan'`); nothing to convert.
  2: (doc) => ({ ...doc, schemaVersion: 3 }),
};

/** Validates a document loaded from storage or a file, migrating older versions. */
export function parseProjectDoc(raw: unknown): ProjectDoc {
  let doc = raw as RawDoc | null;
  const version = doc?.schemaVersion;
  if (typeof version === 'number' && version > CURRENT_SCHEMA_VERSION) {
    throw new Error(`This project was saved by a newer version of the app (schema ${version}).`);
  }
  while (doc && typeof doc.schemaVersion === 'number' && MIGRATIONS[doc.schemaVersion]) {
    doc = MIGRATIONS[doc.schemaVersion]!(doc);
  }
  return ProjectDocSchema.parse(doc);
}
