'use strict';
// Local proxy for the G3.5 "second run prints 0 changes" assertion (the real gate runs on the Mac).
// macOS-only steps (deps, which needs /opt/homebrew python3.12) are excluded by name, not faked.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT, tmpdir } = require('./helpers');
const { loadManifest } = require('../cli/lib/manifest');
const install = require('../cli/lib/install');

const MANIFEST = loadManifest(ROOT);
const STEPS = ['tree', 'vault', 'settings-pre', 'plugins', 'settings-post', 'launch', 'obsidian'];

// A `claude` that remembers what it installed, the way a real machine does.
function statefulStub() {
  const marketplaces = new Set();
  const installed = new Set();
  return (args) => {
    const j = (o) => ({ status: 0, stdout: JSON.stringify(o), stderr: '' });
    if (args[1] === 'marketplace' && args[2] === 'list') return j([...marketplaces].map((name) => ({ name })));
    if (args[0] === 'plugin' && args[1] === 'list') return j([...installed].map((id) => ({ id, scope: 'user' })));
    if (args[1] === 'marketplace' && args[2] === 'add') { marketplaces.add(MANIFEST.marketplaces.find((m) => m.source.repo === args[3]).name); return { status: 0, stdout: '', stderr: '' }; }
    if (args[1] === 'install') { installed.add(args[2]); return j({ installed: args[2] }); }
    return { status: 0, stdout: '', stderr: '' }; // `claude -p ok`
  };
}

test('a second claude-kit install is a no-op (0 changes)', async () => {
  const home = tmpdir('kit-install-idem-');
  const lines = [];
  const ctx = { home, kitRoot: ROOT, manifest: MANIFEST, log: (m) => lines.push(m), dryRun: false, exec: statefulStub() };

  const first = await install.run(ctx, STEPS);
  assert.equal(first.failed, false, lines.join('\n'));
  assert.ok(first.changes > 20, `first run should do real work, did ${first.changes}`);

  // the mirror actually landed
  assert.ok(fs.existsSync(path.join(home, '.claude', 'CLAUDE.md')));
  assert.ok(fs.existsSync(path.join(home, '.claude', 'pipeline', 'registry.json')));
  assert.equal(fs.readdirSync(path.join(home, '.claude', 'skills')).sort().join(','), MANIFEST.skills.map((s) => s.name).sort().join(','));
  assert.ok(fs.existsSync(path.join(home, 'Data')) && fs.existsSync(path.join(home, 'projects')));

  const second = await install.run(ctx, STEPS);
  assert.equal(second.failed, false);
  assert.equal(second.changes, 0, 'second run changed: ' + lines.filter((l) => l.includes('changed')).join(' | '));
});

test('a user file inside a kit tree is left alone; a kit file is refreshed', async () => {
  const home = tmpdir('kit-install-user-');
  const ctx = { home, kitRoot: ROOT, manifest: MANIFEST, log: () => {}, dryRun: false, exec: statefulStub() };
  await install.run(ctx, ['tree']);

  const mine = path.join(home, '.claude', 'skills', 'my-own-skill', 'SKILL.md');
  fs.mkdirSync(path.dirname(mine), { recursive: true });
  fs.writeFileSync(mine, '# mine\n');
  const kitFile = path.join(home, '.claude', 'commands', 'project.md');
  fs.writeFileSync(kitFile, 'clobbered\n');
  // registry.json is a seed: user state must survive
  const reg = path.join(home, '.claude', 'pipeline', 'registry.json');
  const state = JSON.parse(fs.readFileSync(reg, 'utf8'));
  state.projects.mine = { path: '/Users/boss/projects/mine' };
  fs.writeFileSync(reg, JSON.stringify(state, null, 2));

  await install.run(ctx, ['tree']);
  assert.equal(fs.readFileSync(mine, 'utf8'), '# mine\n', 'a user-authored skill must not be deleted or rewritten');
  assert.notEqual(fs.readFileSync(kitFile, 'utf8'), 'clobbered\n', 'a kit-owned file must be restored');
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(reg, 'utf8')).projects), ['mine'], 'registry.json is seed-only');
});
