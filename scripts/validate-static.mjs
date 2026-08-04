import { access, readFile, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, resolve } from 'node:path';

const execFileAsync = promisify(execFile);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const presetsDir = join(root, 'presets');

async function accessDeployAsset(asset) {
  await access(join(root, asset));
}

const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const versionsSource = await readFile(join(root, 'simulation/versions.js'), 'utf8');
const appVersion = versionsSource.match(/APP_VERSION\s*=\s*['"]([^'"]+)/)?.[1];
const modelVersion = versionsSource.match(/MODEL_VERSION\s*=\s*['"]([^'"]+)/)?.[1];
const releaseManifest = JSON.parse(await readFile(join(root, 'release-manifest.json'), 'utf8'));
if (packageJson.version !== releaseManifest.version) throw new Error('package.json and release-manifest.json versions differ');
if (packageJson.version !== appVersion) throw new Error('package.json and APP_VERSION differ');
if (!modelVersion?.endsWith(packageJson.version)) throw new Error('MODEL_VERSION does not include the release version');
if (Object.keys(packageJson.dependencies || {}).length) throw new Error('Runtime dependencies are not expected for this release');

for (const entry of await readdir(presetsDir)) {
  if (!entry.endsWith('.json')) continue;
  const preset = JSON.parse(await readFile(join(presetsDir, entry), 'utf8'));
  for (const key of ['schemaVersion', 'id', 'presetId', 'name']) {
    if (preset[key] === undefined) throw new Error(`${entry} missing ${key}`);
  }
}

const testFiles = (await readdir(join(root, 'tests'))).filter(entry => entry.endsWith('.test.mjs'));
let declaredTestCount = 0;
for (const file of testFiles) declaredTestCount += [...(await readFile(join(root, 'tests', file), 'utf8')).matchAll(/\btest\s*\(/g)].length;
if (declaredTestCount !== releaseManifest.automatedTests) throw new Error(`release manifest declares ${releaseManifest.automatedTests} tests, source contains ${declaredTestCount}`);

const html = await readFile(join(root, 'index.html'), 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicates.length) throw new Error(`Duplicate HTML ids: ${[...new Set(duplicates)].join(', ')}`);

for (const reference of [...html.matchAll(/(?:src|href)="\.\/([^"?#]+)"/g)].map(match => match[1])) {
  if (reference.endsWith('/')) continue;
  await access(join(root, reference));
}

for (const target of [...html.matchAll(/aria-labelledby="([^"]+)"/g)].flatMap(match => match[1].split(/\s+/))) {
  if (!ids.includes(target)) throw new Error(`Missing aria-labelledby target: ${target}`);
}

for (const tag of html.matchAll(/<button\b([^>]*)>/g)) {
  if (!/\btype="(?:button|submit|reset)"/.test(tag[1])) throw new Error(`Button missing explicit type: ${tag[0]}`);
}

const manifest = JSON.parse(await readFile(join(root, 'manifest.webmanifest'), 'utf8'));
for (const key of ['id', 'scope', 'start_url', 'name', 'short_name']) {
  if (!manifest[key]) throw new Error(`Manifest missing ${key}`);
}
for (const icon of manifest.icons || []) await access(join(root, icon.src.replace(/^\.\//, '')));

const notFoundHtml = await readFile(join(root, '404.html'), 'utf8');
if (/Invasion Wind Tunnel [123](?:<|\s)/.test(notFoundHtml)) throw new Error('404 page contains an obsolete major version');

const serviceWorker = await readFile(join(root, 'service-worker.js'), 'utf8');
if (!serviceWorker.includes(`iwt-static-v${packageJson.version}`)) throw new Error('Service-worker cache version differs from package version');
if (/\.skipWaiting\s*\(/.test(serviceWorker)) throw new Error('Service worker must not force activation while an older page is open');
const coreBlock = serviceWorker.match(/const CORE = \[([\s\S]*?)\];/)?.[1] || '';
const offlineAssets = [...coreBlock.matchAll(/['"]\.\/([^'"]*)['"]/g)].map(match => match[1] || 'index.html');
for (const asset of offlineAssets) {
  const normalized = asset === '' ? 'index.html' : asset;
  await accessDeployAsset(normalized);
}

async function collectJavaScript(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await collectJavaScript(path));
    else if (extname(entry.name) === '.js') result.push(path);
  }
  return result;
}

const scripts = [join(root, 'app.js'), join(root, 'service-worker.js'), ...await collectJavaScript(join(root, 'simulation'))];
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
await access(join(root, '_headers'));

console.log(`Validated ${ids.length} unique ids, ${manifest.icons.length} manifest icons, ${offlineAssets.length} offline assets, ${scripts.length} JavaScript files, and ${releaseManifest.automatedTests} declared tests.`);
