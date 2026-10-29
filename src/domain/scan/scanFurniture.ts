import type { Params } from '../furniture/types';
import { inches } from '../units/units';
import type { ScanObject } from './roomplan';

export interface FurnitureGuess {
  kind: string;
  name: string;
  params: Params;
  /** Fixed things (appliances, plumbing) the layout works around. */
  locked?: boolean;
  note?: string;
}

const FIXED: Record<string, string> = {
  refrigerator: 'Refrigerator',
  stove: 'Stove',
  oven: 'Oven',
  dishwasher: 'Dishwasher',
  sink: 'Sink',
  washerDryer: 'Washer / dryer',
  toilet: 'Toilet',
  bathtub: 'Bathtub',
  stairs: 'Stairs',
  fireplace: 'Fireplace',
};

const BED_SIZES: [string, number][] = [
  ['Twin bed', inches(42)],
  ['Full bed', inches(57)],
  ['Queen bed', inches(64)],
  ['Cal king bed', inches(76)],
  ['King bed', inches(80)],
];

const clampInt = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));

/**
 * Picks our furniture kind, a name and starting style params for a scanned
 * object from its RoomPlan category, attributes and measured size.
 */
export function guessFurniture(o: ScanObject): FurnitureGuess {
  const { width: W, height: H, depth: D, attributes: attr } = o;
  switch (o.category) {
    case 'sofa': {
      if (W < inches(45) || attr.SofaType === 'singleSeat') return { kind: 'sofa', name: 'Armchair', params: { seats: 1 } };
      const seats = clampInt((W - inches(12)) / inches(28), 2, 4);
      const lShaped = attr.SofaType === 'lShaped';
      return {
        kind: 'sofa',
        name: lShaped ? 'Sectional' : seats === 2 && W < inches(72) ? 'Loveseat' : 'Sofa',
        params: { seats },
        note: lShaped ? 'Scanned as an L-shaped sectional; shown as a straight sofa for now.' : undefined,
      };
    }
    case 'chair': {
      const type = attr.ChairType;
      const params: Params = { arms: attr.ChairArmType === 'existing' };
      if (attr.ChairBackType === 'missing') params.backStyle = 'open';
      else if (type === 'swivel') params.backStyle = 'solid';
      if (type === 'stool') params.seatHeight = Math.max(inches(16), H - inches(4));
      const name = type === 'swivel' ? 'Swivel chair' : type === 'stool' ? 'Stool' : type === 'dining' ? 'Dining chair' : 'Chair';
      return { kind: 'chair', name, params };
    }
    case 'table': {
      const shape = /circ|ellip|round/i.test(attr.TableShapeType ?? '') ? (Math.abs(W - D) < 0.1 * Math.max(W, D) ? 'round' : 'oval') : 'rect';
      const params: Params = shape === 'rect' ? {} : { shape, base: 'pedestal' };
      const type = attr.TableType;
      const name =
        type === 'coffee' || (H < inches(22) && W > inches(28)) ? 'Coffee table'
        : W < inches(30) && D < inches(30) ? 'Side table'
        : type === 'dining' ? 'Dining table'
        : D < inches(20) ? 'Console table'
        : 'Table';
      return { kind: 'table', name: shape === 'rect' ? name : `Round ${name.toLowerCase()}`, params };
    }
    case 'bed': {
      const [name] = BED_SIZES.reduce((best, s) => (Math.abs(s[1] - W) < Math.abs(best[1] - W) ? s : best));
      return { kind: 'bed', name, params: {} };
    }
    case 'storage': {
      if (attr.StorageType === 'shelf') {
        return { kind: 'cabinet', name: 'Shelf', params: { front: 'open', rows: clampInt(H / inches(13), 1, 8), cols: clampInt(W / inches(32), 1, 6) } };
      }
      if (H > inches(48)) return { kind: 'cabinet', name: 'Tall cabinet', params: { front: 'doors', rows: 2, cols: clampInt(W / inches(20), 1, 6) } };
      if (W < inches(28) && H < inches(30)) return { kind: 'cabinet', name: 'Nightstand', params: { rows: 2, cols: 1 } };
      if (W > inches(54) && H < inches(36)) return { kind: 'cabinet', name: 'Sideboard', params: { front: 'doors', rows: 1, cols: clampInt(W / inches(18), 2, 6) } };
      return { kind: 'cabinet', name: 'Dresser', params: { rows: clampInt(H / inches(10), 2, 5), cols: W > inches(40) ? 2 : 1 } };
    }
    case 'television':
      return { kind: 'box', name: 'TV', params: {} };
  }
  const fixed = FIXED[o.category];
  if (fixed) return { kind: 'box', name: fixed, params: {}, locked: true };
  const name = o.category.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
  return { kind: 'box', name, params: {} };
}
