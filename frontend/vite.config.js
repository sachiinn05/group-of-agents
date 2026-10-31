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
      '/email': 'http://localhost:5000',
      '/khata': 'http://localhost:5000',
      // Google sends the browser to /google/callback on the backend directly, so only these go through here
      '/google/url': 'http://localhost:5000',
      '/google/disconnect': 'http://localhost:5000',
      '/socket.io': { target: 'http://localhost:5000', ws: true }, // live order updates
    },
  },
});
