import { inches } from '../../units/units';
import { type KindDef, type Part, bool, clamp, ellipseFootprint, num, rectFootprint, str } from '../types';

export const cabinet: KindDef = {
  kind: 'cabinet',
  label: 'Cabinet',
  category: 'storage',
  collides: true,
  fields: [
    {
      key: 'front', label: 'Front', type: 'select',
      options: [{ value: 'drawers', label: 'Drawers' }, { value: 'doors', label: 'Doors' }, { value: 'open', label: 'Open shelves' }],
    },
    { key: 'rows', label: 'Rows', type: 'int', min: 1, max: 8 },
    { key: 'cols', label: 'Columns', type: 'int', min: 1, max: 6 },
    {
      key: 'base', label: 'Base', type: 'select',
      options: [{ value: 'plinth', label: 'Plinth' }, { value: 'legs', label: 'Legs' }],
    },
    { key: 'baseHeight', label: 'Base height', type: 'length', min: 0, max: inches(12) },
  ],
  defaults: { front: 'drawers', rows: 3, cols: 2, base: 'plinth', baseHeight: inches(3) },
  defaultColors: { body: '#f6f4ef', accent: '#ebe7df', legs: '#6b4a33', metal: '#b8954a' },
  presets: [
    { id: 'nightstand', label: 'Nightstand', dims: { width: inches(22), depth: inches(16), height: inches(24) }, params: { rows: 2, cols: 1, base: 'legs', baseHeight: inches(6) } },
    { id: 'dresser', label: 'Dresser', dims: { width: inches(60), depth: inches(19), height: inches(32) }, params: { rows: 3, cols: 2 } },
    { id: 'sideboard', label: 'Sideboard', dims: { width: inches(72), depth: inches(18), height: inches(32) }, params: { front: 'doors', rows: 1, cols: 4, base: 'legs', baseHeight: inches(8) } },
    { id: 'media', label: 'Media console', dims: { width: inches(70), depth: inches(18), height: inches(22) }, params: { front: 'doors', rows: 1, cols: 3, base: 'legs', baseHeight: inches(5) } },
    { id: 'bookcase', label: 'Bookcase', dims: { width: inches(36), depth: inches(14), height: inches(78) }, params: { front: 'open', rows: 5, cols: 1, baseHeight: inches(3) } },
  ],
  footprint: rectFootprint,
  parts({ width: W, depth: D, height: H }, p) {
    const front = str(p, 'front', 'drawers');
    const rows = clamp(Math.round(num(p, 'rows', 3)), 1, 8);
    const cols = clamp(Math.round(num(p, 'cols', 2)), 1, 6);
    const baseH = clamp(num(p, 'baseHeight', inches(3)), 0, H * 0.4);
    const legs = str(p, 'base', 'plinth') === 'legs';
    const boxH = H - baseH;
    const yMid = baseH + boxH / 2;
    const parts: Part[] = [];

    if (front === 'open') {
      const t = 0.02;
      parts.push(
        { shape: 'box', size: [t, boxH, D], pos: [-W / 2 + t / 2, yMid, 0], slot: 'body' },
        { shape: 'box', size: [t, boxH, D], pos: [W / 2 - t / 2, yMid, 0], slot: 'body' },
        { shape: 'box', size: [W, t, D], pos: [0, H - t / 2, 0], slot: 'body' },
        { shape: 'box', size: [W, t, D], pos: [0, baseH + t / 2, 0], slot: 'body' },
        { shape: 'box', size: [W - 2 * t, boxH, 0.01], pos: [0, yMid, -D / 2 + 0.005], slot: 'accent' },
      );
      for (let r = 1; r < rows; r++) {
        parts.push({ shape: 'box', size: [W - 2 * t, t, D - 0.01], pos: [0, baseH + (boxH * r) / rows, 0.005], slot: 'body' });
      }
    } else {
      const frontT = 0.02;
      const handleT = 0.01;
      const bodyD = D - frontT - handleT;
      const zFront = -D / 2 + bodyD + frontT / 2;
      parts.push({ shape: 'box', size: [W, boxH, bodyD], pos: [0, yMid, -D / 2 + bodyD / 2], radius: 0.006, slot: 'body' });
      const gap = 0.006;
      const cw = W / cols;
      const ch = boxH / rows;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = -W / 2 + cw * (c + 0.5);
          const y = baseH + ch * (r + 0.5);
          parts.push({ shape: 'box', size: [cw - gap, ch - gap, frontT], pos: [x, y, zFront], radius: 0.004, slot: 'accent' });
          const hz = zFront + frontT / 2 + handleT / 2;
          if (front === 'drawers') {
            parts.push({ shape: 'box', size: [Math.min(0.12, cw * 0.4), 0.014, handleT], pos: [x, y + ch * 0.15, hz], slot: 'metal' });
          } else {
            const hx = x + (c % 2 === 0 ? 1 : -1) * (cw / 2 - 0.04);
            parts.push({ shape: 'box', size: [0.014, Math.min(0.15, ch * 0.4), handleT], pos: [hx, y, hz], slot: 'metal' });
          }
        }
      }
    }

    if (baseH > 0) {
      if (legs) {
        const leg = 0.04;
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            parts.push({ shape: 'box', size: [leg, baseH, leg], pos: [sx * (W / 2 - leg / 2), baseH / 2, sz * (D / 2 - leg / 2)], slot: 'legs' });
          }
        }
      } else {
        parts.push({ shape: 'box', size: [W - 0.04, baseH, Math.max(0.02, D - 0.06)], pos: [0, baseH / 2, -0.01], slot: 'legs' });
      }
    }
    return parts;
  },
};

export const rug: KindDef = {
  kind: 'rug',
  label: 'Rug',
  category: 'rugs',
  collides: false,
  fields: [
    {
      key: 'shape', label: 'Shape', type: 'select',
      options: [{ value: 'rect', label: 'Rectangle' }, { value: 'round', label: 'Round' }],
    },
    { key: 'border', label: 'Border', type: 'bool' },
  ],
  defaults: { shape: 'rect', border: true },
  defaultColors: { body: '#e8dfd0', accent: '#9caf88' },
  keepSquare: (p) => str(p, 'shape', 'rect') === 'round',
  presets: [
    { id: 'rug-5x8', label: `Rug 5' x 8'`, dims: { width: inches(96), depth: inches(60), height: 0.012 } },
    { id: 'rug-8x10', label: `Rug 8' x 10'`, dims: { width: inches(120), depth: inches(96), height: 0.012 } },
    { id: 'rug-9x12', label: `Rug 9' x 12'`, dims: { width: inches(144), depth: inches(108), height: 0.012 } },
    { id: 'rug-round-6', label: `Round rug 6'`, dims: { width: inches(72), depth: inches(72), height: 0.012 }, params: { shape: 'round' } },
    { id: 'runner', label: `Runner 2'6" x 8'`, dims: { width: inches(96), depth: inches(30), height: 0.012 }, params: { border: false } },
  ],
  footprint: (d, p) => (str(p, 'shape', 'rect') === 'round' ? ellipseFootprint(d) : rectFootprint(d)),
  parts({ width: W, depth: D, height: H }, p) {
    const round = str(p, 'shape', 'rect') === 'round';
    const border = bool(p, 'border', true);
    const b = Math.min(0.08, Math.min(W, D) * 0.08);
    const slab = (w: number, d: number, h: number, slot: 'body' | 'accent'): Part =>
      round
        ? { shape: 'cylinder', axis: 'y', length: h, radius: w / 2, stretch: d / w, pos: [0, h / 2, 0], slot }
        : { shape: 'box', size: [w, h, d], pos: [0, h / 2, 0], slot };
    if (!border) return [slab(W, D, H, 'body')];
    return [slab(W, D, H * 0.8, 'accent'), slab(W - 2 * b, D - 2 * b, H, 'body')];
  },
};

export const box: KindDef = {
  kind: 'box',
  label: 'Generic object',
  category: 'generic',
  collides: true,
  fields: [
    {
      key: 'shape', label: 'Shape', type: 'select',
      options: [{ value: 'rect', label: 'Box' }, { value: 'round', label: 'Cylinder' }],
    },
  ],
  defaults: { shape: 'rect' },
  defaultColors: { body: '#a9a49b' },
  presets: [
    { id: 'box', label: 'Box', dims: { width: inches(24), depth: inches(24), height: inches(24) } },
    { id: 'cylinder', label: 'Cylinder (planter, pouf)', dims: { width: inches(18), depth: inches(18), height: inches(18) }, params: { shape: 'round' } },
  ],
  footprint: (d, p) => (str(p, 'shape', 'rect') === 'round' ? ellipseFootprint(d) : rectFootprint(d)),
  parts({ width: W, depth: D, height: H }, p) {
    if (str(p, 'shape', 'rect') === 'round') {
      return [{ shape: 'cylinder', axis: 'y', length: H, radius: W / 2, stretch: D / W, pos: [0, H / 2, 0], slot: 'body' }];
    }
    return [{ shape: 'box', size: [W, H, D], pos: [0, H / 2, 0], radius: Math.min(0.02, Math.min(W, D, H) / 4), slot: 'body' }];
  },
};
