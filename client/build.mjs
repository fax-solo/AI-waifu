/**
 * Build script that calls Vite's JavaScript API directly,
 * bypassing the esbuild config-parsing step that crashes on Node v26.
 */
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import wasm from 'vite-plugin-wasm';

await build({
  plugins: [react(), tailwindcss(), wasm()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: 'esbuild',
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          vrm: ['@pixiv/three-vrm'],
          rapier: ['@dimforge/rapier3d'],
        },
      },
    },
  },
});

console.log('Build complete!');
