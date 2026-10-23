import { ArrowLeft, Box, Columns2, Download, Eye, MousePointer2, PenLine, Redo2, Square, Undo2 } from 'lucide-react';
import { exportProjectFile } from '../persistence/repository';
import { useSaveStatus } from '../persistence/autosave';
import { docActions, getDoc, useCanRedo, useCanUndo, useDoc } from '../state/documentStore';
import { ui, useUiStore } from '../state/uiStore';
import { navigate } from '../navigation';

const SAVE_LABEL = { saved: 'Saved', pending: 'Unsaved changes', saving: 'Saving…', error: 'Save failed' };

export function Toolbar() {
  const doc = useDoc();
  const tool = useUiStore((s) => s.tool);
  const view = useUiStore((s) => s.view);
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();
  const status = useSaveStatus((s) => s.status);
  if (!doc) return null;
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-white px-2">
      <button className="btn btn-ghost" onClick={() => navigate('/')} aria-label="Back to projects">
        <ArrowLeft size={16} />
      </button>
      <input
        className="w-56 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-semibold outline-none hover:border-line focus:border-accent"
        aria-label="Project name"
        value={doc.name}
        onFocus={() => docActions().begin()}
        onBlur={() => docActions().end()}
        onChange={(e) => docActions().update((d) => { d.name = e.target.value; })}
      />
      <span className={`text-xs ${status === 'error' ? 'text-danger' : 'text-muted'}`} data-testid="save-status">
        {SAVE_LABEL[status]}
      </span>

      <div className="mx-2 h-6 w-px bg-line" />
      <button className="btn btn-ghost" disabled={!canUndo} onClick={() => docActions().undo()} aria-label="Undo" title="Undo (Ctrl/Cmd+Z)">
        <Undo2 size={16} />
      </button>
      <button className="btn btn-ghost" disabled={!canRedo} onClick={() => docActions().redo()} aria-label="Redo" title="Redo (Shift+Ctrl/Cmd+Z)">
        <Redo2 size={16} />
      </button>

      <div className="mx-2 h-6 w-px bg-line" />
      <div className="seg">
        <button aria-pressed={tool === 'select'} onClick={() => ui().setTool('select')} title="Select and move (V)">
          <span className="flex items-center gap-1"><MousePointer2 size={13} /> Select</span>
        </button>
        <button aria-pressed={tool === 'draw'} onClick={() => ui().setTool('draw')} title="Draw a new room outline (D)" data-testid="tool-draw">
          <span className="flex items-center gap-1"><PenLine size={13} /> Draw room</span>
        </button>
      </div>

      <div className="flex-1" />

      {view !== 'plan' && (
        <div className="seg" aria-label="3D camera">
          <button onClick={() => ui().requestCamera('iso')} title="Corner view"><Eye size={13} /></button>
          <button onClick={() => ui().requestCamera('top')} title="Top view"><Square size={13} /></button>
          <button onClick={() => ui().requestCamera('front')} title="Eye-level view"><Box size={13} /></button>
        </div>
      )}
      <div className="seg" aria-label="View">
        <button aria-pressed={view === 'plan'} onClick={() => ui().setView('plan')}>Plan</button>
        <button aria-pressed={view === 'split'} onClick={() => ui().setView('split')} aria-label="Split view"><Columns2 size={13} /></button>
        <button aria-pressed={view === '3d'} onClick={() => ui().setView('3d')}>3D</button>
      </div>
      <button className="btn btn-ghost" onClick={() => exportProjectFile(getDoc()!)} title="Download project file (backup)">
        <Download size={16} />
      </button>
    </header>
  );
}
