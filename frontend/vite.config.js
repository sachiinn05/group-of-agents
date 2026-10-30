import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, forward API calls to the Express backend so there is no CORS setup.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/auth': 'http://localhost:5000',
      '/agents': 'http://localhost:5000',
      '/google/status': 'http://localhost:5000',
      '/google/url': 'http://localhost:5000',
      '/google/disconnect': 'http://localhost:5000',
    },
  },
});
