import { describe, expect, it } from 'vitest';
import { begin, cancel, commit, createHistory, end, redo, undo } from './history';

describe('history', () => {
  it('undoes and redoes single commits', () => {
    let h = createHistory(1);
    h = commit(h, 2);
    h = commit(h, 3);
    h = undo(h);
    expect(h.present).toBe(2);
    h = undo(h);
    expect(h.present).toBe(1);
    h = undo(h);
    expect(h.present).toBe(1);
    h = redo(h);
    expect(h.present).toBe(2);
    h = commit(h, 9);
    expect(h.future).toEqual([]);
  });

  it('groups a transaction into one undo step', () => {
    let h = createHistory(0);
    h = begin(h);
    for (let i = 1; i <= 10; i++) h = commit(h, i);
    h = end(h);
    expect(h.present).toBe(10);
    expect(h.past).toEqual([0]);
    h = undo(h);
    expect(h.present).toBe(0);
  });

  it('cancels a transaction and ignores empty ones', () => {
    let h = commit(createHistory(0), 1);
    h = cancel(commit(begin(h), 5));
    expect(h.present).toBe(1);
    h = end(begin(h));
    expect(h.past).toEqual([0]);
  });
});
