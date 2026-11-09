import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import{siteMiddleware}from'./site/middleware.js';
export default defineConfig({
  plugins: [{name:'nedveo-public-site',configureServer(server){server.middlewares.use(siteMiddleware())}},react({ jsxImportSource: './localized' })],
  // These are application source files, not packages to prebundle.
  optimizeDeps: {
    exclude: ['./localized/jsx-runtime', './localized/jsx-dev-runtime'],
    include: ['react/jsx-runtime', 'react/jsx-dev-runtime'],
  },
  server: { proxy: { '/api': 'http://127.0.0.1:4311' } },
});
