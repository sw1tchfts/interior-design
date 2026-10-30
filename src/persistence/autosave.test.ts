import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rectangleRoomPoints } from '../domain/room/roomOps';
import { type ProjectDoc, createProject } from '../domain/schema/project';
import { docActions, useDocumentStore } from '../state/documentStore';
import { type SaveStatus, createAutosaver } from './autosave';

const DEBOUNCE = 100;

function setup() {
  const saved: ProjectDoc[] = [];
  const statuses: SaveStatus[] = [];
  docActions().load(createProject('Smith', rectangleRoomPoints(4, 3)));
  const saver = createAutosaver(async (doc) => { saved.push(doc); }, (s) => statuses.push(s), DEBOUNCE);
  const unsub = useDocumentStore.subscribe(saver.onChange);
  return { saved, statuses, saver, unsub };
}

let cleanup: (() => void) | null = null;
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup?.();
  docActions().close();
  vi.useRealTimers();
});

describe('autosave', () => {
  it('saves shortly after a change and reports its status', async () => {
    const { saved, statuses, unsub } = setup();
    cleanup = unsub;
    docActions().update((d) => { d.name = 'Smith living room'; });
    expect(saved).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(DEBOUNCE + 1);
    expect(saved.map((d) => d.name)).toEqual(['Smith living room']);
    expect(statuses).toEqual(['pending', 'saving', 'saved']);
  });

  it('saves edits made while an undo group is still open', async () => {
    const { saved, unsub } = setup();
    cleanup = unsub;
    docActions().begin(); // focus in a field, or mid-drag
    docActions().update((d) => { d.name = 'Half typed'; });
    await vi.advanceTimersByTimeAsync(DEBOUNCE + 1);
    expect(saved.at(-1)?.name).toBe('Half typed');
    expect(useDocumentStore.getState().history?.txBase).not.toBeNull();
  });

  it('writes an open edit immediately when flushed (tab hidden)', async () => {
    const { saved, saver, unsub } = setup();
    cleanup = unsub;
    docActions().begin();
    docActions().update((d) => { d.name = 'Closing the tab'; });
    await saver.flush();
    expect(saved.map((d) => d.name)).toEqual(['Closing the tab']);
  });

  it('does not save again when an undo group closes with nothing new', async () => {
    const { saved, unsub } = setup();
    cleanup = unsub;
    docActions().begin();
    docActions().update((d) => { d.name = 'Typed'; });
    await vi.advanceTimersByTimeAsync(DEBOUNCE + 1);
    docActions().end();
    await vi.advanceTimersByTimeAsync(DEBOUNCE + 1);
    expect(saved).toHaveLength(1);
  });

  it('saves undo, redo and cancelled drags', async () => {
    const { saved, unsub } = setup();
    cleanup = unsub;
    docActions().update((d) => { d.name = 'B'; });
    docActions().undo();
    await vi.advanceTimersByTimeAsync(DEBOUNCE + 1);
    expect(saved.at(-1)?.name).toBe('Smith');
    docActions().begin();
    docActions().update((d) => { d.name = 'Dragging'; });
    docActions().cancel();
    await vi.advanceTimersByTimeAsync(DEBOUNCE + 1);
    expect(saved.at(-1)?.name).toBe('Smith');
  });

  it('ignores opening or switching projects', async () => {
    const { saved, unsub } = setup();
    cleanup = unsub;
    docActions().load(createProject('Other', rectangleRoomPoints(3, 3)));
    await vi.advanceTimersByTimeAsync(DEBOUNCE + 1);
    expect(saved).toHaveLength(0);
  });

  it('reports an error when saving fails', async () => {
    docActions().load(createProject('Smith', rectangleRoomPoints(4, 3)));
    const statuses: SaveStatus[] = [];
    const saver = createAutosaver(() => Promise.reject(new Error('quota')), (s) => statuses.push(s), DEBOUNCE);
    cleanup = useDocumentStore.subscribe(saver.onChange);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    docActions().update((d) => { d.name = 'X'; });
    await vi.advanceTimersByTimeAsync(DEBOUNCE + 1);
    expect(statuses.at(-1)).toBe('error');
    spy.mockRestore();
  });
});
