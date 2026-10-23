import { del, get, set } from 'idb-keyval';
import { type ProjectDoc, parseProjectDoc } from '../domain/schema/project';

export interface ProjectMeta {
  id: string;
  name: string;
  clientName?: string;
  updatedAt: string;
}

/** Storage boundary; IndexedDB now, Supabase later. */
export interface ProjectRepository {
  list(): Promise<ProjectMeta[]>;
  get(id: string): Promise<ProjectDoc | null>;
  save(doc: ProjectDoc): Promise<void>;
  remove(id: string): Promise<void>;
}

const INDEX_KEY = 'projects:index';
const docKey = (id: string) => `projects:doc:${id}`;

const toMeta = (doc: ProjectDoc): ProjectMeta => ({
  id: doc.id,
  name: doc.name,
  clientName: doc.clientName,
  updatedAt: doc.updatedAt,
});

export const indexedDbRepository: ProjectRepository = {
  async list() {
    const index = (await get<ProjectMeta[]>(INDEX_KEY)) ?? [];
    return [...index].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  async get(id) {
    const raw = await get(docKey(id));
    return raw ? parseProjectDoc(raw) : null;
  },
  async save(doc) {
    await set(docKey(doc.id), doc);
    const index = (await get<ProjectMeta[]>(INDEX_KEY)) ?? [];
    await set(INDEX_KEY, [...index.filter((m) => m.id !== doc.id), toMeta(doc)]);
  },
  async remove(id) {
    await del(docKey(id));
    const index = (await get<ProjectMeta[]>(INDEX_KEY)) ?? [];
    await set(INDEX_KEY, index.filter((m) => m.id !== id));
  },
};

export const repository: ProjectRepository = indexedDbRepository;

export function exportProjectFile(doc: ProjectDoc) {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${doc.name.replace(/[^\w\- ]+/g, '').trim() || 'project'}.room.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readProjectFile(file: File): Promise<ProjectDoc> {
  return parseProjectDoc(JSON.parse(await file.text()));
}
