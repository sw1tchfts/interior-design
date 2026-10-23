import type { Precision, UnitSystem } from '../domain/units/units';
import { INCH, formatLength } from '../domain/units/units';
import type { Settings } from '../domain/schema/project';
import { docActions, useSettings } from '../state/documentStore';

const IMPERIAL_SNAPS = [0, 0.25, 0.5, 1, 3, 6, 12].map((n) => n * INCH);
const METRIC_SNAPS = [0, 0.005, 0.01, 0.05, 0.1];

const set = (fn: (s: Settings) => void) => docActions().update((d) => fn(d.settings));

export function SettingsPanel() {
  const settings = useSettings();
  if (!settings) return null;
  const snaps = settings.unitSystem === 'imperial' ? IMPERIAL_SNAPS : METRIC_SNAPS;
  const snapValue = snaps.reduce((best, s) => (Math.abs(s - settings.snapStep) < Math.abs(best - settings.snapStep) ? s : best), snaps[0]!);
  return (
    <div className="space-y-2 border-t border-line p-3 text-sm">
      <h2 className="field-label">Units & snapping</h2>
      <div className="seg w-full">
        {(['imperial', 'metric'] as UnitSystem[]).map((u) => (
          <button
            key={u}
            className="flex-1"
            aria-pressed={settings.unitSystem === u}
            data-testid={`units-${u}`}
            onClick={() =>
              set((s) => {
                s.unitSystem = u;
                s.precision = u === 'imperial' ? '1/4' : 'cm';
                s.snapStep = u === 'imperial' ? INCH : 0.01;
              })
            }
          >
            {u === 'imperial' ? `ft / in` : 'cm'}
          </button>
        ))}
      </div>
      <label className="flex items-center justify-between gap-2">
        <span className="text-muted">Precision</span>
        <select
          className="input w-28"
          value={settings.precision}
          onChange={(e) => set((s) => { s.precision = e.target.value as Precision; })}
        >
          {(settings.unitSystem === 'imperial' ? ['1', '1/2', '1/4', '1/8', '1/16'] : ['cm', 'mm']).map((p) => (
            <option key={p} value={p}>{settings.unitSystem === 'imperial' ? `${p}"` : p === 'cm' ? '1 cm' : '1 mm'}</option>
          ))}
        </select>
      </label>
      <label className="flex items-center justify-between gap-2">
        <span className="text-muted">Grid snap</span>
        <select className="input w-28" value={snapValue} onChange={(e) => set((s) => { s.snapStep = Number(e.target.value); })}>
          {snaps.map((v) => (
            <option key={v} value={v}>{v === 0 ? 'Off' : formatLength(v, { unitSystem: settings.unitSystem, precision: settings.unitSystem === 'imperial' ? '1/4' : 'mm' })}</option>
          ))}
        </select>
      </label>
      <label className="flex items-center justify-between gap-2">
        <span className="text-muted">Rotation snap</span>
        <select className="input w-28" value={settings.rotationSnapDeg} onChange={(e) => set((s) => { s.rotationSnapDeg = Number(e.target.value); })}>
          {[1, 5, 15, 45, 90].map((d) => <option key={d} value={d}>{d}°</option>)}
        </select>
      </label>
      <label className="flex items-center justify-between gap-2">
        <span className="text-muted">Snap to walls</span>
        <input type="checkbox" className="h-4 w-4 accent-accent" checked={settings.wallSnap} onChange={(e) => set((s) => { s.wallSnap = e.target.checked; })} />
      </label>
      <label className="flex items-center justify-between gap-2">
        <span className="text-muted">Keep inside room</span>
        <input type="checkbox" className="h-4 w-4 accent-accent" checked={settings.keepInsideRoom} onChange={(e) => set((s) => { s.keepInsideRoom = e.target.checked; })} />
      </label>
      <p className="text-[11px] text-muted">Hold Alt while dragging to ignore snapping. Shift while rotating for free angles.</p>
    </div>
  );
}
