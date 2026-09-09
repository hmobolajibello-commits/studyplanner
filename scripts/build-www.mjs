/*
 * "Builds" the app into www/ — which for this project means copying the finished
 * static files into one folder, because there is nothing to compile.
 *
 * Capacitor needs a directory holding index.html and its assets and nothing else
 * (pointing it at the repo root would drag node_modules and android/ into the
 * APK). Vercel still serves the repo root, so the web deploy is unaffected.
 *
 * Node built-ins only: no dependencies, runs anywhere Node runs.
 */
import { cp, mkdir, rm, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');

const FILES = ['index.html', 'manifest.webmanifest', 'sw.js'];
const DIRS = ['icons'];

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const file of FILES) await cp(join(root, file), join(out, file));
for (const dir of DIRS) await cp(join(root, dir), join(out, dir), { recursive: true });

const listed = await readdir(out);
console.log(`built www/ (${listed.join(', ')})`);
