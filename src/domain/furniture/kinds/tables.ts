import { inches } from '../../units/units';
import { type KindDef, type Part, clamp, ellipseFootprint, num, rectFootprint, str } from '../types';

const isRound = (shape: string) => shape === 'round' || shape === 'oval';

export const table: KindDef = {
  kind: 'table',
  label: 'Table',
  category: 'tables',
  collides: true,
  fields: [
    {
      key: 'shape', label: 'Shape', type: 'select',
      options: [{ value: 'rect', label: 'Rectangle' }, { value: 'round', label: 'Round' }, { value: 'oval', label: 'Oval' }],
    },
    {
      key: 'base', label: 'Base', type: 'select',
      options: [{ value: 'legs', label: 'Four legs' }, { value: 'pedestal', label: 'Pedestal' }],
    },
    { key: 'topThickness', label: 'Top thickness', type: 'length', min: inches(0.5), max: inches(4) },
  ],
  defaults: { shape: 'rect', base: 'legs', topThickness: inches(1.5) },
  defaultColors: { body: '#c9a87c', legs: '#a8865c' },
  keepSquare: (p) => str(p, 'shape', 'rect') === 'round',
  presets: [
    { id: 'coffee-rect', label: 'Coffee table', dims: { width: inches(48), depth: inches(24), height: inches(17) } },
    { id: 'coffee-round', label: 'Round coffee table', dims: { width: inches(36), depth: inches(36), height: inches(16) }, params: { shape: 'round', base: 'pedestal' } },
    { id: 'side-table', label: 'Side table', dims: { width: inches(20), depth: inches(20), height: inches(24) } },
    { id: 'dining-rect', label: 'Dining table', dims: { width: inches(72), depth: inches(38), height: inches(30) } },
    { id: 'dining-round', label: 'Round dining table', dims: { width: inches(48), depth: inches(48), height: inches(30) }, params: { shape: 'round', base: 'pedestal' } },
    { id: 'dining-oval', label: 'Oval dining table', dims: { width: inches(84), depth: inches(42), height: inches(30) }, params: { shape: 'oval', base: 'pedestal' } },
    { id: 'console', label: 'Console table', dims: { width: inches(60), depth: inches(16), height: inches(32) } },
    { id: 'desk', label: 'Desk', dims: { width: inches(60), depth: inches(28), height: inches(30) } },
  ],
  footprint: (d, p) => (isRound(str(p, 'shape', 'rect')) ? ellipseFootprint(d) : rectFootprint(d)),
  parts({ width: W, depth: D, height: H }, p) {
    const shape = str(p, 'shape', 'rect');
    const t = clamp(num(p, 'topThickness', inches(1.5)), 0.01, H * 0.3);
    const legTop = H - t;
    const parts: Part[] = isRound(shape)
      ? [{ shape: 'cylinder', axis: 'y', length: t, radius: W / 2, stretch: D / W, pos: [0, H - t / 2, 0], slot: 'body' }]
      : [{ shape: 'box', size: [W, t, D], pos: [0, H - t / 2, 0], radius: Math.min(0.01, t / 2.5), slot: 'body' }];
    if (str(p, 'base', 'legs') === 'pedestal') {
      const footT = Math.min(0.03, legTop * 0.2);
      const r = Math.min(W, D) * 0.08;
      const footR = Math.min(W, D) * 0.3;
      parts.push({ shape: 'cylinder', axis: 'y', length: legTop - footT, radius: r, pos: [0, footT + (legTop - footT) / 2, 0], slot: 'legs' });
      parts.push({ shape: 'cylinder', axis: 'y', length: footT, radius: footR, stretch: D / W, pos: [0, footT / 2, 0], slot: 'legs' });
    } else {
      const leg = clamp(Math.min(W, D) * 0.07, 0.03, 0.07);
      // Round tops can't put legs at the bounding-box corners; inset them along the diagonal.
      const fx = isRound(shape) ? 0.35 : 0.5;
      const inset = isRound(shape) ? 0 : leg / 2 + Math.min(0.04, Math.min(W, D) * 0.05);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          parts.push({
            shape: 'box', size: [leg, legTop, leg],
            pos: [sx * (W * fx - inset), legTop / 2, sz * (D * fx - inset)], slot: 'legs',
          });
        }
      }
      if (!isRound(shape) && legTop > 0.3) {
        const apronH = Math.min(0.08, legTop * 0.15);
        parts.push({
          shape: 'box', size: [W - 2 * inset, apronH, D - 2 * inset],
          pos: [0, legTop - apronH / 2, 0], slot: 'body',
        });
      }
    }
    return parts;
  },
};

export const bed: KindDef = {
  kind: 'bed',
  label: 'Bed',
  category: 'beds',
  collides: true,
  fields: [
    { key: 'mattressTop', label: 'Mattress top height', type: 'length', min: inches(10), max: inches(36) },
    {
      key: 'headboard', label: 'Headboard', type: 'select',
      options: [{ value: 'panel', label: 'Panel' }, { value: 'upholstered', label: 'Upholstered' }],
    },
    { key: 'footboard', label: 'Footboard', type: 'bool' },
    {
      key: 'frame', label: 'Frame', type: 'select',
      options: [{ value: 'platform', label: 'Platform' }, { value: 'legs', label: 'On legs' }],
    },
  ],
  defaults: { mattressTop: inches(24), headboard: 'upholstered', footboard: false, frame: 'platform' },
  defaultColors: { body: '#cdbfa8', cushion: '#d9cdb8', bedding: '#f6f4ef', accent: '#e8dfd0', legs: '#6b4a33' },
  presets: [
    { id: 'bed-twin', label: 'Twin bed', dims: { width: inches(42), depth: inches(80), height: inches(42) } },
    { id: 'bed-full', label: 'Full bed', dims: { width: inches(57), depth: inches(80), height: inches(46) } },
    { id: 'bed-queen', label: 'Queen bed', dims: { width: inches(64), depth: inches(86), height: inches(50) } },
    { id: 'bed-king', label: 'King bed', dims: { width: inches(80), depth: inches(86), height: inches(52) } },
    { id: 'bed-calking', label: 'Cal king bed', dims: { width: inches(76), depth: inches(90), height: inches(52) } },
  ],
  footprint: rectFootprint,
  parts({ width: W, depth: D, height: H }, p) {
    const hbT = Math.min(0.08, D * 0.1);
    const ftT = p.footboard === true ? Math.min(0.05, D * 0.05) : 0;
    const mattressTop = clamp(num(p, 'mattressTop', inches(24)), 0.2, H - 0.05);
    const frameTop = Math.max(0.08, mattressTop - 0.25);
    const innerD = D - hbT - ftT;
    const zInner = -D / 2 + hbT + innerD / 2;
    const legH = str(p, 'frame', 'platform') === 'legs' ? Math.min(0.15, frameTop * 0.6) : 0;
    const parts: Part[] = [
      { shape: 'box', size: [W, frameTop - legH, innerD], pos: [0, legH + (frameTop - legH) / 2, zInner], radius: 0.015, slot: 'body' },
      { shape: 'box', size: [W - 0.04, mattressTop - frameTop, innerD - 0.03], pos: [0, (frameTop + mattressTop) / 2, zInner], radius: 0.04, slot: 'accent' },
      { shape: 'box', size: [W, H, hbT], pos: [0, H / 2, -D / 2 + hbT / 2], radius: 0.02, slot: 'body' },
    ];
    // Duvet over the front ~70% of the mattress.
    const duvetD = innerD * 0.72;
    parts.push({
      shape: 'box', size: [W - 0.01, 0.07, duvetD],
      pos: [0, mattressTop - 0.02, -D / 2 + hbT + innerD - duvetD / 2], radius: 0.03, slot: 'bedding',
    });
    const pillows = W > 1.6 ? 3 : W > 1.1 ? 2 : 1;
    const pw = Math.min(0.66, (W - 0.1) / pillows - 0.04);
    for (let i = 0; i < pillows; i++) {
      const x = -((pillows - 1) * (pw + 0.04)) / 2 + i * (pw + 0.04);
      parts.push({
        shape: 'box', size: [pw, Math.min(0.14, H - mattressTop), 0.42],
        pos: [x, mattressTop + Math.min(0.14, H - mattressTop) / 2, -D / 2 + hbT + 0.25], radius: 0.05, slot: 'bedding',
      });
    }
    if (str(p, 'headboard', 'upholstered') === 'upholstered' && H - mattressTop > 0.15) {
      const h = (H - mattressTop) * 0.85;
      parts.push({
        shape: 'box', size: [W - 0.08, h, 0.03],
        pos: [0, H - 0.04 - h / 2, -D / 2 + hbT + 0.015], radius: 0.012, slot: 'cushion',
      });
    }
    if (ftT > 0) {
      const fh = Math.min(mattressTop + 0.1, H);
      parts.push({ shape: 'box', size: [W, fh, ftT], pos: [0, fh / 2, D / 2 - ftT / 2], radius: 0.015, slot: 'body' });
    }
    if (legH > 0) {
      const leg = 0.05;
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          parts.push({
            shape: 'box', size: [leg, legH, leg],
            pos: [sx * (W / 2 - leg / 2), legH / 2, zInner + sz * (innerD / 2 - leg / 2)], slot: 'legs',
          });
        }
      }
    }
    return parts;
  },
};
