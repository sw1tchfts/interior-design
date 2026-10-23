import { inches } from '../../units/units';
import { type KindDef, type Part, bool, clamp, num, rectFootprint, str } from '../types';

const LEG = 0.05;

function cornerLegs(width: number, depth: number, height: number, style: string, size = LEG): Part[] {
  if (height <= 0) return [];
  const half = size / 2;
  const xs = [-(width / 2 - half), width / 2 - half];
  const zs = [-(depth / 2 - half), depth / 2 - half];
  return xs.flatMap((x) =>
    zs.map((z): Part =>
      style === 'tapered'
        ? { shape: 'cylinder', axis: 'y', length: height, radius: half * 0.6, radiusTop: half, pos: [x, height / 2, z], slot: 'legs' }
        : { shape: 'box', size: [size, height, size], pos: [x, height / 2, z], slot: 'legs' },
    ),
  );
}

export const sofa: KindDef = {
  kind: 'sofa',
  label: 'Sofa / armchair',
  category: 'seating',
  collides: true,
  fields: [
    { key: 'seats', label: 'Seat cushions', type: 'int', min: 1, max: 5 },
    {
      key: 'armStyle', label: 'Arms', type: 'select',
      options: [{ value: 'track', label: 'Track' }, { value: 'rolled', label: 'Rolled' }, { value: 'none', label: 'Armless' }],
    },
    { key: 'armWidth', label: 'Arm width', type: 'length', min: inches(2), max: inches(14) },
    { key: 'armHeight', label: 'Arm height', type: 'length', min: inches(14), max: inches(40) },
    { key: 'seatHeight', label: 'Seat height', type: 'length', min: inches(10), max: inches(26) },
    {
      key: 'backStyle', label: 'Back', type: 'select',
      options: [{ value: 'cushion', label: 'Loose cushions' }, { value: 'tight', label: 'Tight back' }],
    },
    {
      key: 'legStyle', label: 'Legs', type: 'select',
      options: [{ value: 'block', label: 'Block' }, { value: 'tapered', label: 'Tapered' }, { value: 'none', label: 'Skirted / none' }],
    },
    { key: 'legHeight', label: 'Leg height', type: 'length', min: inches(1), max: inches(10) },
  ],
  defaults: {
    seats: 3, armStyle: 'track', armWidth: inches(6), armHeight: inches(25), seatHeight: inches(18),
    backStyle: 'cushion', legStyle: 'block', legHeight: inches(4),
  },
  defaultColors: { body: '#a9a49b', cushion: '#b7b2a8', legs: '#4a3a2c' },
  presets: [
    { id: 'sofa-84', label: 'Sofa 84"', dims: { width: inches(84), depth: inches(38), height: inches(33) } },
    { id: 'sofa-96', label: 'Sofa 96"', dims: { width: inches(96), depth: inches(40), height: inches(32) }, params: { seats: 3, armStyle: 'rolled' } },
    { id: 'loveseat', label: 'Loveseat', dims: { width: inches(64), depth: inches(36), height: inches(33) }, params: { seats: 2 } },
    { id: 'armchair', label: 'Armchair', dims: { width: inches(32), depth: inches(34), height: inches(32) }, params: { seats: 1, legStyle: 'tapered' } },
  ],
  footprint: rectFootprint,
  parts({ width: W, depth: D, height: H }, p) {
    const legStyle = str(p, 'legStyle', 'block');
    const armStyle = str(p, 'armStyle', 'track');
    const seats = clamp(Math.round(num(p, 'seats', 3)), 1, 5);
    const seatH = clamp(num(p, 'seatHeight', inches(18)), 0.12, H - 0.08);
    const legH = legStyle === 'none' ? 0 : clamp(num(p, 'legHeight', inches(4)), 0, seatH * 0.5);
    const cushT = Math.min(0.15, (seatH - legH) * 0.5);
    const baseTop = seatH - cushT;
    const armW = armStyle === 'none' ? 0 : clamp(num(p, 'armWidth', inches(6)), 0.03, W * 0.25);
    const armH = clamp(num(p, 'armHeight', inches(25)), baseTop + 0.05, H);
    const backD = clamp(D * 0.2, 0.08, 0.25);
    const backCushT = str(p, 'backStyle', 'cushion') === 'cushion' ? Math.min(0.15, (D - backD) * 0.3) : 0;
    const innerW = W - 2 * armW;
    const parts: Part[] = [
      { shape: 'box', size: [W, baseTop - legH, D], pos: [0, legH + (baseTop - legH) / 2, 0], radius: 0.02, slot: 'body' },
      { shape: 'box', size: [innerW, H - baseTop, backD], pos: [0, (baseTop + H) / 2, -D / 2 + backD / 2], radius: 0.04, slot: 'body' },
    ];
    for (const sign of armW > 0 ? [-1, 1] : []) {
      const x = sign * (W / 2 - armW / 2);
      if (armStyle === 'rolled') {
        const r = armW / 2;
        const boxTop = Math.max(baseTop + 0.01, armH - r);
        parts.push({ shape: 'box', size: [armW, boxTop - baseTop, D], pos: [x, (baseTop + boxTop) / 2, 0], slot: 'body' });
        parts.push({ shape: 'cylinder', axis: 'z', length: D, radius: r, pos: [x, armH - r, 0], slot: 'body' });
      } else {
        parts.push({ shape: 'box', size: [armW, armH - baseTop, D], pos: [x, (baseTop + armH) / 2, 0], radius: Math.min(0.04, armW / 3), slot: 'body' });
      }
    }
    const gap = 0.006;
    const cw = innerW / seats;
    const seatD = D - backD - backCushT;
    for (let i = 0; i < seats; i++) {
      const x = -innerW / 2 + cw * (i + 0.5);
      parts.push({ shape: 'box', size: [cw - gap, cushT, seatD], pos: [x, baseTop + cushT / 2, D / 2 - seatD / 2], radius: 0.04, slot: 'cushion' });
      if (backCushT > 0) {
        const top = H - 0.03;
        parts.push({
          shape: 'box', size: [cw - gap, top - seatH, backCushT],
          pos: [x, (seatH + top) / 2, -D / 2 + backD + backCushT / 2], radius: 0.05, slot: 'cushion',
        });
      }
    }
    parts.push(...cornerLegs(W, D, legH, legStyle));
    return parts;
  },
};

export const chair: KindDef = {
  kind: 'chair',
  label: 'Chair',
  category: 'seating',
  collides: true,
  fields: [
    { key: 'seatHeight', label: 'Seat height', type: 'length', min: inches(12), max: inches(32) },
    {
      key: 'backStyle', label: 'Back', type: 'select',
      options: [{ value: 'solid', label: 'Solid' }, { value: 'slats', label: 'Slats' }, { value: 'open', label: 'Open' }],
    },
    { key: 'arms', label: 'Arms', type: 'bool' },
    {
      key: 'legStyle', label: 'Legs', type: 'select',
      options: [{ value: 'square', label: 'Square' }, { value: 'tapered', label: 'Tapered' }],
    },
  ],
  defaults: { seatHeight: inches(18), backStyle: 'slats', arms: false, legStyle: 'square' },
  defaultColors: { body: '#c9a87c', cushion: '#e8dfd0', legs: '#a8865c' },
  presets: [
    { id: 'dining-chair', label: 'Dining chair', dims: { width: inches(19), depth: inches(21), height: inches(34) } },
    { id: 'arm-chair-dining', label: 'Dining armchair', dims: { width: inches(23), depth: inches(22), height: inches(34) }, params: { arms: true } },
    { id: 'counter-stool', label: 'Counter stool', dims: { width: inches(18), depth: inches(19), height: inches(36) }, params: { seatHeight: inches(26), backStyle: 'open' } },
  ],
  footprint: rectFootprint,
  parts({ width: W, depth: D, height: H }, p) {
    const seatT = 0.04;
    const post = 0.035;
    const seatTop = clamp(num(p, 'seatHeight', inches(18)), 0.15, H - 0.1);
    const legH = seatTop - seatT;
    const backH = H - seatTop;
    const zBack = -D / 2 + post / 2;
    const parts: Part[] = [
      ...cornerLegs(W, D, legH, str(p, 'legStyle', 'square'), post),
      { shape: 'box', size: [W, seatT, D], pos: [0, legH + seatT / 2, 0], radius: 0.01, slot: 'cushion' },
    ];
    for (const sign of [-1, 1]) {
      parts.push({ shape: 'box', size: [post, backH, post], pos: [sign * (W / 2 - post / 2), seatTop + backH / 2, zBack], slot: 'legs' });
    }
    const innerW = W - 2 * post;
    const style = str(p, 'backStyle', 'slats');
    const railH = Math.min(0.08, backH * 0.25);
    parts.push({ shape: 'box', size: [innerW, railH, 0.025], pos: [0, H - railH / 2, zBack], slot: 'body' });
    if (style === 'solid') {
      const h = backH * 0.55;
      parts.push({ shape: 'box', size: [innerW, h, 0.025], pos: [0, H - railH - h / 2, zBack], slot: 'body' });
    } else if (style === 'slats') {
      const h = backH - railH - 0.06;
      for (const fx of [-0.25, 0, 0.25]) {
        parts.push({ shape: 'box', size: [0.025, h, 0.02], pos: [fx * innerW, seatTop + 0.06 + h / 2, zBack], slot: 'body' });
      }
    } else {
      parts.push({ shape: 'box', size: [innerW, railH * 0.7, 0.02], pos: [0, seatTop + backH * 0.45, zBack], slot: 'body' });
    }
    if (bool(p, 'arms', false)) {
      const armY = Math.min(seatTop + 0.2, H - 0.02);
      for (const sign of [-1, 1]) {
        const x = sign * (W / 2 - post / 2);
        parts.push({ shape: 'box', size: [post, 0.03, D - post], pos: [x, armY, post / 2], slot: 'body' });
        parts.push({ shape: 'box', size: [0.025, armY - seatTop, 0.025], pos: [x, (seatTop + armY) / 2, D / 2 - post / 2], slot: 'legs' });
      }
    }
    return parts;
  },
};
