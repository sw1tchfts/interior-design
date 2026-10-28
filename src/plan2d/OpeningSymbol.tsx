import { memo } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Vec2 } from '../domain/geometry/vec2';
import { doorLeaves, openingSpan, wallFrame, wallPoint } from '../domain/room/openings';
import type { Opening, Room, Settings } from '../domain/schema/project';
import { formatLength } from '../domain/units/units';

const ACCENT = '#2f6fde';
const WALL = '#3d3a35';
const FLOOR = '#fbfaf7';
const GLASS = '#6d9cc4';
const POCKET = '#d9d4ca';

const poly = (ps: Vec2[]) => ps.map((p) => p.join(',')).join(' ');

/** Text rotation that follows a wall but never reads upside down. */
function readableDeg(dir: Vec2) {
  let deg = (Math.atan2(dir[1], dir[0]) * 180) / Math.PI;
  if (deg > 90) deg -= 180;
  if (deg <= -90) deg += 180;
  return deg;
}

interface Props {
  room: Room;
  opening: Opening;
  /** Wall thickness as drawn in the plan. */
  thickness: number;
  px: number;
  selected: boolean;
}

/** Architectural plan symbol: the gap in the wall plus the door swing, slider panels, pocket or glass. */
export const OpeningSymbol = memo(function OpeningSymbol({ room, opening: o, thickness: t, px, selected }: Props) {
  const span = openingSpan(room, o);
  if (!span) return null;
  const f = wallFrame(room, span.wallIndex);
  const { start, end } = span;
  const at = (along: number, out: number) => wallPoint(f, along, out);
  const ink = selected ? ACCENT : WALL;
  const gap = [at(start, 0), at(end, 0), at(end, t), at(start, t)];
  const panel = (from: number, to: number, out0: number, out1: number) => [at(from, out0), at(to, out0), at(to, out1), at(from, out1)];
  const dash = `${4 * px} ${3 * px}`;

  let symbol: React.ReactNode = null;
  switch (o.type) {
    case 'door':
    case 'double_door':
      symbol = doorLeaves(room, o, t).map((l, i) => {
        const r = Math.hypot(l.open[0] - l.hinge[0], l.open[1] - l.hinge[1]);
        const arc = `A${r} ${r} 0 0 ${l.sweep} ${l.closed.join(' ')}`;
        return (
          <g key={i}>
            <path d={`M${l.hinge.join(' ')}L${l.open.join(' ')}${arc}Z`} fill={ink} fillOpacity={0.05} stroke="none" />
            <path d={`M${l.open.join(' ')}${arc}`} fill="none" stroke={ink} strokeWidth={0.75 * px} />
            <line x1={l.hinge[0]} y1={l.hinge[1]} x2={l.open[0]} y2={l.open[1]} stroke={ink} strokeWidth={2 * px} strokeLinecap="round" />
          </g>
        );
      });
      break;
    case 'sliding_door': {
      const mid = (start + end) / 2;
      const lap = Math.min(0.05, (end - start) * 0.05);
      const d = t * 0.2;
      symbol = (
        <>
          <polygon points={poly(panel(start, mid + lap, t * 0.25, t * 0.25 + d))} fill="#fff" stroke={ink} strokeWidth={px} />
          <polygon points={poly(panel(mid - lap, end, t * 0.55, t * 0.55 + d))} fill="#fff" stroke={ink} strokeWidth={px} />
        </>
      );
      break;
    }
    case 'pocket_door': {
      // The door slides into a pocket inside the wall on its hinge side.
      const w = end - start;
      const [p0, p1] = o.hinge === 'start' ? [Math.max(0, start - w), start] : [end, Math.min(f.length, end + w)];
      const d = Math.min(t * 0.3, 0.02);
      symbol = (
        <>
          <polygon points={poly(panel(p0, p1, t / 2 - d / 2, t / 2 + d / 2))} fill="none" stroke={selected ? ACCENT : POCKET} strokeWidth={px} strokeDasharray={dash} />
          <line x1={at(start, t / 2)[0]} y1={at(start, t / 2)[1]} x2={at(end, t / 2)[0]} y2={at(end, t / 2)[1]} stroke={ink} strokeWidth={0.75 * px} strokeDasharray={dash} />
        </>
      );
      break;
    }
    case 'opening':
      // Dashed lines mark the header above the opening.
      symbol = [0, t].map((out) => (
        <line key={out} x1={at(start, out)[0]} y1={at(start, out)[1]} x2={at(end, out)[0]} y2={at(end, out)[1]} stroke={ink} strokeWidth={0.75 * px} strokeDasharray={dash} />
      ));
      break;
    case 'window':
      symbol = (
        <>
          <polygon points={poly(gap)} fill="#fff" stroke={ink} strokeWidth={px} />
          <line x1={at(start, t / 2)[0]} y1={at(start, t / 2)[1]} x2={at(end, t / 2)[0]} y2={at(end, t / 2)[1]} stroke={selected ? ACCENT : GLASS} strokeWidth={1.5 * px} />
        </>
      );
      break;
  }

  return (
    <g data-testid="opening-symbol" pointerEvents="none">
      <polygon points={poly(gap)} fill={FLOOR} />
      {symbol}
      {selected && <polygon points={poly(gap)} fill="none" stroke={ACCENT} strokeWidth={1.5 * px} />}
    </g>
  );
});

/** Invisible grab area over an opening, a little wider than the wall so thin walls stay easy to hit. */
export function OpeningHitArea({ room, opening, thickness, px, onPointerDown }: {
  room: Room;
  opening: Opening;
  thickness: number;
  px: number;
  onPointerDown(e: ReactPointerEvent, o: Opening): void;
}) {
  const span = openingSpan(room, opening);
  if (!span) return null;
  const f = wallFrame(room, span.wallIndex);
  const pad = 8 * px;
  const area = [wallPoint(f, span.start, -pad), wallPoint(f, span.end, -pad), wallPoint(f, span.end, thickness + pad), wallPoint(f, span.start, thickness + pad)];
  return (
    <polygon
      data-opening-id={opening.id}
      points={poly(area)}
      fill="transparent"
      style={{ cursor: 'grab' }}
      onPointerDown={(e) => onPointerDown(e, opening)}
    />
  );
}

/** Distances from a selected opening to the corners at each end of its wall, drawn inside the room. */
export function OpeningDimensions({ room, opening, px, settings }: { room: Room; opening: Opening; px: number; settings: Settings }) {
  const span = openingSpan(room, opening);
  if (!span) return null;
  const f = wallFrame(room, span.wallIndex);
  const inset = -18 * px;
  const deg = readableDeg(f.dir);
  const runs = ([[0, span.start], [span.end, f.length]] as const).filter(([s, e]) => e - s > 1e-4);
  return (
    <g pointerEvents="none" data-testid="opening-dimensions">
      {runs.map(([s, e]) => {
        const p0 = wallPoint(f, s, inset);
        const p1 = wallPoint(f, e, inset);
        const mid = wallPoint(f, (s + e) / 2, inset);
        const tick = (along: number) => {
          const [q0, q1] = [wallPoint(f, along, inset - 4 * px), wallPoint(f, along, inset + 4 * px)];
          return <line x1={q0[0]} y1={q0[1]} x2={q1[0]} y2={q1[1]} stroke={ACCENT} strokeWidth={px} />;
        };
        return (
          <g key={s}>
            <line x1={p0[0]} y1={p0[1]} x2={p1[0]} y2={p1[1]} stroke={ACCENT} strokeWidth={px} />
            {tick(s)}
            {tick(e)}
            <g transform={`translate(${mid[0]} ${mid[1]}) rotate(${deg})`}>
              <rect x={-30 * px} y={-7 * px} width={60 * px} height={14 * px} rx={3 * px} fill="#fff" fillOpacity={0.92} />
              <text textAnchor="middle" dominantBaseline="central" fontSize={10.5 * px} fill={ACCENT} fontFamily="ui-monospace, monospace">
                {formatLength(e - s, settings)}
              </text>
            </g>
          </g>
        );
      })}
    </g>
  );
}
