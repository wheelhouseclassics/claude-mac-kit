'use strict';
const fs = require('fs');
const path = require('path');

function loadManifest(kitRoot) {
  const p = path.join(kitRoot, 'manifest.json');
  if (!fs.existsSync(p)) throw new Error('manifest.json not found next to cli/ (run scripts/build-manifest.js on the build machine)');
  const m = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (m.version !== 1) throw new Error('unsupported manifest version ' + m.version);
  return m;
}

// "~/x" → "<home>/x"; absolute paths pass through
function expandHome(p, home) {
  if (p === '~') return home;
  if (p.startsWith('~/')) return path.join(home, p.slice(2));
  return p;
}

module.exports = { loadManifest, expandHome };
