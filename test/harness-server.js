// Serves test/harness/ for the browser harness: bun test/harness-server.js
// API fixtures are stored as <path>.json but requested without the extension, like X's GraphQL URLs, and are served
// as JSON. ?variant=<name> serves <path>.<name>.json instead. Nothing is cached, so edits show up on reload.
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dir, 'harness');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };

Bun.serve({
  port: 8765,
  fetch(req) {
    const url = new URL(req.url);
    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const variant = url.searchParams.get('variant');
    const candidates = variant ? [rel.replace(/(\.json)?$/, `.${variant}.json`)] : [rel, `${rel}.json`];
    for (const c of candidates) {
      const file = path.join(root, c);
      if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
      const type = rel.startsWith('/i/api/') ? 'application/json' : TYPES[path.extname(file)] || 'application/octet-stream';
      return new Response(Bun.file(file), { headers: { 'content-type': type, 'cache-control': 'no-store' } });
    }
    return new Response('not found', { status: 404 });
  },
});
console.log('harness: http://localhost:8765/');
