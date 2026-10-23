import { memo } from 'react';
import { FOOT, INCH, type UnitSystem } from '../domain/units/units';

const IMPERIAL_STEPS = [INCH, 3 * INCH, 6 * INCH, FOOT, 2 * FOOT, 5 * FOOT, 10 * FOOT, 50 * FOOT];
const METRIC_STEPS = [0.01, 0.05, 0.1, 0.5, 1, 5, 10, 50];

interface Props {
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
  scale: number;
  unitSystem: UnitSystem;
}

/** Adaptive minor/major grid lines covering the visible area. */
export const GridLayer = memo(function GridLayer({ bounds, scale, unitSystem }: Props) {
  const steps = unitSystem === 'imperial' ? IMPERIAL_STEPS : METRIC_STEPS;
  const minor = steps.find((s) => s * scale >= 12) ?? steps[steps.length - 1]!;
  const major = steps.find((s) => s >= minor * 4 && s * scale >= 60) ?? minor * 5;
  const lines: { d: string; major: boolean }[] = [];
  for (const step of [minor, major]) {
    const isMajor = step === major;
    let d = '';
    for (let x = Math.floor(bounds.minX / step) * step; x <= bounds.maxX; x += step) {
      if (!isMajor && Math.abs(x / major - Math.round(x / major)) < 1e-6) continue;
      d += `M${x} ${bounds.minZ}V${bounds.maxZ}`;
    }
    for (let z = Math.floor(bounds.minZ / step) * step; z <= bounds.maxZ; z += step) {
      if (!isMajor && Math.abs(z / major - Math.round(z / major)) < 1e-6) continue;
      d += `M${bounds.minX} ${z}H${bounds.maxX}`;
    }
    lines.push({ d, major: isMajor });
  }
  return (
    <g pointerEvents="none">
      {lines.map((l) => (
        <path key={String(l.major)} d={l.d} stroke={l.major ? '#d5d1c8' : '#e6e3dc'} strokeWidth={1 / scale} fill="none" />
      ))}
    </g>
  );
});
