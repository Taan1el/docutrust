/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { localFirstBuild } from './localBuild.js';

// "vite build --mode pages" builds the static GitHub Pages demo: it is served
// from /docutrust/, uses the in-browser signing adapter instead of the
// Express API, and goes to dist-pages so it never replaces the build that
// the server serves (see server/src/config.ts).
export default defineConfig(({ mode }) => {
  const pages = mode === 'pages';
  if (pages) process.env.VITE_DEMO_MODE = 'true';
  // loadEnv reads .env / .env.local (see client/.env.example) and lets an
  // actual shell environment variable of the same name override the file,
  // which is what this config itself needs since it runs in Node, not the
  // browser.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), ...(pages ? [localFirstBuild({ base: '/docutrust/', id: 'docutrust', name: 'DocuTrust',
      description: 'Sign and verify local files in this browser.', themeColor: '#efe9dc' })] : [])],
    base: pages ? '/docutrust/' : '/',
    build: {
      outDir: pages ? 'dist-pages' : 'dist',
      assetsInlineLimit: pages ? 0 : undefined,
    },
    define: {
      'import.meta.env.VITE_DEMO_MODE': JSON.stringify(pages ? 'true' : 'false'),
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: env.VITE_API_TARGET || 'http://127.0.0.1:4000',
          changeOrigin: true,
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
    },
  };
});
