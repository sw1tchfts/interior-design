import { useEffect } from 'react';
import { create } from 'zustand';
import { type DocumentState, useDocumentStore } from '../state/documentStore';
import type { ProjectDoc } from '../domain/schema/project';
import { repository } from './repository';

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error';
export const useSaveStatus = create<{ status: SaveStatus }>(() => ({ status: 'saved' }));

const DEBOUNCE_MS = 800;

/**
 * Debounced saving driven by document-store changes. Every change to the
 * document is saved, including ones made while an undo group is still open
 * (mid-drag, or while typing in a field): undo grouping must never keep edits
 * off disk, or closing the tab mid-edit would lose them.
 */
export function createAutosaver(save: (doc: ProjectDoc) => Promise<void>, setStatus: (s: SaveStatus) => void, debounceMs = DEBOUNCE_MS) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: ProjectDoc | null = null;

  const flush = async () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const doc = pending;
    pending = null;
    if (!doc) return;
    setStatus('saving');
    try {
      await save(doc);
      setStatus(pending ? 'pending' : 'saved');
    } catch (e) {
      console.error('Autosave failed', e);
      setStatus('error');
    }
  };

  const onChange = (state: DocumentState, prev: DocumentState) => {
    const h = state.history;
    const p = prev.history;
    if (!h || !p || h.present.id !== p.present.id) return; // load, close or switch
    if (h.present === p.present) return; // e.g. an undo group closing with nothing new
    pending = h.present;
    setStatus('pending');
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), debounceMs);
  };

  return { onChange, flush };
}

/** Saves the open document shortly after every change, and when the tab hides. */
export function useAutosave() {
  useEffect(() => {
    const saver = createAutosaver((doc) => repository.save(doc), (status) => useSaveStatus.setState({ status }));
    const unsub = useDocumentStore.subscribe(saver.onChange);
    const onHide = () => {
      if (document.visibilityState === 'hidden') void saver.flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      unsub();
      void saver.flush();
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    };
  }, []);
}
