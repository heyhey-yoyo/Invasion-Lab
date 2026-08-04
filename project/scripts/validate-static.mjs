import { access, readFile, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, resolve } from 'node:path';

const execFileAsync = promisify(execFile);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, 'src');
const publicDir = join(root, 'public');
const presetsDir = join(root, 'presets');

async function accessDeployAsset(asset) {
  const candidates = [join(src, asset), join(publicDir, asset), asset.startsWith('presets/') ? join(presetsDir, asset.slice('presets/'.length)) : null].filter(Boolean);
  for (const candidate of candidates) {
    try { await access(candidate); return; } catch {}
  }
  throw new Error(`Missing deploy asset: ${asset}`);
}

const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const releaseManifest = JSON.parse(await readFile(join(root, 'release-manifest.json'), 'utf8'));
if (packageJson.version !== releaseManifest.version) throw new Error('package.json and release-manifest.json versions differ');
if (Object.keys(packageJson.dependencies || {}).length) throw new Error('Runtime dependencies are not expected for this release');

for (const entry of await readdir(presetsDir)) {
  if (!entry.endsWith('.json')) continue;
  const preset = JSON.parse(await readFile(join(presetsDir, entry), 'utf8'));
  for (const key of ['schemaVersion', 'id', 'presetId', 'name']) {
    if (preset[key] === undefined) throw new Error(`${entry} missing ${key}`);
  }
}

const html = await readFile(join(src, 'index.html'), 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicates.length) throw new Error(`Duplicate HTML ids: ${[...new Set(duplicates)].join(', ')}`);

for (const reference of [...html.matchAll(/(?:src|href)="\.\/([^"?#]+)"/g)].map(match => match[1])) {
  if (reference.endsWith('/')) continue;
  await access(join(src, reference));
}

for (const target of [...html.matchAll(/aria-labelledby="([^"]+)"/g)].flatMap(match => match[1].split(/\s+/))) {
  if (!ids.includes(target)) throw new Error(`Missing aria-labelledby target: ${target}`);
}

for (const tag of html.matchAll(/<button\b([^>]*)>/g)) {
  if (!/\btype="(?:button|submit|reset)"/.test(tag[1])) throw new Error(`Button missing explicit type: ${tag[0]}`);
}

const manifest = JSON.parse(await readFile(join(src, 'manifest.webmanifest'), 'utf8'));
for (const key of ['id', 'scope', 'start_url', 'name', 'short_name']) {
  if (!manifest[key]) throw new Error(`Manifest missing ${key}`);
}
for (const icon of manifest.icons || []) await access(join(src, icon.src.replace(/^\.\//, '')));

const serviceWorker = await readFile(join(src, 'service-worker.js'), 'utf8');
const coreBlock = serviceWorker.match(/const CORE = \[([\s\S]*?)\];/)?.[1] || '';
const offlineAssets = [...coreBlock.matchAll(/['"]\.\/([^'"]*)['"]/g)].map(match => match[1] || 'index.html');
for (const asset of offlineAssets) {
  const normalized = asset === '' ? 'index.html' : asset;
  await accessDeployAsset(normalized);
}

async function collectJavaScript(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await collectJavaScript(path));
    else if (extname(entry.name) === '.js') result.push(path);
  }
  return result;
}

const scripts = await collectJavaScript(src);
for (const script of scripts) {
  await execFileAsync(process.execPath, ['--check', script]);
  const source = await readFile(script, 'utf8');
  const imports = [
    ...source.matchAll(/(?:from\s+|import\s*)['"](\.[^'"]+)['"]/g),
    ...source.matchAll(/import\(['"](\.[^'"]+)['"]\)/g)
  ].map(match => match[1]);
  for (const specifier of imports) {
    const candidate = resolve(dirname(script), specifier);
    await access(candidate);
  }
}
await access(join(root, 'public', '_headers'));

console.log(`Validated ${ids.length} unique ids, ${manifest.icons.length} manifest icons, ${offlineAssets.length} offline assets, ${scripts.length} JavaScript files, and ${releaseManifest.automatedTests} declared tests.`);
