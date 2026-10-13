import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@butler/ui', '@butler/api-client'],
  },
  server: {
    port: 5175,
    strictPort: true,
  },
});
