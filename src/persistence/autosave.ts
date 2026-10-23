import { useEffect } from 'react';
import { create } from 'zustand';
import { useDocumentStore } from '../state/documentStore';
import type { ProjectDoc } from '../domain/schema/project';
import { repository } from './repository';

type SaveStatus = 'saved' | 'pending' | 'saving' | 'error';
export const useSaveStatus = create<{ status: SaveStatus }>(() => ({ status: 'saved' }));

const DEBOUNCE_MS = 800;

/** Saves the open document shortly after every change, and when the tab hides. */
export function useAutosave() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending: ProjectDoc | null = null;

    const flush = async () => {
      if (timer) clearTimeout(timer);
      timer = null;
      const doc = pending;
      pending = null;
      if (!doc) return;
      useSaveStatus.setState({ status: 'saving' });
      try {
        await repository.save(doc);
        useSaveStatus.setState({ status: pending ? 'pending' : 'saved' });
      } catch (e) {
        console.error('Autosave failed', e);
        useSaveStatus.setState({ status: 'error' });
      }
    };

    const unsub = useDocumentStore.subscribe((state, prev) => {
      const h = state.history;
      const p = prev.history;
      if (!h || !p || h.present.id !== p.present.id) return; // load, close or switch
      if (h.txBase) return; // mid-drag; the end of the transaction saves
      if (h.present === p.present && !p.txBase) return;
      pending = h.present;
      useSaveStatus.setState({ status: 'pending' });
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, DEBOUNCE_MS);
    });

    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      unsub();
      void flush();
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    };
  }, []);
}
