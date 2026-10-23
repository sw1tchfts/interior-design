import { useDocumentStore } from './state/documentStore';
import { useUiStore } from './state/uiStore';

/** Exposes the stores for end-to-end tests and console debugging. */
export function exposeDebugHandles() {
  (window as unknown as { __APP__: unknown }).__APP__ = { doc: useDocumentStore, ui: useUiStore };
}
