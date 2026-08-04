import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist');

// Site files live at the repository root (works for Cloudflare Pages direct-upload /
// root-directory publishing). Build produces a dist/ snapshot for platforms that
// expect a build output directory.
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const entry of ['index.html', 'app.js', 'styles.css', 'manifest.webmanifest', 'service-worker.js', '404.html', 'robots.txt', '_headers', 'assets', 'simulation', 'presets']) {
  await cp(join(root, entry), join(dist, entry), { recursive: true });
}
await writeFile(join(dist, '.nojekyll'), '');
console.log(`Built static site snapshot at ${dist}`);
