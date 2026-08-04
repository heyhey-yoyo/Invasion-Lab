import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(join(root, 'src'), dist, { recursive: true });
await cp(join(root, 'public'), dist, { recursive: true });
await cp(join(root, 'presets'), join(dist, 'presets'), { recursive: true });
await writeFile(join(dist, '.nojekyll'), '');
console.log(`Built static site at ${dist}`);
