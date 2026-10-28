import { useState } from 'react';
import { Copy, Lock, Plus, RotateCcw, RotateCw, Trash2, Unlock } from 'lucide-react';
import { getKind, itemColor, itemParts } from '../domain/furniture/registry';
import { PALETTE, type MaterialSlot, type ParamField } from '../domain/furniture/types';
import { area, perimeter } from '../domain/geometry/polygon';
import { dist, radToDeg, degToRad, wrapAngle } from '../domain/geometry/vec2';
import { type Item, type Opening, type OpeningType, OPENING_TYPES, type Settings, newId } from '../domain/schema/project';
import {
  OPENING_DEFS, OPENING_PRESETS, changeOpeningType, openingSpan, removeOpening, setOpeningSpan, updateOpening,
} from '../domain/room/openings';
import {
  deleteVertex, insertVertex, roomPoints, setWallLength, validateRoomPoints, wallLabel, wallLength,
} from '../domain/room/roomOps';
import { findCollisions } from '../domain/snapping/snapping';
import { formatArea, formatLength } from '../domain/units/units';
import { addItem, docActions, removeItem, updateItem, updateRoom, useItem, useLayout, useRoom, useSettings } from '../state/documentStore';
import { ui, useUiStore } from '../state/uiStore';
import { addOpeningFromPreset } from './LibraryPanel';
import { LengthInput } from './LengthInput';

const SLOT_LABELS: Record<MaterialSlot, string> = {
  body: 'Body',
  cushion: 'Cushions / upholstery',
  legs: 'Legs / base',
  accent: 'Accent',
  metal: 'Hardware',
  bedding: 'Bedding',
};

/** Groups continuous edits (typing, color dragging) into one undo step. */
const txHandlers = { onFocus: () => docActions().begin(), onBlur: () => docActions().end() };

export function duplicateItem(item: Item) {
  const copy: Item = {
    ...structuredClone(item),
    id: newId(),
    transform: { ...item.transform, x: item.transform.x + 0.3, z: item.transform.z + 0.3 },
  };
  addItem(copy);
  ui().select({ type: 'item', id: copy.id });
}

export function rotateItem(id: string, deltaDeg: number) {
  updateItem(id, (it) => {
    it.transform.rotationY = wrapAngle(it.transform.rotationY + degToRad(deltaDeg));
  });
}

export function PropertiesPanel() {
  const selection = useUiStore((s) => s.selection);
  const settings = useSettings();
  const item = useItem(selection?.type === 'item' ? selection.id : null);
  if (!settings) return null;
  return (
    <div className="h-full overflow-y-auto p-3">
      {item ? (
        <ItemProperties key={item.id} item={item} settings={settings} />
      ) : selection?.type === 'wall' ? (
        <WallProperties index={selection.index} settings={settings} />
      ) : selection?.type === 'vertex' ? (
        <VertexProperties index={selection.index} />
      ) : selection?.type === 'opening' ? (
        <OpeningProperties key={selection.id} id={selection.id} settings={settings} />
      ) : (
        <RoomProperties settings={settings} />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <h3 className="field-label mb-1.5">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-2 py-0.5 text-sm">
      <span className="text-muted">{label}</span>
      {children}
    </label>
  );
}

/** Like Field, but not a <label>, so clicking the caption doesn't press the first button. */
function ChoiceField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-2 py-0.5 text-sm">
      <span className="text-muted">{label}</span>
      <div>{children}</div>
    </div>
  );
}

function ItemProperties({ item, settings }: { item: Item; settings: Settings }) {
  const def = getKind(item.kind);
  const layout = useLayout();
  const colliding = layout ? findCollisions(layout.itemOrder.map((id) => layout.items[id]!)).has(item.id) : false;
  const slots = [...new Set(itemParts(item).map((p) => p.slot))];
  const square = def.keepSquare?.(item.params) ?? false;
  const set = (fn: (it: Item) => void) => updateItem(item.id, fn);

  return (
    <div>
      <div className="mb-3">
        <input
          className="input text-base font-semibold"
          aria-label="Item name"
          {...txHandlers}
          value={item.name}
          onChange={(e) => set((it) => { it.name = e.target.value; })}
        />
        <div className="mt-1 text-xs text-muted">{def.label}</div>
      </div>
      {colliding && (
        <div className="mb-3 rounded-md border border-danger/30 bg-danger/5 px-2 py-1.5 text-xs text-danger">
          Overlaps another piece of furniture.
        </div>
      )}

      <Section title="Size">
        <Field label={square ? 'Diameter' : 'Width'}>
          <LengthInput
            label="Width" value={item.dims.width} settings={settings} min={0.02} max={20}
            onCommit={(v) => set((it) => { it.dims.width = v; if (square) it.dims.depth = v; })}
          />
        </Field>
        {!square && (
          <Field label="Depth">
            <LengthInput label="Depth" value={item.dims.depth} settings={settings} min={0.02} max={20} onCommit={(v) => set((it) => { it.dims.depth = v; })} />
          </Field>
        )}
        <Field label="Height">
          <LengthInput label="Height" value={item.dims.height} settings={settings} min={0.005} max={6} onCommit={(v) => set((it) => { it.dims.height = v; })} />
        </Field>
      </Section>

      <Section title="Placement">
        <Field label="Rotation">
          <div className="flex items-center gap-1">
            <AngleInput value={item.transform.rotationY} onCommit={(r) => set((it) => { it.transform.rotationY = r; })} />
            <button className="btn btn-ghost px-1.5" aria-label="Rotate left 90°" onClick={() => rotateItem(item.id, 90)}><RotateCcw size={14} /></button>
            <button className="btn btn-ghost px-1.5" aria-label="Rotate right 90°" onClick={() => rotateItem(item.id, -90)}><RotateCw size={14} /></button>
          </div>
        </Field>
      </Section>

      {def.fields.length > 0 && (
        <Section title="Style">
          {def.fields.map((f) => (
            <ParamInput key={f.key} field={f} item={item} settings={settings} />
          ))}
        </Section>
      )}

      <Section title="Colors">
        {slots.map((slot) => (
          <ColorRow key={slot} label={SLOT_LABELS[slot]} value={itemColor(item, slot)} onChange={(hex) => set((it) => { it.colors[slot] = hex; })} />
        ))}
      </Section>

      <Section title="Notes">
        <textarea
          className="input min-h-16 resize-y"
          placeholder="Vendor, fabric, price…"
          {...txHandlers}
          value={item.notes ?? ''}
          onChange={(e) => set((it) => { it.notes = e.target.value; })}
        />
      </Section>

      <div className="flex flex-wrap gap-2">
        <button className="btn" onClick={() => duplicateItem(item)}><Copy size={14} /> Duplicate</button>
        <button className="btn" onClick={() => set((it) => { it.locked = !it.locked; })}>
          {item.locked ? <><Unlock size={14} /> Unlock</> : <><Lock size={14} /> Lock</>}
        </button>
        <button className="btn btn-danger" onClick={() => { removeItem(item.id); ui().select(null); }}>
          <Trash2 size={14} /> Delete
        </button>
      </div>
    </div>
  );
}

function AngleInput({ value, onCommit }: { value: number; onCommit(rad: number): void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(Math.round(radToDeg(value) * 10) / 10);
  const commit = () => {
    if (draft === null) return;
    const deg = parseFloat(draft);
    setDraft(null);
    if (Number.isFinite(deg)) onCommit(wrapAngle(degToRad(deg)));
  };
  return (
    <div className="relative flex-1">
      <input
        className="input pr-5 font-mono tabular-nums"
        aria-label="Rotation in degrees"
        value={shown}
        onFocus={() => setDraft(shown)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          e.stopPropagation();
        }}
      />
      <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-muted">°</span>
    </div>
  );
}

function ParamInput({ field, item, settings }: { field: ParamField; item: Item; settings: Settings }) {
  const def = getKind(item.kind);
  const value = item.params[field.key] ?? def.defaults[field.key];
  const set = (v: number | string | boolean) =>
    updateItem(item.id, (it) => {
      it.params[field.key] = v;
      // Switching to a round shape makes the footprint a circle.
      if (def.keepSquare?.(it.params)) it.dims.depth = it.dims.width;
    });
  switch (field.type) {
    case 'length':
      return (
        <Field label={field.label}>
          <LengthInput label={field.label} value={Number(value)} settings={settings} min={field.min} max={field.max} onCommit={set} />
        </Field>
      );
    case 'int':
      return (
        <Field label={field.label}>
          <input
            type="number" className="input" aria-label={field.label} min={field.min} max={field.max} value={Number(value)}
            onChange={(e) => {
              const n = Math.round(Number(e.target.value));
              if (n >= field.min && n <= field.max) set(n);
            }}
          />
        </Field>
      );
    case 'select':
      return (
        <Field label={field.label}>
          <select className="input" aria-label={field.label} value={String(value)} onChange={(e) => set(e.target.value)}>
            {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
      );
    case 'bool':
      return (
        <Field label={field.label}>
          <input type="checkbox" className="h-4 w-4 accent-accent" checked={Boolean(value)} onChange={(e) => set(e.target.checked)} />
        </Field>
      );
  }
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange(hex: string): void }) {
  return (
    <div className="mb-2">
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-muted">{label}</span>
        <input type="color" {...txHandlers} aria-label={`${label} color`} className="h-6 w-8 cursor-pointer rounded border border-line" value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-1">
        {PALETTE.map((c) => (
          <button
            key={c.hex}
            title={c.name}
            aria-label={c.name}
            className={`h-5 w-5 rounded-full border ${c.hex.toLowerCase() === value.toLowerCase() ? 'ring-2 ring-accent ring-offset-1' : 'border-black/10'}`}
            style={{ background: c.hex }}
            onClick={() => onChange(c.hex)}
          />
        ))}
      </div>
    </div>
  );
}

function WallProperties({ index, settings }: { index: number; settings: Settings }) {
  const room = useRoom();
  if (!room || !room.vertices[index]) return null;
  const pts = roomPoints(room);
  const len = dist(pts[index]!, pts[(index + 1) % pts.length]!);
  const openings = room.openings
    .flatMap((o) => {
      const s = openingSpan(room, o);
      return s && s.wallIndex === index ? [{ o, start: s.start }] : [];
    })
    .sort((p, q) => p.start - q.start);
  return (
    <div>
      <h2 className="mb-3 text-base font-semibold">Wall {wallLabel(index)}</h2>
      <Section title="Dimensions">
        <Field label="Length">
          <LengthInput
            label="Wall length" value={len} settings={settings} min={0.05} max={200}
            onCommit={(v) => {
              const next = setWallLength(room, index, v);
              const check = validateRoomPoints(roomPoints(next));
              if (check.ok) updateRoom(() => next);
              else ui().showToast(check.reason);
            }}
          />
        </Field>
        <Field label="Thickness">
          <LengthInput
            label="Wall thickness" value={room.walls[index]!.thickness} settings={settings} min={0.02} max={1}
            onCommit={(v) => updateRoom((r) => ({ ...r, walls: r.walls.map((w) => ({ ...w, thickness: v })) }))}
          />
        </Field>
      </Section>
      <p className="mb-3 text-xs leading-relaxed text-muted">
        Changing the length keeps every corner angle; the next wall slides to follow. Drag the wall in the plan to move it,
        drag a corner handle to reshape, or double-click a wall to add a corner. Thickness applies to all walls for now.
      </p>
      <button className="btn mb-4" onClick={() => { updateRoom((r) => insertVertex(r, index)); ui().select({ type: 'vertex', index: index + 1 }); }}>
        Add corner in the middle
      </button>
      <Section title="Doors & windows">
        {openings.length > 0 && (
          <ul className="mb-2 space-y-0.5">
            {openings.map(({ o, start }) => (
              <li key={o.id}>
                <button
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-accent-soft"
                  onClick={() => ui().select({ type: 'opening', id: o.id })}
                >
                  <span className="min-w-0 flex-1 truncate">{OPENING_DEFS[o.type].label}</span>
                  <span className="shrink-0 font-mono text-[11px] text-muted">
                    {formatLength(o.width, settings)} · {formatLength(start, settings)} from left
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <button className="btn" onClick={() => addOpeningFromPreset(DOOR_PRESET, [index])}><Plus size={14} /> Door</button>
          <button className="btn" onClick={() => addOpeningFromPreset(WINDOW_PRESET, [index])}><Plus size={14} /> Window</button>
        </div>
      </Section>
    </div>
  );
}

const DOOR_PRESET = OPENING_PRESETS.find((p) => p.id === 'door-30')!;
const WINDOW_PRESET = OPENING_PRESETS.find((p) => p.id === 'window-36')!;
const SIDE_HINT = 'Left and right as seen from inside the room, facing the wall.';

function OpeningProperties({ id, settings }: { id: string; settings: Settings }) {
  const room = useRoom();
  const o = room?.openings.find((x) => x.id === id);
  const span = room && o ? openingSpan(room, o) : null;
  if (!room || !o || !span) return null;
  const def = OPENING_DEFS[o.type];
  const len = wallLength(room, span.wallIndex);
  const width = span.end - span.start;
  const set = (patch: Partial<Opening>) => updateRoom((r) => updateOpening(r, id, patch));
  const place = (offset: number, w: number) => {
    const next = setOpeningSpan(room, id, offset, w);
    if (next) updateRoom(() => next);
    else ui().showToast('That would overlap another door or window.');
  };

  return (
    <div>
      <h2 className="text-base font-semibold">{def.label}</h2>
      <div className="mb-3 text-xs text-muted">On wall {wallLabel(span.wallIndex)}</div>

      <Section title="Type">
        <select
          className="input"
          aria-label="Opening type"
          value={o.type}
          onChange={(e) => set(changeOpeningType(o, e.target.value as OpeningType))}
        >
          {OPENING_TYPES.map((t) => <option key={t} value={t}>{OPENING_DEFS[t].label}</option>)}
        </select>
      </Section>

      <Section title="Size">
        <Field label="Width">
          <LengthInput label="Opening width" value={width} settings={settings} min={0.1} max={len} onCommit={(v) => place(span.start, v)} />
        </Field>
        <Field label="Height">
          <LengthInput label="Opening height" value={o.height} settings={settings} min={0.1} max={room.ceilingHeight - o.sill} onCommit={(v) => set({ height: v })} />
        </Field>
        {o.type === 'window' && (
          <Field label="Sill height">
            <LengthInput label="Sill height" value={o.sill} settings={settings} min={0} max={room.ceilingHeight - 0.1} onCommit={(v) => set({ sill: v, height: Math.min(o.height, room.ceilingHeight - v) })} />
          </Field>
        )}
      </Section>

      <Section title="Position">
        <Field label="From left">
          <LengthInput label="Distance from left corner" value={span.start} settings={settings} min={0} max={len - width} onCommit={(v) => place(v, width)} />
        </Field>
        <Field label="From right">
          <LengthInput label="Distance from right corner" value={len - span.end} settings={settings} min={0} max={len - width} onCommit={(v) => place(len - width - v, width)} />
        </Field>
        <p className="mt-1 text-xs text-muted">{SIDE_HINT} Drag it in the plan to slide it or move it to another wall.</p>
      </Section>

      {(def.handed || def.swings) && (
        <Section title={o.type === 'pocket_door' ? 'Pocket' : 'Swing'}>
          {def.handed && (
            <ChoiceField label={o.type === 'pocket_door' ? 'Slides into' : 'Hinges'}>
              <div className="seg" role="group" aria-label={o.type === 'pocket_door' ? 'Pocket side' : 'Hinge side'}>
                <button aria-pressed={o.hinge === 'start'} onClick={() => set({ hinge: 'start' })}>Left</button>
                <button aria-pressed={o.hinge === 'end'} onClick={() => set({ hinge: 'end' })}>Right</button>
              </div>
            </ChoiceField>
          )}
          {def.swings && (
            <ChoiceField label="Opens">
              <div className="seg" role="group" aria-label="Swing direction">
                <button aria-pressed={o.swing === 'in'} onClick={() => set({ swing: 'in' })}>Into room</button>
                <button aria-pressed={o.swing === 'out'} onClick={() => set({ swing: 'out' })}>Outward</button>
              </div>
            </ChoiceField>
          )}
        </Section>
      )}

      <button className="btn btn-danger" onClick={() => { updateRoom((r) => removeOpening(r, id)); ui().select(null); }}>
        <Trash2 size={14} /> Delete
      </button>
    </div>
  );
}

function VertexProperties({ index }: { index: number }) {
  const room = useRoom();
  if (!room) return null;
  const canDelete = room.vertices.length > 3;
  return (
    <div>
      <h2 className="mb-3 text-base font-semibold">Corner {index + 1}</h2>
      <p className="mb-3 text-xs text-muted">Drag the corner in the plan to reshape the room. Hold Alt to move it off the grid.</p>
      <button
        className="btn btn-danger"
        disabled={!canDelete}
        onClick={() => {
          const next = deleteVertex(room, index);
          const check = validateRoomPoints(roomPoints(next));
          if (check.ok) { updateRoom(() => next); ui().select(null); }
          else ui().showToast(check.reason);
        }}
      >
        <Trash2 size={14} /> Delete corner
      </button>
    </div>
  );
}

function RoomProperties({ settings }: { settings: Settings }) {
  const room = useRoom();
  if (!room) return null;
  const pts = roomPoints(room);
  return (
    <div>
      <input
        className="input mb-3 text-base font-semibold"
        aria-label="Room name"
        {...txHandlers}
        value={room.name}
        onChange={(e) => updateRoom((r) => ({ ...r, name: e.target.value }))}
      />
      <Section title="Room">
        <Field label="Ceiling height">
          <LengthInput label="Ceiling height" value={room.ceilingHeight} settings={settings} min={1.5} max={12} onCommit={(v) => updateRoom((r) => ({ ...r, ceilingHeight: v }))} />
        </Field>
        <Field label="Floor area"><span className="font-mono text-sm">{formatArea(area(pts), settings)}</span></Field>
        <Field label="Perimeter"><span className="font-mono text-sm">{formatLengthShort(perimeter(pts), settings)}</span></Field>
        <Field label="Walls"><span className="text-sm">{pts.length}</span></Field>
      </Section>
      <Section title="Finishes">
        <ColorRow label="Floor" value={room.materials.floor} onChange={(hex) => updateRoom((r) => ({ ...r, materials: { ...r.materials, floor: hex } }))} />
        <ColorRow label="Walls" value={room.materials.walls} onChange={(hex) => updateRoom((r) => ({ ...r, materials: { ...r.materials, walls: hex } }))} />
      </Section>
      <p className="text-xs leading-relaxed text-muted">
        Click a wall or its dimension to edit it. Use <b>Draw room</b> in the toolbar to trace a new outline of any shape.
        Select furniture to resize, restyle or recolor it.
      </p>
    </div>
  );
}

function formatLengthShort(m: number, settings: Settings) {
  return settings.unitSystem === 'imperial' ? `${Math.round(m / 0.3048)}'` : `${m.toFixed(2)} m`;
}
