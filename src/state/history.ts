// Snapshot-based undo/redo with transactions, so a whole drag is one undo step.

export interface History<T> {
  present: T;
  past: T[];
  future: T[];
  /** Snapshot taken when a transaction began; null when none is open. */
  txBase: T | null;
}

export const HISTORY_LIMIT = 200;

export const createHistory = <T>(present: T): History<T> => ({ present, past: [], future: [], txBase: null });

/** Applies a change as its own undo step (or folds it into an open transaction). */
export function commit<T>(h: History<T>, next: T): History<T> {
  if (next === h.present) return h;
  if (h.txBase !== null) return { ...h, present: next };
  return { present: next, past: [...h.past, h.present].slice(-HISTORY_LIMIT), future: [], txBase: null };
}

export function begin<T>(h: History<T>): History<T> {
  return h.txBase !== null ? h : { ...h, txBase: h.present };
}

export function end<T>(h: History<T>): History<T> {
  if (h.txBase === null) return h;
  if (h.txBase === h.present) return { ...h, txBase: null };
  return { present: h.present, past: [...h.past, h.txBase].slice(-HISTORY_LIMIT), future: [], txBase: null };
}

export function cancel<T>(h: History<T>): History<T> {
  return h.txBase === null ? h : { ...h, present: h.txBase, txBase: null };
}

export function undo<T>(h: History<T>): History<T> {
  const base = end(h);
  const prev = base.past[base.past.length - 1];
  if (prev === undefined) return base;
  return { present: prev, past: base.past.slice(0, -1), future: [base.present, ...base.future], txBase: null };
}

export function redo<T>(h: History<T>): History<T> {
  const base = end(h);
  const [next, ...rest] = base.future;
  if (next === undefined) return base;
  return { present: next, past: [...base.past, base.present], future: rest, txBase: null };
}
