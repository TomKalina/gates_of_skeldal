import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// Dev convenience only: serves the developer's own local game data straight
// from ../data so the app can auto-load it without a copyrighted asset ever
// being bundled or committed. `apply: 'serve'` means this plugin never runs
// for `vite build` — it has no effect on the production bundle.
const ALLOWED_DEV_ASSETS = new Set(['SKELDAL.DDL']);
// .MAP files (and ITEMS.DAT, the same block-container format, same folder —
// see formats/items-file.ts) live loose under data/maps/ (skeldal.ini's
// separate `maps` path), not inside SKELDAL.DDL — allowlisted individually
// as new maps are needed. SKRETI/PLANE/CAREDBAR/SOUTESKA/P_LESY_1 are the
// real MA_LOADL/MC_PASSFAIL map-transition targets found in LESPRED.MAP's
// own A_MAPMACR data (see map-file.ts's parseMapMacros) — walking into
// the map edges those macros are attached to now actually loads them. Each
// map's own .ENC level-text file (see formats/enc-file.ts) lives right
// alongside it under the same basename.
const ALLOWED_DEV_MAPS = new Set([
  'LESPRED.MAP',
  'LESPRED.ENC',
  'ITEMS.DAT',
  'SKRETI.MAP',
  'SKRETI.ENC',
  'PLANE.MAP',
  'PLANE.ENC',
  'CAREDBAR.MAP',
  'CAREDBAR.ENC',
  'SOUTESKA.MAP',
  'SOUTESKA.ENC',
  'P_LESY_1.MAP',
  'P_LESY_1.ENC',
]);

function serveLocalGameData(): Plugin {
  return {
    name: 'serve-local-game-data',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/dev-data', (req, res, next) => {
        const reqPath = decodeURIComponent((req.url ?? '').replace(/^\//, ''));
        const mapsMatch = /^maps\/([^/]+)$/.exec(reqPath);

        let filePath: string;
        if (ALLOWED_DEV_ASSETS.has(reqPath)) {
          filePath = path.resolve(import.meta.dirname, '..', 'data', reqPath);
        } else if (mapsMatch && ALLOWED_DEV_MAPS.has(mapsMatch[1]!)) {
          filePath = path.resolve(import.meta.dirname, '..', 'data', 'maps', mapsMatch[1]!);
        } else {
          next();
          return;
        }

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
