import { type BufferGeometry, CylinderGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialSlot, Part } from '../domain/furniture/types';

function partGeometry(part: Part): BufferGeometry {
  if (part.shape === 'box') {
    const [w, h, d] = part.size;
    const r = Math.max(0, Math.min(part.radius ?? 0, w / 2.01, h / 2.01, d / 2.01));
    const g = new RoundedBoxGeometry(w, h, d, r > 0 ? 3 : 1, r);
    g.translate(...part.pos);
    return g;
  }
  const g = new CylinderGeometry(part.radiusTop ?? part.radius, part.radius, part.length, 40);
  if (part.axis === 'y' && part.stretch !== undefined) g.scale(1, 1, part.stretch);
  if (part.axis === 'x') g.rotateZ(-Math.PI / 2);
  if (part.axis === 'z') g.rotateX(Math.PI / 2);
  g.translate(...part.pos);
  return g;
}

/** Builds one merged geometry per material slot (a handful of draw calls per item). */
export function partsToGeometries(parts: Part[]): Map<MaterialSlot, BufferGeometry> {
  const bySlot = new Map<MaterialSlot, BufferGeometry[]>();
  for (const part of parts) {
    const list = bySlot.get(part.slot) ?? [];
    const g = partGeometry(part);
    list.push(g.index ? g.toNonIndexed() : g);
    bySlot.set(part.slot, list);
  }
  const merged = new Map<MaterialSlot, BufferGeometry>();
  for (const [slot, list] of bySlot) {
    const g = list.length === 1 ? list[0]! : mergeGeometries(list);
    if (!g) throw new Error(`Could not merge geometry for slot ${slot}`);
    if (list.length > 1) list.forEach((l) => l.dispose());
    g.computeBoundingBox();
    merged.set(slot, g);
  }
  return merged;
}
