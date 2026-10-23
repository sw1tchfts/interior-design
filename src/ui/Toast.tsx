import { useEffect, useState } from 'react';
import { useUiStore } from '../state/uiStore';

export function Toast() {
  const toast = useUiStore((s) => s.toast);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast || !visible) return null;
  return (
    <div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md bg-ink px-4 py-2 text-sm text-white shadow-lg">
      {toast.message}
    </div>
  );
}
