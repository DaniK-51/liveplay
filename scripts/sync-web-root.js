#!/usr/bin/env node
// Copy the built Nuxt client into the server's web root so `liveplay-server`
// can host it at /web (same layout the installers use: <exe-dir>/web).
const fs   = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const SRC  = path.join(REPO_ROOT, 'client', '.output', 'public');
const DEST = path.join(REPO_ROOT, 'server', 'build', 'web');

if (!fs.existsSync(path.join(SRC, 'index.html'))) {
  console.error(`[sync-web-root] missing ${path.relative(REPO_ROOT, SRC)}/index.html — run the client build first`);
  process.exit(1);
}

fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });
fs.cpSync(SRC, DEST, { recursive: true });
console.log(`[sync-web-root] ${path.relative(REPO_ROOT, SRC)} -> ${path.relative(REPO_ROOT, DEST)}`);
