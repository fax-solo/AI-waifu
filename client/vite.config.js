import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  plugins: [react(), tailwindcss(), wasm()],
  base: './',
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d'],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3005',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3005',
        changeOrigin: true,
      },
      '/gallery': {
        target: 'http://localhost:3005',
        changeOrigin: true,
      },
      '/textures': {
        target: 'http://localhost:3005',
        changeOrigin: true,
      },
      '/animations': {
        target: 'http://localhost:3005',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext',
    minify: 'esbuild',
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
