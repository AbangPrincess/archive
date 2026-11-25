import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Cross-origin isolation lets the on-device speech model use several CPU cores.
// "credentialless" keeps OpenStreetMap tiles and other public files loading normally.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
  server: { port: 5173, headers: isolation },
  preview: { headers: isolation },
});
