import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      includeAssets: ['icons/*'],
    }),
  ],
  optimizeDeps: {
    exclude: ['@butler/ui', '@butler/api-client'],
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
