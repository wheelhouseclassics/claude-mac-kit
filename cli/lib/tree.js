'use strict';
// The Claude Code mirror: ~/.claude/{skills,commands,hooks,pipeline} + ~/.claude/CLAUDE.md,
// plus the three top-level folders the kit's CLAUDE.md talks about (~/Data, ~/projects, ~/second-brain).
//
// Copy rules: kit-owned trees are mirrored (a kit file is refreshed when its bytes differ), but a file
// the user authored and the kit does not own is never touched, and registry.json / CLAUDE.md are
// seeds — written once, never overwritten.
const fs = require('fs');
const path = require('path');

const TREES = ['skills', 'commands', 'hooks', 'pipeline'];
const SEED_ONLY = ['pipeline/registry.json']; // user state lives here after first run
const SKIP_DIR = /^(__pycache__|\.git|node_modules|\.DS_Store)$/;
const TOP_DIRS = ['Data', 'projects'];

function walkRel(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR.test(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkRel(p, base, out);
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

function copyIfDifferent(src, dst, dryRun) {
  if (fs.existsSync(dst) && fs.readFileSync(dst).equals(fs.readFileSync(src))) return false;
  if (!dryRun) {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
  return true;
}

async function ensureTree(ctx) {
  const { home, kitRoot, dryRun } = ctx;
  const changed = [];
  const claudeDir = path.join(home, '.claude');
  const mkdir = (p) => { if (!fs.existsSync(p)) { if (!dryRun) fs.mkdirSync(p, { recursive: true }); changed.push(path.relative(home, p).split(path.sep).join('/')); } };

  mkdir(claudeDir);
  for (const d of TOP_DIRS) mkdir(path.join(home, d));

  for (const tree of TREES) {
    const src = path.join(kitRoot, 'kit', tree);
    if (!fs.existsSync(src)) continue;
    for (const rel of walkRel(src)) {
      const key = `${tree}/${rel}`;
      const dst = path.join(claudeDir, tree, ...rel.split('/'));
      if (SEED_ONLY.includes(key) && fs.existsSync(dst)) continue;
      if (copyIfDifferent(path.join(src, ...rel.split('/')), dst, dryRun)) changed.push(`.claude/${key}`);
    }
  }

  // hooks must be executable by the interpreter that runs them; keep the bit off Windows builds
  const hook = path.join(claudeDir, 'hooks', 'auto-md.py');
  if (!dryRun && fs.existsSync(hook) && process.platform !== 'win32') {
    const mode = fs.statSync(hook).mode & 0o777;
    if (mode !== 0o755) fs.chmodSync(hook, 0o755);
  }

  // seeds: written once, never clobbered
  const claudeMd = path.join(claudeDir, 'CLAUDE.md');
  if (!fs.existsSync(claudeMd)) {
    if (!dryRun) fs.copyFileSync(path.join(kitRoot, 'kit', 'CLAUDE.md'), claudeMd);
    changed.push('.claude/CLAUDE.md');
  }

  return { changed };
}

module.exports = { ensureTree, TREES, SEED_ONLY, TOP_DIRS };
