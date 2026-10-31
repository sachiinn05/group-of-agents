import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, forward API calls to the Express backend so there is no CORS setup.
// Page routes (/shop/:slug) are handled by the React app, which is why the public API lives under /public.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/auth': 'http://localhost:5000',
      '/business': 'http://localhost:5000',
      '/public': 'http://localhost:5000',
      '/socket.io': { target: 'http://localhost:5000', ws: true }, // live order updates
    },
  },
});
