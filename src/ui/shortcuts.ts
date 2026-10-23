import { useEffect } from 'react';
import { activeLayout, docActions, getDoc, removeItem, updateItem } from '../state/documentStore';
import { ui } from '../state/uiStore';
import { duplicateItem, rotateItem } from './PropertiesPanel';

/** Editor keyboard shortcuts (ignored while typing in a field). */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) docActions().redo();
        else docActions().undo();
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        docActions().redo();
        return;
      }
      const { tool, selection } = ui();
      if (tool === 'draw') return; // the plan canvas handles typing while drawing
      if (!mod && key === 'd') return ui().setTool('draw');
      if (!mod && key === 'v') return ui().setTool('select');
      if (key === 'escape') return ui().select(null);

      const doc = getDoc();
      if (!doc || selection?.type !== 'item') return;
      const item = activeLayout(doc).items[selection.id];
      if (!item) return;
      if (key === 'delete' || key === 'backspace') {
        e.preventDefault();
        removeItem(item.id);
        ui().select(null);
      } else if (mod && key === 'd') {
        e.preventDefault();
        duplicateItem(item);
      } else if (key === 'r' && !mod && !item.locked) {
        rotateItem(item.id, e.shiftKey ? -90 : 90);
      } else if (key.startsWith('arrow') && !item.locked) {
        e.preventDefault();
        const step = (doc.settings.snapStep || 0.01) * (e.shiftKey ? 12 : 1);
        const [dx, dz] = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[key] ?? [0, 0];
        updateItem(item.id, (it) => {
          it.transform.x += dx! * step;
          it.transform.z += dz! * step;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
