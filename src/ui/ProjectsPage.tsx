import { useEffect, useRef, useState } from 'react';
import { FolderOpen, Plus, Trash2, Upload } from 'lucide-react';
import { createProject, defaultSettings } from '../domain/schema/project';
import { lShapeRoomPoints, rectangleRoomPoints } from '../domain/room/roomOps';
import { feet } from '../domain/units/units';
import { type ProjectMeta, readProjectFile, repository } from '../persistence/repository';
import { navigate } from '../navigation';
import { LengthInput } from './LengthInput';

type Shape = 'rect' | 'l';

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => repository.list().then(setProjects).catch((e) => setError(String(e)));
  useEffect(() => {
    void refresh();
  }, []);

  const importFile = async (file: File) => {
    try {
      const doc = await readProjectFile(file);
      const existing = await repository.get(doc.id);
      if (existing && !confirm(`Replace the existing project "${existing.name}" with the imported file?`)) return;
      await repository.save(doc);
      navigate(`/p/${doc.id}`);
    } catch (e) {
      setError(`Could not import that file: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Room Planner</h1>
          <p className="text-sm text-muted">Measure, model and rearrange your clients' rooms.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={() => fileRef.current?.click()}>
            <Upload size={16} /> Import project file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importFile(f);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      {error && <div className="mb-4 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</div>}

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
        <section>
          <h2 className="field-label mb-2">Projects</h2>
          {projects === null ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : projects.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line p-8 text-center text-sm text-muted">
              No projects yet. Create your first room on the right.
            </div>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-white">
              {projects.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3 hover:bg-panel">
                  <button className="min-w-0 flex-1 text-left" onClick={() => navigate(`/p/${p.id}`)}>
                    <div className="truncate font-medium">{p.name}</div>
                    <div className="text-xs text-muted">
                      {p.clientName ? `${p.clientName} · ` : ''}Edited {new Date(p.updatedAt).toLocaleString()}
                    </div>
                  </button>
                  <button className="btn btn-ghost" onClick={() => navigate(`/p/${p.id}`)} aria-label={`Open ${p.name}`}>
                    <FolderOpen size={16} />
                  </button>
                  <button
                    className="btn btn-ghost btn-danger"
                    aria-label={`Delete ${p.name}`}
                    onClick={async () => {
                      if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
                      await repository.remove(p.id);
                      void refresh();
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <NewProjectForm />
      </div>
    </div>
  );
}

function NewProjectForm() {
  const settings = defaultSettings();
  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [shape, setShape] = useState<Shape>('rect');
  const [width, setWidth] = useState(feet(14));
  const [length, setLength] = useState(feet(12));
  const [notchW, setNotchW] = useState(feet(5));
  const [notchL, setNotchL] = useState(feet(4));
  const notchValid = notchW < width - 0.1 && notchL < length - 0.1;

  const create = async () => {
    const pts = shape === 'rect' ? rectangleRoomPoints(width, length) : lShapeRoomPoints(width, length, notchW, notchL);
    const doc = createProject(name.trim() || 'Untitled room', pts);
    if (client.trim()) doc.clientName = client.trim();
    await repository.save(doc);
    navigate(`/p/${doc.id}`);
  };

  return (
    <section className="h-fit rounded-lg border border-line bg-white p-4">
      <h2 className="mb-3 font-semibold">New project</h2>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <label className="block space-y-1">
          <span className="field-label">Project name</span>
          <input className="input" placeholder="Smith living room" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className="field-label">Client (optional)</span>
          <input className="input" value={client} onChange={(e) => setClient(e.target.value)} />
        </label>
        <div className="space-y-1">
          <span className="field-label">Starting shape</span>
          <div className="seg w-full">
            <button type="button" className="flex-1" aria-pressed={shape === 'rect'} onClick={() => setShape('rect')}>Rectangle</button>
            <button type="button" className="flex-1" aria-pressed={shape === 'l'} onClick={() => setShape('l')}>L-shape</button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="field-label">Width</span>
            <LengthInput label="Room width" value={width} onCommit={setWidth} settings={settings} min={0.5} max={100} />
          </label>
          <label className="space-y-1">
            <span className="field-label">Length</span>
            <LengthInput label="Room length" value={length} onCommit={setLength} settings={settings} min={0.5} max={100} />
          </label>
          {shape === 'l' && (
            <>
              <label className="space-y-1">
                <span className="field-label">Notch width</span>
                <LengthInput label="Notch width" value={notchW} onCommit={setNotchW} settings={settings} min={0.1} max={100} />
              </label>
              <label className="space-y-1">
                <span className="field-label">Notch length</span>
                <LengthInput label="Notch length" value={notchL} onCommit={setNotchL} settings={settings} min={0.1} max={100} />
              </label>
            </>
          )}
        </div>
        <p className="text-xs text-muted">
          Type in any unit: 14'6", 174", 442 cm. You can draw any other shape, or adjust each wall, in the editor.
        </p>
        {shape === 'l' && !notchValid && <p className="text-xs text-danger">The notch must be smaller than the room.</p>}
        <button type="submit" className="btn btn-primary w-full" disabled={shape === 'l' && !notchValid}>
          <Plus size={16} /> Create project
        </button>
      </form>
    </section>
  );
}
