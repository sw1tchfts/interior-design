/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The lazily loaded 3D chunk (three.js) is ~1 MB by nature.
  build: { chunkSizeWarningLimit: 1100 },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
