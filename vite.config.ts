import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createReadStream, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

// Keep PDF font, character-map and decoder resources local in dev and production.
function pdfAssets(): Plugin {
  const root = new URL('./node_modules/pdfjs-dist/', import.meta.url);
  const assets = new Map<string, string>();
  assets.set('/pdfjs-assets/LICENSE', fileURLToPath(new URL('LICENSE', root)));
  for (const folder of ['cmaps', 'standard_fonts', 'wasm']) {
    for (const name of readdirSync(new URL(folder + '/', root))) {
      if (/\.(bcmap|pfb|ttf|wasm|js)$/.test(name) || /^LICENSE/.test(name)) assets.set(`/pdfjs-assets/${folder}/${name}`, fileURLToPath(new URL(`${folder}/${name}`, root)));
    }
  }
  return {
    name: 'local-pdf-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = assets.get((req.url ?? '').split('?')[0]);
        if (!path) return next();
        res.setHeader('Content-Type', path.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
        createReadStream(path).pipe(res);
      });
    },
    generateBundle() { for (const [url, path] of assets) this.emitFile({ type: 'asset', fileName: url.slice(1), source: readFileSync(path) }); },
  };
}
export default defineConfig({ plugins: [react(), pdfAssets()] });
