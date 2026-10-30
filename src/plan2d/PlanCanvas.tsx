import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Maximize } from 'lucide-react';
import { boundingBox, offsetPolygon, outwardNormal } from '../domain/geometry/polygon';
import { type Vec2, add, closestPointOnSegment, dist, dot, localToWorld, lerp, scale, sub, wrapAngle } from '../domain/geometry/vec2';
import { getKind, itemFootprint } from '../domain/furniture/registry';
import type { Item, Opening, Room, Settings } from '../domain/schema/project';
import { placeTypedLength, snapDrawPoint } from '../domain/room/drawSnap';
import { dragOpeningTo, openingSpan, updateOpening, wallFrame } from '../domain/room/openings';
import {
  insertVertex, moveVertex, moveWall, roomPoints, setRoomPoints, setWallLength, validateRoomPoints, wallLabel,
} from '../domain/room/roomOps';
import { dragItemTo, findCollisions, snapAngle, snapToGrid } from '../domain/snapping/snapping';
import { defaultUnitFor, formatLength, parseLength } from '../domain/units/units';
import {
  docActions, finishFieldEdit, getDoc, activeLayout, activeRoom, updateItem, updateRoom, useLayout, useRoom, useSettings,
} from '../state/documentStore';
import { ui, useUiStore } from '../state/uiStore';
import { GridLayer } from './GridLayer';
import { ItemSymbol } from './ItemSymbol';
import { OpeningDimensions, OpeningHitArea, OpeningSymbol } from './OpeningSymbol';
import { LengthInput } from '../ui/LengthInput';

interface Viewport {
  cx: number;
  cz: number;
  s: number; // pixels per meter
}

type Drag =
  | { type: 'pan'; startClient: Vec2; start: Viewport }
  | { type: 'item'; id: string; offset: Vec2 }
  | { type: 'rotate'; id: string }
  | { type: 'vertex'; index: number }
  | { type: 'wall'; index: number; startWorld: Vec2; startRoom: Room }
  /** `grab` is how far along the wall the pointer was from the opening's start edge. */
  | { type: 'opening'; id: string; grab: number };

const ACCENT = '#2f6fde';
const DANGER = '#d1453b';

function fitViewport(room: Room, w: number, h: number): Viewport {
  const { min, max } = boundingBox(roomPoints(room));
  const pad = 70;
  const s = Math.min((w - 2 * pad) / Math.max(0.5, max[0] - min[0]), (h - 2 * pad) / Math.max(0.5, max[1] - min[1]));
  return { cx: (min[0] + max[0]) / 2, cz: (min[1] + max[1]) / 2, s: Math.max(5, Math.min(800, s)) };
}

export function PlanCanvas() {
  const room = useRoom();
  const layout = useLayout();
  const settings = useSettings();
  const selection = useUiStore((s) => s.selection);
  const tool = useUiStore((s) => s.tool);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<Viewport | null>(null);
  const drag = useRef<Drag | null>(null);
  const [editingWall, setEditingWall] = useState<number | null>(null);
  // Draw tool state.
  const [drawPts, setDrawPts] = useState<Vec2[]>([]);
  const [cursor, setCursor] = useState<{ p: Vec2; closes: boolean } | null>(null);
  const [typed, setTyped] = useState('');

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry!.contentRect;
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!view && room && size.w > 0) setView(fitViewport(room, size.w, size.h));
  }, [view, room, size]);

  useEffect(() => {
    if (tool !== 'draw') {
      setDrawPts([]);
      setCursor(null);
      setTyped('');
    }
  }, [tool]);

  const toWorld = useCallback(
    (clientX: number, clientY: number): Vec2 => {
      const rect = svgRef.current!.getBoundingClientRect();
      const v = view!;
      return [(clientX - rect.left - size.w / 2) / v.s + v.cx, (clientY - rect.top - size.h / 2) / v.s + v.cz];
    },
    [view, size],
  );

  const items = useMemo(() => (layout ? layout.itemOrder.map((id) => layout.items[id]!).filter(Boolean) : []), [layout]);
  const collisions = useMemo(() => findCollisions(items), [items]);

  const closeDrawing = useCallback(
    (pts: Vec2[]) => {
      const check = validateRoomPoints(pts);
      if (!check.ok) {
        ui().showToast(check.reason);
        return;
      }
      updateRoom((r) => setRoomPoints(r, pts));
      ui().setTool('select');
      const r = activeRoom(getDoc()!);
      setView(fitViewport(r, size.w, size.h));
    },
    [size],
  );

  // Keyboard input while drawing: type a length and press Enter to place a corner.
  useEffect(() => {
    if (tool !== 'draw') return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      if (e.key === 'Escape') {
        ui().setTool('select');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const len = typed ? parseLength(typed, settings ? defaultUnitFor(settings) : 'in') : null;
        if (len !== null && len > 0 && cursor) {
          const p = placeTypedLength(drawPts, cursor.p, len);
          if (p) setDrawPts((pts) => [...pts, p]);
          setTyped('');
        } else if (drawPts.length >= 3) {
          closeDrawing(drawPts);
        }
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        if (typed) setTyped((t) => t.slice(0, -1));
        else setDrawPts((pts) => pts.slice(0, -1));
      } else if (/^[\d.'"/\- a-z]$/i.test(e.key) && !e.metaKey && !e.ctrlKey && drawPts.length > 0) {
        e.preventDefault();
        setTyped((t) => t + e.key);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tool, typed, cursor, drawPts, settings, closeDrawing]);

  if (!room || !layout || !settings || !view || size.w === 0) {
    return <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-canvas" />;
  }

  const px = 1 / view.s;
  const pts = roomPoints(room);
  const thickness = room.walls.map((w) => w.thickness);
  const outer = offsetPolygon(pts, Math.max(...thickness));
  const wallPath = `M${outer.map((p) => p.join(' ')).join('L')}Z M${pts.map((p) => p.join(' ')).join('L')}Z`;
  const bounds = {
    minX: view.cx - size.w / 2 / view.s,
    maxX: view.cx + size.w / 2 / view.s,
    minZ: view.cz - size.h / 2 / view.s,
    maxZ: view.cz + size.h / 2 / view.s,
  };
  const toScreen = (p: Vec2): Vec2 => [(p[0] - view.cx) * view.s + size.w / 2, (p[1] - view.cz) * view.s + size.h / 2];
  const editingRoom = selection?.type === 'wall' || selection?.type === 'vertex';
  const selectedItem = selection?.type === 'item' ? layout.items[selection.id] : undefined;
  const selectedOpening = selection?.type === 'opening' ? room.openings.find((o) => o.id === selection.id) : undefined;
  const wallT = Math.max(...thickness);

  const capture = (e: ReactPointerEvent) => svgRef.current?.setPointerCapture(e.pointerId);

  const onItemDown = (e: ReactPointerEvent, item: Item) => {
    if (tool !== 'select' || e.button !== 0) return;
    e.stopPropagation();
    ui().select({ type: 'item', id: item.id });
    if (item.locked) return;
    const w = toWorld(e.clientX, e.clientY);
    drag.current = { type: 'item', id: item.id, offset: sub(w, [item.transform.x, item.transform.z]) };
    docActions().begin();
    capture(e);
  };

  const onOpeningDown = (e: ReactPointerEvent, o: Opening) => {
    if (tool !== 'select' || e.button !== 0) return;
    e.stopPropagation();
    ui().select({ type: 'opening', id: o.id });
    const span = openingSpan(room, o);
    if (!span) return;
    const f = wallFrame(room, span.wallIndex);
    const along = dot(sub(toWorld(e.clientX, e.clientY), f.a), f.dir);
    drag.current = { type: 'opening', id: o.id, grab: along - span.start };
    docActions().begin();
    capture(e);
  };

  const onBackgroundDown = (e: ReactPointerEvent) => {
    if (tool === 'draw' && e.button === 0) {
      const w = toWorld(e.clientX, e.clientY);
      const snap = snapDrawPoint(w, drawPts, {
        gridStep: settings.snapStep, angleStepDeg: 45, closeThreshold: 10 * px, free: e.altKey,
      });
      if (snap.closes) closeDrawing(drawPts);
      else if (!drawPts.length || dist(snap.p, drawPts[drawPts.length - 1]!) > 1e-6) setDrawPts([...drawPts, snap.p]);
      setTyped('');
      return;
    }
    if (tool === 'select' && e.button === 0) ui().select(null);
    drag.current = { type: 'pan', startClient: [e.clientX, e.clientY], start: view };
    capture(e);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const w = toWorld(e.clientX, e.clientY);
    if (tool === 'draw' && !drag.current) {
      setCursor(snapDrawPoint(w, drawPts, { gridStep: settings.snapStep, angleStepDeg: 45, closeThreshold: 10 * px, free: e.altKey }));
      return;
    }
    const d = drag.current;
    if (!d) return;
    const doc = getDoc()!;
    if (d.type === 'pan') {
      setView({ ...d.start, cx: d.start.cx - (e.clientX - d.startClient[0]) / view.s, cz: d.start.cz - (e.clientY - d.startClient[1]) / view.s });
    } else if (d.type === 'item') {
      const item = activeLayout(doc).items[d.id];
      if (!item) return;
      const t = dragItemTo(item, sub(w, d.offset), { settings, room: activeRoom(doc), free: e.altKey, wallThreshold: 14 * px });
      updateItem(d.id, (it) => {
        it.transform = t;
      });
    } else if (d.type === 'rotate') {
      const item = activeLayout(doc).items[d.id];
      if (!item) return;
      const v = sub(w, [item.transform.x, item.transform.z]);
      let angle = Math.atan2(-v[0], -v[1]);
      angle = e.shiftKey ? wrapAngle(angle) : snapAngle(angle, settings.rotationSnapDeg);
      updateItem(d.id, (it) => {
        it.transform.rotationY = angle;
      });
    } else if (d.type === 'vertex') {
      const p: Vec2 = e.altKey ? w : [snapToGrid(w[0], settings.snapStep), snapToGrid(w[1], settings.snapStep)];
      const next = moveVertex(activeRoom(doc), d.index, p);
      if (validateRoomPoints(roomPoints(next)).ok) updateRoom(() => next);
    } else if (d.type === 'wall') {
      const [a, b] = [d.startRoom.vertices[d.index]!.p, d.startRoom.vertices[(d.index + 1) % d.startRoom.vertices.length]!.p];
      let delta = dot(sub(w, d.startWorld), outwardNormal(a, b));
      if (!e.altKey) delta = snapToGrid(delta, settings.snapStep);
      const next = moveWall(d.startRoom, d.index, delta);
      if (validateRoomPoints(roomPoints(next)).ok) updateRoom(() => next);
    } else if (d.type === 'opening') {
      const r = activeRoom(doc);
      const o = r.openings.find((x) => x.id === d.id);
      const next = o && dragOpeningTo(r, o, w, d.grab, e.altKey ? 0 : settings.snapStep);
      if (next) updateRoom((rm) => updateOpening(rm, d.id, next));
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && d.type !== 'pan') docActions().end();
  };

  const onWheel = (e: React.WheelEvent) => {
    const w = toWorld(e.clientX, e.clientY);
    const s = Math.max(5, Math.min(1500, view.s * Math.exp(-e.deltaY * 0.0015)));
    const rect = svgRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left - size.w / 2;
    const sy = e.clientY - rect.top - size.h / 2;
    setView({ s, cx: w[0] - sx / s, cz: w[1] - sy / s });
  };

  const startWallDrag = (e: ReactPointerEvent, index: number) => {
    if (tool !== 'select' || e.button !== 0) return;
    e.stopPropagation();
    ui().select({ type: 'wall', index });
    // Read the store, not this render's `room`: finishing a field edit on this press may have just changed it.
    drag.current = { type: 'wall', index, startWorld: toWorld(e.clientX, e.clientY), startRoom: activeRoom(getDoc()!) };
    docActions().begin();
    capture(e);
  };

  const lastDraw = drawPts[drawPts.length - 1];

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-canvas select-none" data-testid="plan-canvas">
      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        className="block touch-none"
        data-testid="plan-svg"
        style={{ cursor: tool === 'draw' ? 'crosshair' : drag.current?.type === 'pan' ? 'grabbing' : 'default' }}
        onPointerDownCapture={finishFieldEdit}
        onPointerDown={onBackgroundDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => tool === 'draw' && setCursor(null)}
        onWheel={onWheel}
        onDoubleClick={() => tool === 'draw' && drawPts.length >= 3 && closeDrawing(drawPts)}
      >
        <g transform={`translate(${size.w / 2 - view.cx * view.s} ${size.h / 2 - view.cz * view.s}) scale(${view.s})`}>
          <GridLayer bounds={bounds} scale={view.s} unitSystem={settings.unitSystem} />

          {/* Room */}
          <polygon points={pts.map((p) => p.join(',')).join(' ')} fill="#fbfaf7" />
          <path d={wallPath} fill="#3d3a35" fillRule="evenodd" pointerEvents="none" />
          {room.openings.map((o) => (
            <OpeningSymbol key={o.id} room={room} opening={o} thickness={wallT} px={px} selected={o.id === selectedOpening?.id} />
          ))}

          {/* Furniture, rugs first */}
          <g>
            {[...items]
              .sort((a, b) => Number(getKind(a.kind).collides) - Number(getKind(b.kind).collides))
              .map((item) => (
                <ItemSymbol key={item.id} item={item} px={px} dimmed={tool === 'draw'} onPointerDown={onItemDown} />
              ))}
          </g>

          {/* Collision warnings */}
          {items
            .filter((i) => collisions.has(i.id))
            .map((i) => (
              <polygon
                key={i.id}
                points={itemFootprint(i).map((p) => p.join(',')).join(' ')}
                fill={DANGER}
                fillOpacity={0.12}
                stroke={DANGER}
                strokeWidth={1.5 * px}
                strokeDasharray={`${4 * px} ${3 * px}`}
                pointerEvents="none"
              />
            ))}

          {/* Selected item outline and rotate handle */}
          {selectedItem && tool === 'select' && (
            <SelectionOverlay item={selectedItem} px={px} onRotateDown={(e) => {
              if (e.button !== 0 || selectedItem.locked) return;
              e.stopPropagation();
              drag.current = { type: 'rotate', id: selectedItem.id };
              docActions().begin();
              capture(e);
            }} />
          )}

          {/* Wall hit areas (select, drag parallel, double-click to add a corner) */}
          {tool === 'select' &&
            pts.map((a, i) => {
              const b = pts[(i + 1) % pts.length]!;
              const selected = selection?.type === 'wall' && selection.index === i;
              return (
                <line
                  key={i}
                  data-wall-index={i}
                  x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]}
                  stroke={selected ? ACCENT : 'transparent'}
                  strokeWidth={selected ? 3 * px : 12 * px}
                  strokeLinecap="round"
                  style={{ cursor: 'grab' }}
                  pointerEvents="stroke"
                  onPointerDown={(e) => startWallDrag(e, i)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    const { t } = closestPointOnSegment(toWorld(e.clientX, e.clientY), a, b);
                    updateRoom((r) => insertVertex(r, i, t));
                    ui().select({ type: 'vertex', index: i + 1 });
                  }}
                />
              );
            })}

          {/* Doors and windows: grab areas above the walls, and gaps to the corners when selected */}
          {tool === 'select' &&
            room.openings.map((o) => (
              <OpeningHitArea key={o.id} room={room} opening={o} thickness={wallT} px={px} onPointerDown={onOpeningDown} />
            ))}
          {selectedOpening && tool === 'select' && (
            <OpeningDimensions room={room} opening={selectedOpening} px={px} settings={settings} />
          )}

          {/* Wall dimension labels */}
          {pts.map((a, i) => {
            const b = pts[(i + 1) % pts.length]!;
            const mid = lerp(a, b, 0.5);
            const n = outwardNormal(a, b);
            const pos = add(mid, scale(n, room.walls[i]!.thickness + 13 * px));
            let deg = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
            if (deg > 90) deg -= 180;
            if (deg <= -90) deg += 180;
            const tooShort = dist(a, b) * view.s < 40;
            if (tooShort) return null;
            return (
              <g
                key={i}
                transform={`translate(${pos[0]} ${pos[1]}) rotate(${deg})`}
                style={{ cursor: tool === 'select' ? 'text' : undefined }}
                data-testid={`wall-label-${i}`}
                onPointerDown={(e) => {
                  if (tool !== 'select') return;
                  e.stopPropagation();
                  ui().select({ type: 'wall', index: i });
                }}
                // Open on click (not pointerdown) so the browser's mousedown focus
                // handling doesn't immediately blur the new input.
                onClick={() => tool === 'select' && setEditingWall(i)}
              >
                <rect x={-34 * px} y={-8 * px} width={68 * px} height={16 * px} rx={3 * px} fill="#fbfaf7" fillOpacity={0.9} />
                <text textAnchor="middle" dominantBaseline="central" fontSize={11 * px} fill="#23211e" fontFamily="ui-monospace, monospace">
                  <tspan fill="#9a958b">{wallLabel(i)} </tspan>
                  {formatLength(dist(a, b), settings)}
                </text>
              </g>
            );
          })}

          {/* Corner handles when editing the room */}
          {tool === 'select' && editingRoom &&
            pts.map((p, i) => {
              const selected = selection?.type === 'vertex' && selection.index === i;
              return (
                <circle
                  key={i}
                  data-vertex-index={i}
                  cx={p[0]} cy={p[1]} r={(selected ? 7 : 5.5) * px}
                  fill={selected ? ACCENT : '#fff'}
                  stroke={ACCENT}
                  strokeWidth={2 * px}
                  style={{ cursor: 'move' }}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    ui().select({ type: 'vertex', index: i });
                    drag.current = { type: 'vertex', index: i };
                    docActions().begin();
                    capture(e);
                  }}
                />
              );
            })}

          {/* Draw tool preview */}
          {tool === 'draw' && (
            <g pointerEvents="none">
              {drawPts.length > 0 && (
                <polyline points={drawPts.map((p) => p.join(',')).join(' ')} fill="none" stroke={ACCENT} strokeWidth={2.5 * px} />
              )}
              {lastDraw && cursor && (
                <>
                  <line x1={lastDraw[0]} y1={lastDraw[1]} x2={cursor.p[0]} y2={cursor.p[1]} stroke={ACCENT} strokeWidth={1.5 * px} strokeDasharray={`${5 * px} ${4 * px}`} />
                  <text
                    x={(lastDraw[0] + cursor.p[0]) / 2}
                    y={(lastDraw[1] + cursor.p[1]) / 2 - 8 * px}
                    textAnchor="middle"
                    fontSize={12 * px}
                    fill={ACCENT}
                    fontFamily="ui-monospace, monospace"
                  >
                    {formatLength(dist(lastDraw, cursor.p), settings)}
                  </text>
                </>
              )}
              {drawPts.map((p, i) => (
                <circle key={i} data-testid="draw-point" cx={p[0]} cy={p[1]} r={(i === 0 && cursor?.closes ? 8 : 4) * px} fill={i === 0 ? ACCENT : '#fff'} stroke={ACCENT} strokeWidth={1.5 * px} />
              ))}
              {cursor && <circle cx={cursor.p[0]} cy={cursor.p[1]} r={3 * px} fill={ACCENT} />}
            </g>
          )}
        </g>
      </svg>

      {/* Inline wall length editor */}
      {editingWall !== null && room.vertices[editingWall] && (() => {
        const [a, b] = [pts[editingWall]!, pts[(editingWall + 1) % pts.length]!];
        const pos = toScreen(add(lerp(a, b, 0.5), scale(outwardNormal(a, b), room.walls[editingWall]!.thickness + 13 * px)));
        return (
          <div className="absolute z-10 w-32 -translate-x-1/2 -translate-y-1/2" style={{ left: pos[0], top: pos[1] }}>
            <WallLengthEditor
              room={room}
              index={editingWall}
              settings={settings}
              onDone={() => setEditingWall(null)}
            />
          </div>
        );
      })()}

      {tool === 'draw' && (
        <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-md bg-ink/90 px-3 py-2 text-xs text-white shadow-lg">
          {drawPts.length === 0
            ? 'Click to place the first corner.'
            : drawPts.length < 3
              ? 'Click the next corner, or type a length and press Enter.'
              : 'Click the first corner (or press Enter) to finish.'}
          <span className="ml-2 text-white/60">Alt: free angle · Backspace: undo corner · Esc: cancel</span>
          {typed && <div className="mt-1 font-mono text-sm text-white">Length: {typed}▏</div>}
        </div>
      )}

      <div className="absolute right-3 bottom-3 flex items-center gap-2">
        <span className="rounded bg-white/80 px-2 py-1 text-[11px] text-muted shadow-xs">
          Scroll to zoom · drag empty space to pan
        </span>
        <button className="btn" onClick={() => setView(fitViewport(room, size.w, size.h))} aria-label="Fit room to view">
          <Maximize size={14} /> Fit
        </button>
      </div>
    </div>
  );
}

function SelectionOverlay({ item, px, onRotateDown }: { item: Item; px: number; onRotateDown(e: ReactPointerEvent): void }) {
  const fp = itemFootprint(item);
  const c: Vec2 = [item.transform.x, item.transform.z];
  const back = localToWorld([0, -item.dims.depth / 2], c, item.transform.rotationY);
  const handle = localToWorld([0, -item.dims.depth / 2 - 24 * px], c, item.transform.rotationY);
  return (
    <g>
      <polygon points={fp.map((p) => p.join(',')).join(' ')} fill="none" stroke={ACCENT} strokeWidth={2 * px} pointerEvents="none" />
      {!item.locked && (
        <>
          <line x1={back[0]} y1={back[1]} x2={handle[0]} y2={handle[1]} stroke={ACCENT} strokeWidth={1.5 * px} pointerEvents="none" />
          <circle
            data-testid="rotate-handle"
            cx={handle[0]} cy={handle[1]} r={6 * px}
            fill="#fff" stroke={ACCENT} strokeWidth={2 * px}
            style={{ cursor: 'grab' }}
            onPointerDown={onRotateDown}
          />
        </>
      )}
    </g>
  );
}

function WallLengthEditor({ room, index, settings, onDone }: { room: Room; index: number; settings: Settings; onDone(): void }) {
  const [a, b] = [room.vertices[index]!.p, room.vertices[(index + 1) % room.vertices.length]!.p];
  return (
    <LengthInput
      autoFocus
      label={`Length of wall ${wallLabel(index)}`}
      value={dist(a, b)}
      settings={settings}
      min={0.05}
      max={200}
      className="text-center shadow-lg"
      onCancel={onDone}
      onCommit={(len) => {
        const next = setWallLength(room, index, len);
        const check = validateRoomPoints(roomPoints(next));
        if (check.ok) updateRoom(() => next);
        else ui().showToast(check.reason);
        onDone();
      }}
    />
  );
}
