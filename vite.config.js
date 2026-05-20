import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  server: {
    open: true,
    proxy: {
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
      '/health': {
        target: 'http://localhost:3001',
      },
    },
  },
});
