import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));
const mapsDir = fileURLToPath(new URL('./src/maps/', import.meta.url));

/**
 * API do editor de mapas (só no servidor de desenvolvimento):
 *   GET /__maps        -> lista dos mapas em src/maps
 *   GET /__maps/<id>   -> o arquivo do mapa
 *   PUT /__maps/<id>   -> grava src/maps/<id>.json
 */
function mapsApi(): Plugin {
  return {
    name: 'voyagers-maps-api',
    configureServer(server) {
      server.middlewares.use('/__maps', (req, res) => {
        const send = (code: number, body: unknown) => {
          res.statusCode = code;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(typeof body === 'string' ? body : JSON.stringify(body));
        };
        const id = decodeURIComponent((req.url ?? '/').split('?')[0]!.replace(/^\/+|\/+$/g, ''));
        try {
          if (!id) {
            if (req.method !== 'GET') return send(405, { error: 'método não suportado' });
            const list = readdirSync(mapsDir)
              .filter((f) => f.endsWith('.json'))
              .map((f) => {
                const d = JSON.parse(readFileSync(mapsDir + f, 'utf8')) as { id: string; name: string; tier: number; w: number; h: number };
                return { id: d.id, name: d.name, tier: d.tier, w: d.w, h: d.h };
              });
            return send(200, list);
          }
          if (!/^[a-z0-9-]+$/.test(id)) return send(400, { error: 'id inválido (use letras minúsculas, números e hífen)' });
          const file = `${mapsDir}${id}.json`;
          if (req.method === 'GET') {
            if (!existsSync(file)) return send(404, { error: 'mapa não encontrado' });
            return send(200, readFileSync(file, 'utf8'));
          }
          if (req.method === 'PUT') {
            let body = '';
            req.setEncoding('utf8');
            req.on('data', (c: string) => (body += c));
            req.on('end', () => {
              try {
                const d = JSON.parse(body) as { id?: string; format?: number };
                if (d.id !== id || typeof d.format !== 'number') return send(400, { error: 'o conteúdo não é um mapa com este id' });
                writeFileSync(file, body.endsWith('\n') ? body : body + '\n', 'utf8');
                send(200, { ok: true, file: `src/maps/${id}.json` });
              } catch (e) {
                send(400, { error: String(e) });
              }
            });
            return;
          }
          send(405, { error: 'método não suportado' });
        } catch (e) {
          send(500, { error: String(e) });
        }
      });
    },
  };
}

export default defineConfig({
  base: './',
  server: { port: 5173 },
  plugins: [mapsApi()],
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: { input: { main: `${root}index.html`, editor: `${root}editor.html` } },
  },
  test: { include: ['tests/**/*.test.ts'] },
});
