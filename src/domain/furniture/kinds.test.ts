import { describe, expect, it } from 'vitest';
import { Box3 } from 'three';
import { partsToGeometries } from '../../view3d/partsToGeometry';
import { KINDS } from './registry';
import type { Dims, KindDef, Params } from './types';

function boundsOf(def: KindDef, dims: Dims, params: Params): Box3 {
  const box = new Box3();
  for (const g of partsToGeometries(def.parts(dims, params)).values()) {
    g.computeBoundingBox();
    box.union(g.boundingBox!);
  }
  return box;
}

function expectFills(def: KindDef, dims: Dims, params: Params) {
  const b = boundsOf(def, dims, params);
  const tol = 0.001;
  expect(b.min.y).toBeCloseTo(0, 3);
  expect(Math.abs(b.max.y - dims.height)).toBeLessThan(tol);
  expect(Math.abs(b.max.x - b.min.x - dims.width)).toBeLessThan(tol);
  expect(Math.abs(b.max.z - b.min.z - dims.depth)).toBeLessThan(tol);
  expect(Math.abs(b.max.x + b.min.x)).toBeLessThan(tol);
  expect(Math.abs(b.max.z + b.min.z)).toBeLessThan(tol);
}

describe('furniture kinds', () => {
  for (const def of KINDS) {
    for (const preset of def.presets) {
      it(`${def.kind}/${preset.id} fills its dimensions exactly`, () => {
        expectFills(def, preset.dims, { ...def.defaults, ...preset.params });
      });
    }

    it(`${def.kind} stays inside its box for every option`, () => {
      const preset = def.presets[0]!;
      for (const field of def.fields) {
        const values =
          field.type === 'select' ? field.options.map((o) => o.value)
          : field.type === 'bool' ? [true, false]
          : [field.min, field.max];
        for (const value of values) {
          const params = { ...def.defaults, ...preset.params, [field.key]: value };
          const dims = def.keepSquare?.(params) ? { ...preset.dims, depth: preset.dims.width } : preset.dims;
          expectFills(def, dims, params);
        }
      }
    });
  }
});
