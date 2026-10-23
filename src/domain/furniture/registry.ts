import type { Vec2 } from '../geometry/vec2';
import { localToWorld } from '../geometry/vec2';
import { type Item, newId } from '../schema/project';
import { chair, sofa } from './kinds/seating';
import { box, cabinet, rug } from './kinds/storage';
import { bed, table } from './kinds/tables';
import type { Category, KindDef, Part, Preset } from './types';

export const KINDS: KindDef[] = [sofa, chair, table, bed, cabinet, rug, box];
const byKind = new Map(KINDS.map((k) => [k.kind, k]));

export const CATEGORY_LABELS: Record<Category, string> = {
  seating: 'Seating',
  tables: 'Tables',
  beds: 'Beds',
  storage: 'Storage',
  rugs: 'Rugs',
  generic: 'Generic',
};

export const getKind = (kind: string): KindDef => byKind.get(kind) ?? box;

export function createItem(def: KindDef, preset: Preset, at: Vec2): Item {
  return {
    id: newId(),
    kind: def.kind,
    name: preset.label,
    dims: { ...preset.dims },
    params: { ...def.defaults, ...preset.params },
    transform: { x: at[0], z: at[1], y: 0, rotationY: 0 },
    colors: {},
    source: { type: 'manual' },
  };
}

export const itemParts = (item: Item): Part[] => getKind(item.kind).parts(item.dims, item.params);

/** The item's footprint polygon in world plan coordinates. */
export function itemFootprint(item: Item): Vec2[] {
  const local = getKind(item.kind).footprint(item.dims, item.params);
  const c: Vec2 = [item.transform.x, item.transform.z];
  return local.map((p) => localToWorld(p, c, item.transform.rotationY));
}

export function itemColor(item: Item, slot: string): string {
  const def = getKind(item.kind);
  return item.colors[slot] ?? def.defaultColors[slot as keyof typeof def.defaultColors] ?? '#b0aba3';
}

/** Top-down shapes of an item's parts, lowest first, for drawing plan symbols. */
export type PlanShape =
  | { type: 'rect'; x: number; z: number; w: number; d: number; r: number; slot: string; top: number }
  | { type: 'ellipse'; x: number; z: number; rx: number; rz: number; slot: string; top: number };

export function planShapes(parts: Part[]): PlanShape[] {
  const shapes: PlanShape[] = parts.map((p) => {
    if (p.shape === 'box') {
      return {
        type: 'rect', x: p.pos[0], z: p.pos[2], w: p.size[0], d: p.size[2],
        r: Math.min(p.radius ?? 0, p.size[0] / 2, p.size[2] / 2), slot: p.slot, top: p.pos[1] + p.size[1] / 2,
      };
    }
    const r = Math.max(p.radius, p.radiusTop ?? p.radius);
    if (p.axis === 'y') {
      return { type: 'ellipse', x: p.pos[0], z: p.pos[2], rx: r, rz: r * (p.stretch ?? 1), slot: p.slot, top: p.pos[1] + p.length / 2 };
    }
    const along = p.axis === 'x';
    return {
      type: 'rect', x: p.pos[0], z: p.pos[2], w: along ? p.length : 2 * r, d: along ? 2 * r : p.length,
      r: r, slot: p.slot, top: p.pos[1] + r,
    };
  });
  return shapes.sort((a, b) => a.top - b.top);
}
