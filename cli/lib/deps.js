'use strict';
// Kit runtime dependencies: the python venv (markitdown[all], graphifyy), the npm global (defuddle), bun.
// Homebrew python is PINNED so the venv interpreter never drifts with the user's PATH.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PYTHON_BIN = '/opt/homebrew/bin/python3.12'; // brew python@3.12 on Apple silicon
const VENV_REL = '.claude-kit/venv';               // under $HOME

function venvDir(home) { return path.join(home, ...VENV_REL.split('/')); }
function venvPython(home) { return path.join(venvDir(home), 'bin', 'python'); }

function sh(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...opts });
}
function have(bin) { return sh('command', ['-v', bin], { shell: '/bin/bash' }).status === 0; }

// pip freeze once, then only install what is missing (check-then-act)
function pipInstalled(py) {
  const r = sh(py, ['-m', 'pip', 'list', '--format=freeze']);
  if (r.status !== 0) return new Set();
  return new Set(r.stdout.split(/\r?\n/).map((l) => l.split('==')[0].trim().toLowerCase()).filter(Boolean));
}
// "markitdown[all]" → distribution name "markitdown"
function distName(pkg) { return pkg.replace(/\[.*\]$/, '').toLowerCase(); }

async function ensureDeps(ctx) {
  const { home, manifest, dryRun, log } = ctx;
  const changed = [];
  const pipPkgs = manifest.deps.filter((d) => d.kind === 'pip' && !d.extra).map((d) => d.package);
  const npmPkgs = manifest.deps.filter((d) => d.kind === 'npm' && !d.extra).map((d) => d.package);

  // 1. venv from the pinned interpreter
  const vpy = venvPython(home);
  if (!fs.existsSync(vpy)) {
    const py = fs.existsSync(PYTHON_BIN) ? PYTHON_BIN : 'python3.12';
    if (!dryRun) {
      fs.mkdirSync(path.dirname(venvDir(home)), { recursive: true });
      const r = sh(py, ['-m', 'venv', venvDir(home)]);
      if (r.status !== 0) throw new Error(`venv create failed (${py}): ${(r.stderr || '').trim()}`);
    }
    changed.push(VENV_REL);
  }

  // 2. pip packages into the venv
  if (!dryRun && fs.existsSync(vpy)) {
    const have_ = pipInstalled(vpy);
    const missing = pipPkgs.filter((p) => !have_.has(distName(p)));
    if (missing.length) {
      const r = sh(vpy, ['-m', 'pip', 'install', '--quiet', ...missing]);
      if (r.status !== 0) throw new Error(`pip install ${missing.join(' ')} failed: ${(r.stderr || '').trim().split('\n').slice(-3).join(' ')}`);
      changed.push(...missing.map((p) => `pip:${p}`));
    }
  }

  // 3. npm globals
  for (const pkg of npmPkgs) {
    if (dryRun) continue;
    if (have(pkg)) continue;
    const r = sh('npm', ['i', '-g', pkg], { shell: '/bin/bash' });
    if (r.status !== 0) throw new Error(`npm i -g ${pkg} failed: ${(r.stderr || '').trim().split('\n').slice(-3).join(' ')}`);
    changed.push(`npm:${pkg}`);
  }

  // 4. bun comes from the Brewfile (install.sh); this step only reports it missing
  if (!dryRun && !have('bun')) log('  ! bun not on PATH — `brew install oven-sh/bun/bun` (install.sh Brewfile) has not run');

  return { changed };
}

module.exports = { ensureDeps, PYTHON_BIN, VENV_REL, venvDir, venvPython };
