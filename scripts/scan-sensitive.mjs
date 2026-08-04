import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, relative } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const excludedDirectories = new Set(['.git', 'dist', 'node_modules']);
const excludedFiles = new Set(['scripts/scan-sensitive.mjs']);
const forbiddenNames = [/^\.env(?:\.|$)/, /\.pem$/i, /\.key$/i, /\.p12$/i, /\.pfx$/i, /\.log$/i];
const patterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Cloudflare API token assignment', /\b(?:CLOUDFLARE_API_TOKEN|CF_API_TOKEN)\s*=\s*[^\s#]{12,}/i]
];
const textExtensions = new Set(['.js', '.mjs', '.json', '.html', '.css', '.md', '.yml', '.yaml', '.toml', '.txt', '']);
const findings = [];
let scannedFiles = 0;

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (excludedDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    const rel = relative(root, path).replaceAll('\\', '/');
    if (entry.isDirectory()) {
      await walk(path);
      continue;
    }
    if (excludedFiles.has(rel)) continue;
    const info = await stat(path);
    if (info.size > 10 * 1024 * 1024) findings.push(`${rel}: unexpected file larger than 10 MiB`);
    if (forbiddenNames.some(pattern => pattern.test(entry.name)) && entry.name !== '.env.example') {
      findings.push(`${rel}: sensitive or local-only filename`);
    }
    if (!textExtensions.has(extname(entry.name))) continue;
    scannedFiles += 1;
    const text = await readFile(path, 'utf8');
    for (const [label, pattern] of patterns) {
      if (pattern.test(text)) findings.push(`${rel}: possible ${label}`);
    }
  }
}

await walk(root);
if (findings.length) {
  throw new Error(`Sensitive-file scan failed:\n- ${findings.join('\n- ')}`);
}
console.log(`Sensitive-file scan passed for ${scannedFiles} text files; no credential patterns or local secret files found.`);
