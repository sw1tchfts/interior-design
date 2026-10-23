import { create } from 'zustand';

export type Selection =
  | { type: 'item'; id: string }
  | { type: 'wall'; index: number }
  | { type: 'vertex'; index: number }
  | null;

export type Tool = 'select' | 'draw';
export type ViewMode = 'split' | 'plan' | '3d';
export type CameraPreset = 'iso' | 'top' | 'front';

interface UiState {
  selection: Selection;
  tool: Tool;
  view: ViewMode;
  cameraRequest: { preset: CameraPreset; nonce: number } | null;
  toast: { message: string; nonce: number } | null;
  select(sel: Selection): void;
  setTool(tool: Tool): void;
  setView(view: ViewMode): void;
  requestCamera(preset: CameraPreset): void;
  showToast(message: string): void;
}

export const useUiStore = create<UiState>((set) => ({
  selection: null,
  tool: 'select',
  view: 'split',
  cameraRequest: null,
  toast: null,
  select: (selection) => set({ selection }),
  setTool: (tool) => set({ tool, selection: null }),
  setView: (view) => set({ view }),
  requestCamera: (preset) => set({ cameraRequest: { preset, nonce: Date.now() } }),
  showToast: (message) => set({ toast: { message, nonce: Date.now() } }),
}));

export const ui = () => useUiStore.getState();
