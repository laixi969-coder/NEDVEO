import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react({ jsxImportSource: './localized' })],
  // These are application source files, not packages to prebundle.
  optimizeDeps: {
    exclude: ['./localized/jsx-runtime', './localized/jsx-dev-runtime'],
    include: ['react/jsx-runtime', 'react/jsx-dev-runtime'],
  },
  server: { proxy: { '/api': 'http://127.0.0.1:4311' } },
});
