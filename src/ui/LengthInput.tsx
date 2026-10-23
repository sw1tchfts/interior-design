import { useEffect, useRef, useState } from 'react';
import { type UnitSettings, defaultUnitFor, formatLength, parseLength } from '../domain/units/units';

interface Props {
  value: number;
  onCommit(meters: number): void;
  settings: UnitSettings;
  min?: number;
  max?: number;
  label?: string;
  className?: string;
  autoFocus?: boolean;
  onCancel?(): void;
}

/** Text field that shows a formatted length and accepts any unit when typed. */
export function LengthInput({ value, onCommit, settings, min = 0, max = Infinity, label, className, autoFocus, onCancel }: Props) {
  const [draft, setDraft] = useState<string | null>(autoFocus ? formatLength(value, settings) : null);
  const [error, setError] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  // Focus without scrolling: the plan's overflow-hidden container would otherwise shift.
  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true });
  }, [autoFocus]);
  const shown = draft ?? formatLength(value, settings);

  const commit = () => {
    if (draft === null) return;
    const parsed = parseLength(draft, defaultUnitFor(settings));
    if (parsed === null || parsed < min || parsed > max) {
      setError(true);
      setTimeout(() => setError(false), 600);
      setDraft(null);
      onCancel?.();
      return;
    }
    setDraft(null);
    if (Math.abs(parsed - value) > 1e-9) onCommit(parsed);
    else onCancel?.();
  };

  return (
    <input
      ref={ref}
      aria-label={label}
      className={`input font-mono tabular-nums ${error ? 'border-danger! ring-2 ring-danger/20' : ''} ${className ?? ''}`}
      value={shown}
      onFocus={(e) => {
        setDraft(formatLength(value, settings));
        requestAnimationFrame(() => e.target.select());
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit();
          (e.target as HTMLInputElement).blur();
        } else if (e.key === 'Escape') {
          setDraft(null);
          onCancel?.();
          (e.target as HTMLInputElement).blur();
        }
        e.stopPropagation();
      }}
    />
  );
}
