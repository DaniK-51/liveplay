#!/usr/bin/env node
// Prepare the browser UI bundle for hosting at /web.
//
//  1. Stage locales from the single source (client/locales) into the Nuxt
//     output so the browser host can fetch ./locales/*.json. Not committed —
//     generated here on every client build.
//  2. Copy the built client into the server's web root so `liveplay-server`
//     can host it at /web (same layout the installers use: resources/web
//     next to server-bin).
const fs   = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const LOCALES_SRC = path.join(REPO_ROOT, 'client', 'locales');
const OUT       = path.join(REPO_ROOT, 'client', '.output', 'public');
const LOCALES_OUT = path.join(OUT, 'locales');
const DEST      = path.join(REPO_ROOT, 'server', 'build', 'web');

if (!fs.existsSync(path.join(OUT, 'index.html'))) {
  console.error(`[sync-web-root] missing ${path.relative(REPO_ROOT, OUT)}/index.html — run the client build first`);
  process.exit(1);
}

// 1. Locales: client/locales is the only copy in git.
if (!fs.existsSync(path.join(LOCALES_SRC, 'en.json'))) {
  console.error(`[sync-web-root] missing ${path.relative(REPO_ROOT, LOCALES_SRC)}/en.json`);
  process.exit(1);
}
fs.rmSync(LOCALES_OUT, { recursive: true, force: true });
fs.mkdirSync(LOCALES_OUT, { recursive: true });
const codes = [];
for (const name of fs.readdirSync(LOCALES_SRC)) {
  if (!name.endsWith('.json') || name === 'index.json') continue;
  fs.copyFileSync(path.join(LOCALES_SRC, name), path.join(LOCALES_OUT, name));
  codes.push(name.replace(/\.json$/, ''));
}
codes.sort();
// index.json is generated — the browser stub must not hardcode the language list.
fs.writeFileSync(
  path.join(LOCALES_OUT, 'index.json'),
  JSON.stringify(codes, null, 2) + '\n',
  'utf8',
);
console.log(`[sync-web-root] ${path.relative(REPO_ROOT, LOCALES_SRC)} -> ${path.relative(REPO_ROOT, LOCALES_OUT)} (${codes.length} locales)`);

// 2. Full web root for the C++ server / installer layout.
fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });
fs.cpSync(OUT, DEST, { recursive: true });
console.log(`[sync-web-root] ${path.relative(REPO_ROOT, OUT)} -> ${path.relative(REPO_ROOT, DEST)}`);
