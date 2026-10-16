import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html'), viewer: resolve(__dirname, 'viewer.html') },
    },
  },
});
