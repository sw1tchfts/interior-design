import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { CATEGORY_LABELS, KINDS, createItem, itemFootprint } from '../domain/furniture/registry';
import type { KindDef, Preset } from '../domain/furniture/types';
import { centroid, pointInPolygon, polygonInsidePolygon } from '../domain/geometry/polygon';
import type { Vec2 } from '../domain/geometry/vec2';
import { roomPoints } from '../domain/room/roomOps';
import { findCollisions, snapPointToGrid } from '../domain/snapping/snapping';
import { formatLength } from '../domain/units/units';
import { activeLayout, activeRoom, addItem, getDoc, useSettings } from '../state/documentStore';
import { ui } from '../state/uiStore';

/**
 * Finds a spot near the room's center where the new item fits inside the room
 * and doesn't overlap existing furniture; falls back to any spot inside.
 */
function placementFor(def: KindDef, preset: Preset): Vec2 {
  const doc = getDoc()!;
  const pts = roomPoints(activeRoom(doc));
  const layout = activeLayout(doc);
  const others = layout.itemOrder.map((id) => layout.items[id]!);
  const c = centroid(pts);
  const start: Vec2 = pointInPolygon(c, pts) ? c : pts[0]!;
  const step = 0.15;
  let fallback: Vec2 | null = null;
  for (let ring = 0; ring < 60; ring++) {
    const count = Math.max(1, ring * 8);
    for (let k = 0; k < count; k++) {
      const a = (k / count) * 2 * Math.PI;
      const p = snapPointToGrid([start[0] + Math.cos(a) * ring * step, start[1] + Math.sin(a) * ring * step], doc.settings.snapStep);
      const candidate = createItem(def, preset, p);
      if (!polygonInsidePolygon(itemFootprint(candidate), pts)) continue;
      fallback ??= p;
      if (!def.collides || !findCollisions([...others, candidate]).has(candidate.id)) return p;
    }
  }
  return fallback ?? snapPointToGrid(start, doc.settings.snapStep);
}

export function LibraryPanel() {
  const settings = useSettings();
  const [query, setQuery] = useState('');
  if (!settings) return null;
  const q = query.trim().toLowerCase();
  const groups = Object.entries(CATEGORY_LABELS)
    .map(([cat, label]) => ({
      label,
      entries: KINDS.filter((k) => k.category === cat).flatMap((def) =>
        def.presets.filter((p) => !q || p.label.toLowerCase().includes(q) || def.label.toLowerCase().includes(q)).map((preset) => ({ def, preset })),
      ),
    }))
    .filter((g) => g.entries.length > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-3 pt-3 pb-2">
        <h2 className="field-label mb-2">Add furniture</h2>
        <div className="relative">
          <Search size={14} className="absolute top-1/2 left-2 -translate-y-1/2 text-muted" />
          <input className="input pl-7" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {groups.map((g) => (
          <div key={g.label} className="mb-3">
            <div className="mb-1 text-xs font-semibold text-ink/80">{g.label}</div>
            <ul className="space-y-0.5">
              {g.entries.map(({ def, preset }) => (
                <li key={preset.id}>
                  <button
                    className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent-soft"
                    data-testid={`add-${preset.id}`}
                    onClick={() => {
                      const item = createItem(def, preset, placementFor(def, preset));
                      addItem(item);
                      ui().setTool('select');
                      ui().select({ type: 'item', id: item.id });
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">{preset.label}</span>
                    <span className="shrink-0 font-mono text-[10px] text-muted">
                      {formatLength(preset.dims.width, { ...settings, precision: '1' })} × {formatLength(preset.dims.depth, { ...settings, precision: '1' })}
                    </span>
                    <Plus size={14} className="shrink-0 text-accent opacity-0 group-hover:opacity-100" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
