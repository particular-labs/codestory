import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // relative base so the static export (`codestory build`) works from any
  // subpath host (GitHub Pages project sites, docs-site subdirectories, …)
  base: './',
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:4747' } },
});
