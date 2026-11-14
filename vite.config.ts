import { defineConfig } from 'vite';

// Relative base so the build works from any GitHub Pages sub-path.
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  // Dev only: let the phone-testing tunnel hosts reach the dev server.
  server: { allowedHosts: ['.trycloudflare.com', '.loca.lt'] },
});
