import { useEffect, useState } from 'react';
import { ProjectsPage } from './ui/ProjectsPage';
import { EditorPage } from './ui/EditorPage';

function useHashPath(): string {
  const [path, setPath] = useState(() => window.location.hash.slice(1) || '/');
  useEffect(() => {
    const onChange = () => setPath(window.location.hash.slice(1) || '/');
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return path;
}

export function App() {
  const path = useHashPath();
  const match = /^\/p\/([\w-]+)$/.exec(path);
  if (match) return <EditorPage key={match[1]} projectId={match[1]!} />;
  return <ProjectsPage />;
}
