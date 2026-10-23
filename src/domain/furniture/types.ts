import type { Vec2 } from '../geometry/vec2';

export type Vec3 = [number, number, number];
export type MaterialSlot = 'body' | 'cushion' | 'legs' | 'accent' | 'metal' | 'bedding';
export type ParamValue = number | string | boolean;
export type Params = Record<string, ParamValue>;

export interface Dims {
  width: number;
  depth: number;
  height: number;
}

/**
 * A primitive in the item's local frame (origin at footprint center on the floor,
 * front facing +z). The union of all parts must exactly fill width x height x depth.
 */
export type Part =
  | { shape: 'box'; size: Vec3; pos: Vec3; radius?: number; slot: MaterialSlot }
  | {
      shape: 'cylinder';
      axis: 'x' | 'y' | 'z';
      length: number;
      /** Bottom radius (or the -axis end). */
      radius: number;
      radiusTop?: number;
      /** For axis 'y' only: z radius = x radius * stretch (ovals). */
      stretch?: number;
      pos: Vec3;
      slot: MaterialSlot;
    };

export type ParamField =
  | { key: string; label: string; type: 'length'; min: number; max: number }
  | { key: string; label: string; type: 'int'; min: number; max: number }
  | { key: string; label: string; type: 'select'; options: { value: string; label: string }[] }
  | { key: string; label: string; type: 'bool' };

export type Category = 'seating' | 'tables' | 'beds' | 'storage' | 'rugs' | 'generic';

export interface Preset {
  id: string;
  label: string;
  dims: Dims;
  params?: Params;
}

export interface KindDef {
  kind: string;
  label: string;
  category: Category;
  fields: ParamField[];
  defaults: Params;
  defaultColors: Partial<Record<MaterialSlot, string>>;
  presets: Preset[];
  /** Rugs and similar never count as collisions. */
  collides: boolean;
  /** When true, width and depth are kept equal (round shapes). */
  keepSquare?: (params: Params) => boolean;
  footprint(dims: Dims, params: Params): Vec2[];
  parts(dims: Dims, params: Params): Part[];
}

export const num = (p: Params, key: string, fallback: number): number => {
  const v = p[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
};
export const str = (p: Params, key: string, fallback: string): string => {
  const v = p[key];
  return typeof v === 'string' ? v : fallback;
};
export const bool = (p: Params, key: string, fallback: boolean): boolean => {
  const v = p[key];
  return typeof v === 'boolean' ? v : fallback;
};
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function rectFootprint(d: Dims): Vec2[] {
  const w = d.width / 2;
  const h = d.depth / 2;
  return [[-w, -h], [w, -h], [w, h], [-w, h]];
}

export function ellipseFootprint(d: Dims, segments = 24): Vec2[] {
  return Array.from({ length: segments }, (_, i) => {
    const t = (i / segments) * 2 * Math.PI;
    return [(Math.cos(t) * d.width) / 2, (Math.sin(t) * d.depth) / 2] as Vec2;
  });
}

/** Palette of designer-friendly finishes for the color pickers. */
export const PALETTE: { name: string; hex: string }[] = [
  { name: 'Linen', hex: '#e8dfd0' },
  { name: 'Oatmeal', hex: '#cdbfa8' },
  { name: 'Stone', hex: '#a9a49b' },
  { name: 'Charcoal', hex: '#4a4b4f' },
  { name: 'Ink', hex: '#2b3445' },
  { name: 'Sage', hex: '#9caf88' },
  { name: 'Olive', hex: '#6e7350' },
  { name: 'Terracotta', hex: '#c0704d' },
  { name: 'Rust', hex: '#9c4a2f' },
  { name: 'Mustard', hex: '#d1a33c' },
  { name: 'Blush', hex: '#e2b8ae' },
  { name: 'Navy', hex: '#2e4a6b' },
  { name: 'White oak', hex: '#c9a87c' },
  { name: 'Walnut', hex: '#6b4a33' },
  { name: 'Ebony', hex: '#2a2420' },
  { name: 'White', hex: '#f6f4ef' },
  { name: 'Black metal', hex: '#262626' },
  { name: 'Brass', hex: '#b8954a' },
];
