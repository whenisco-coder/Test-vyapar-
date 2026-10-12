import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const dist = path.resolve('dist');
async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else out.push(full);
  }
  return out;
}

const files = await walk(dist);
const wasmFiles = files.filter((file) => file.endsWith('.wasm'));
if (!wasmFiles.length) {
  throw new Error('Production build did not emit a .wasm asset; SQLite WASM cannot be precached for offline use.');
}
const serviceWorker = files.find((file) => path.basename(file) === 'sw.js');
if (!serviceWorker) throw new Error('PWA service worker was not generated.');
const workerText = await readFile(serviceWorker, 'utf8');
const missing = wasmFiles.filter((file) => !workerText.includes(path.relative(dist, file).replaceAll(path.sep, '/')));
if (missing.length) {
  throw new Error(`SQLite WASM assets are not listed in the production service-worker precache: ${missing.map((f) => path.relative(dist, f)).join(', ')}`);
}
for (const file of wasmFiles) await stat(file);
console.log(`PWA precache check passed: ${wasmFiles.length} WASM asset(s) referenced by ${path.relative(process.cwd(), serviceWorker)}.`);
