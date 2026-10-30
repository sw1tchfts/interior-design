import { useEffect, useMemo, useRef } from 'react';
import { create } from 'zustand';
import { type Draft, produce } from 'immer';
import type { Item, Layout, ProjectDoc, Room } from '../domain/schema/project';
import * as H from './history';

export interface DocumentState {
  history: H.History<ProjectDoc> | null;
  load(doc: ProjectDoc): void;
  close(): void;
  /** Applies a change as one undo step, or inside the open transaction. */
  update(recipe: (draft: Draft<ProjectDoc>) => void): void;
  begin(): void;
  end(): void;
  cancel(): void;
  undo(): void;
  redo(): void;
}

export const useDocumentStore = create<DocumentState>((set, get) => {
  const apply = (fn: (h: H.History<ProjectDoc>) => H.History<ProjectDoc>) => {
    const h = get().history;
    if (h) set({ history: fn(h) });
  };
  return {
    history: null,
    load: (doc) => set({ history: H.createHistory(doc) }),
    close: () => set({ history: null }),
    update: (recipe) =>
      apply((h) => {
        const next = produce(h.present, (d) => {
          recipe(d);
        });
        if (next === h.present) return h;
        return H.commit(h, { ...next, updatedAt: new Date().toISOString() });
      }),
    begin: () => apply(H.begin),
    end: () => apply(H.end),
    cancel: () => apply(H.cancel),
    undo: () => apply(H.undo),
    redo: () => apply(H.redo),
  };
});

export const docActions = () => useDocumentStore.getState();

/**
 * Finishes the edit in a focused field (committing it and closing its undo group)
 * before a press in the plan or 3D view changes the selection or starts a drag.
 * Browsers only blur on mousedown, after pointerdown handlers have already run,
 * so without this the field's group and the drag's group would get tangled.
 */
export function finishFieldEdit() {
  const el = document.activeElement;
  if (el instanceof HTMLElement && el.matches('input, textarea, select')) el.blur();
}

/**
 * Focus/blur handlers that make a field's edits (typing, color dragging) one undo
 * step. If the field unmounts while focused, browsers skip the blur, so the
 * group is closed on unmount instead of staying open and swallowing later edits.
 */
export function useEditTransaction() {
  const open = useRef(false);
  useEffect(
    () => () => {
      if (open.current) docActions().end();
    },
    [],
  );
  return useMemo(
    () => ({
      onFocus: () => {
        open.current = true;
        docActions().begin();
      },
      onBlur: () => {
        if (!open.current) return;
        open.current = false;
        docActions().end();
      },
    }),
    [],
  );
}

export const useDoc = () => useDocumentStore((s) => s.history?.present ?? null);
export const useCanUndo = () => useDocumentStore((s) => (s.history?.past.length ?? 0) > 0);
export const useCanRedo = () => useDocumentStore((s) => (s.history?.future.length ?? 0) > 0);

// M1 works with the first room and its first layout; multi-room and layout
// switching come later.
export const activeRoom = (doc: ProjectDoc): Room => doc.rooms[doc.roomOrder[0]!]!;
export const activeLayout = (doc: ProjectDoc): Layout => {
  const roomId = doc.roomOrder[0]!;
  const id = doc.layoutOrder.find((l) => doc.layouts[l]!.roomId === roomId)!;
  return doc.layouts[id]!;
};

export const useRoom = () => useDocumentStore((s) => (s.history ? activeRoom(s.history.present) : null));
export const useLayout = () => useDocumentStore((s) => (s.history ? activeLayout(s.history.present) : null));
export const useSettings = () => useDocumentStore((s) => s.history?.present.settings ?? null);
export const useItem = (id: string | null) =>
  useDocumentStore((s) => (s.history && id ? activeLayout(s.history.present).items[id] ?? null : null));

export const getDoc = () => useDocumentStore.getState().history?.present ?? null;

/** Mutates the active room in the current document. */
export function updateRoom(fn: (room: Room) => Room) {
  docActions().update((d) => {
    const id = d.roomOrder[0]!;
    d.rooms[id] = fn(d.rooms[id] as Room) as Draft<Room>;
  });
}

export function updateItem(id: string, fn: (item: Draft<Item>) => void) {
  docActions().update((d) => {
    const item = activeLayout(d as ProjectDoc).items[id] as Draft<Item> | undefined;
    if (item) fn(item);
  });
}

export function addItem(item: Item) {
  docActions().update((d) => {
    const layout = activeLayout(d as ProjectDoc) as Draft<Layout>;
    layout.items[item.id] = item;
    layout.itemOrder.push(item.id);
  });
}

export function removeItem(id: string) {
  docActions().update((d) => {
    const layout = activeLayout(d as ProjectDoc) as Draft<Layout>;
    delete layout.items[id];
    layout.itemOrder = layout.itemOrder.filter((x) => x !== id);
  });
}
