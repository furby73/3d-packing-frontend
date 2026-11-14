import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  build: {
    chunkSizeWarningLimit: 800
  },
  server: {
    port: 3000,
    watch: process.env.WATCH_POLLING ? { usePolling: true, interval: 300 } : undefined,
    proxy: {
      '/api': {
        target: process.env.API_PROXY ?? 'http://localhost:8080',
        changeOrigin: true,
        secure: true
      }
    }
  }
});
