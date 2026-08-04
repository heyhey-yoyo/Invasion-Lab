import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const port = 4197;
const child = spawn(process.execPath, ['scripts/serve.mjs', 'dist', String(port)], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe']
});

let stderr = '';
child.stderr.on('data', chunk => { stderr += chunk; });

const ready = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Preview server timeout. ${stderr}`)), 5000);
  child.stdout.on('data', chunk => {
    if (String(chunk).includes(`127.0.0.1:${port}`)) {
      clearTimeout(timer);
      resolve();
    }
  });
  child.on('exit', code => reject(new Error(`Preview server exited with ${code}. ${stderr}`)));
});

try {
  await ready;
  const cases = [
    ['/', 200, 'text/html'],
    ['/app.js', 200, 'text/javascript'],
    ['/simulation/worker.js', 200, 'text/javascript'],
    ['/simulation/scenarios/catalog.js', 200, 'text/javascript'],
    ['/manifest.webmanifest', 200, 'application/manifest+json'],
    ['/service-worker.js', 200, 'text/javascript'],
    ['/404.html', 200, 'text/html'],
    ['/missing-script.js', 404, 'text/plain']
  ];

  for (const [path, expectedStatus, expectedType] of cases) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    if (response.status !== expectedStatus) throw new Error(`${path}: expected ${expectedStatus}, received ${response.status}`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes(expectedType)) throw new Error(`${path}: expected ${expectedType}, received ${contentType}`);
    if (expectedStatus === 200 && (await response.arrayBuffer()).byteLength === 0) throw new Error(`${path}: empty response`);
  }
  console.log(`HTTP smoke checks passed for ${cases.length} routes.`);
} finally {
  child.kill('SIGTERM');
}
