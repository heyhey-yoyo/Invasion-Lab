import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';

const base = resolve(process.cwd(), process.argv[2] || '.');
const port = Number(process.argv[3] || 4173);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

function send(res, status, headers, body = '') {
  res.writeHead(status, {
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    ...headers
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
    send(res, 405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' }, 'Method not allowed');
    return;
  }

  try {
    const url = new URL(req.url || '/', 'http://localhost');
    const decoded = decodeURIComponent(url.pathname);
    let file = resolve(base, `.${decoded === '/' ? '/index.html' : decoded}`);
    const pathFromBase = relative(base, file);
    if (pathFromBase.startsWith('..') || isAbsolute(pathFromBase)) {
      send(res, 403, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Forbidden');
      return;
    }

    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    send(res, 200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' }, req.method === 'HEAD' ? '' : body);
  } catch (error) {
    const status = error?.code === 'ENOENT' ? 404 : 400;
    send(res, status, { 'Content-Type': 'text/plain; charset=utf-8' }, status === 404 ? 'Not found' : 'Bad request');
  }
});

server.listen(port, '127.0.0.1', () => console.log(`Serving ${base} at http://127.0.0.1:${port}`));
