import { Suspense, lazy, useEffect, useState } from 'react';
import { repository } from '../persistence/repository';
import { useAutosave } from '../persistence/autosave';
import { docActions, useDoc } from '../state/documentStore';
import { ui, useUiStore } from '../state/uiStore';
import { PlanCanvas } from '../plan2d/PlanCanvas';
import { navigate } from '../navigation';
import { Toolbar } from './Toolbar';
import { LibraryPanel } from './LibraryPanel';
import { PropertiesPanel } from './PropertiesPanel';
import { SettingsPanel } from './SettingsPanel';
import { Toast } from './Toast';
import { useShortcuts } from './shortcuts';

// three.js is the bulk of the bundle; load it after the editor shell renders.
const Scene3D = lazy(() => import('../view3d/Scene3D').then((m) => ({ default: m.Scene3D })));

export function EditorPage({ projectId }: { projectId: string }) {
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [error, setError] = useState('');
  const doc = useDoc();
  const view = useUiStore((s) => s.view);
  useAutosave();
  useShortcuts();

  useEffect(() => {
    let cancelled = false;
    ui().select(null);
    ui().setTool('select');
    repository
      .get(projectId)
      .then((d) => {
        if (cancelled) return;
        if (!d) return setState('missing');
        docActions().load(d);
        setState('ready');
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setState('error');
      });
    return () => {
      cancelled = true;
      docActions().close();
    };
  }, [projectId]);

  if (state !== 'ready' || !doc) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">
        {state === 'loading' && 'Opening project…'}
        {state === 'missing' && (
          <div className="text-center">
            <p className="mb-3">That project doesn't exist on this device.</p>
            <button className="btn" onClick={() => navigate('/')}>Back to projects</button>
          </div>
        )}
        {state === 'error' && <p className="text-danger">Could not open the project: {error}</p>}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <Toolbar />
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-panel">
          <LibraryPanel />
          <SettingsPanel />
        </aside>
        <main className="flex min-w-0 flex-1">
          {view !== '3d' && (
            <div className={`min-w-0 ${view === 'split' ? 'flex-1 border-r border-line' : 'flex-1'}`}>
              <PlanCanvas />
            </div>
          )}
          {view !== 'plan' && (
            <div className="min-w-0 flex-1">
              <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted">Loading 3D…</div>}>
                <Scene3D />
              </Suspense>
            </div>
          )}
        </main>
        <aside className="w-72 shrink-0 border-l border-line bg-panel">
          <PropertiesPanel />
        </aside>
      </div>
      <Toast />
    </div>
  );
}
