import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// Dev convenience only: serves the developer's own local game data straight
// from ../data so the app can auto-load it without a copyrighted asset ever
// being bundled or committed. `apply: 'serve'` means this plugin never runs
// for `vite build` — it has no effect on the production bundle.
const ALLOWED_DEV_ASSETS = new Set(['SKELDAL.DDL']);

function serveLocalGameData(): Plugin {
  return {
    name: 'serve-local-game-data',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/dev-data', (req, res, next) => {
        const name = decodeURIComponent((req.url ?? '').replace(/^\//, ''));
        if (!ALLOWED_DEV_ASSETS.has(name)) {
          next();
          return;
        }
        const filePath = path.resolve(import.meta.dirname, '..', 'data', name);
        readFile(filePath)
          .then((data) => {
            res.setHeader('Content-Type', 'application/octet-stream');
            res.end(data);
          })
          .catch(() => {
            res.statusCode = 404;
            res.end();
          });
      });
    },
  };
}

export default defineConfig({
  plugins: [serveLocalGameData()],
  build: {
    target: 'es2022',
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
