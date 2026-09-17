'use strict';
// SC8 — create ~/second-brain from kit/vault: declared folders (git cannot store empty ones) + seed files.
// Never overwrites a file the user already has.
const fs = require('fs');
const path = require('path');
const { expandHome } = require('./manifest');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

async function ensureVault(ctx) {
  const { manifest, home, kitRoot, dryRun } = ctx;
  const root = expandHome(manifest.vault.root, home);
  const seed = path.join(kitRoot, 'kit', 'vault');
  const changed = [];
  const mkdir = (p) => { if (!fs.existsSync(p)) { if (!dryRun) fs.mkdirSync(p, { recursive: true }); changed.push(path.relative(home, p)); } };
  mkdir(root);
  for (const f of manifest.vault.folders) mkdir(path.join(root, f));
  for (const src of walk(seed)) {
    const rel = path.relative(seed, src);
    const dst = path.join(root, rel);
    if (fs.existsSync(dst)) continue;
    if (!dryRun) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); }
    changed.push(path.relative(home, dst));
  }
  return { changed };
}

module.exports = { ensureVault };
