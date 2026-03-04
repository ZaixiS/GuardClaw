import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],

  build: {
    outDir: 'dist',
    emptyOutDir: true,

    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        tray: resolve(__dirname, 'tray.html'),
      },
    },
  },

  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
      '/events': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        ws: false,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.headers['cache-control'] = 'no-cache';
            proxyRes.headers['x-accel-buffering'] = 'no';
          });
        },
      },
    },
  },
});
