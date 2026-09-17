'use strict';
// G1.2 — from `git archive HEAD`, claude-kit install's vault/mkdir pass yields the SC8 skeleton exactly.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT, run, walk, tmpdir, exists } = require('./helpers');

test('vault skeleton from git archive HEAD', () => {
  const tmp = tmpdir('kit-vault-');
  const tar = path.join(tmp, 'src.tar');
  let r = run('git', ['archive', '--format=tar', '-o', tar, 'HEAD'], { cwd: ROOT });
  assert.equal(r.status, 0, 'git archive failed: ' + r.stderr);
  const src = path.join(tmp, 'src');
  fs.mkdirSync(src);
  // relative paths: Windows bsdtar reads "C:\..." as a remote host
  r = run('tar', ['-xf', 'src.tar', '-C', 'src'], { cwd: tmp });
  assert.equal(r.status, 0, 'tar extract failed: ' + r.stderr);
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home);
  r = run(process.execPath, [path.join(src, 'cli', 'claude-kit.js'), 'install', '--only', 'vault', '--home', home]);
  assert.equal(r.status, 0, 'claude-kit install --only vault failed: ' + r.stderr + r.stdout);

  const vault = path.join(home, 'second-brain');
  const folders = ['raw-sources/Thoughts', 'raw-sources/Decisions', 'raw-sources/Handoffs', 'raw-sources/Sessions', 'raw-sources/Projects', 'wiki', 'scripts', '.obsidian'];
  for (const f of folders) assert.ok(fs.statSync(path.join(vault, f)).isDirectory(), `missing folder ${f}`);
  for (const f of ['CLAUDE.md', 'thought.md', 'decision.md', 'handoff.md', 'wiki/log.md']) assert.ok(exists(path.join(vault, f)), `missing file ${f}`);

  const mds = walk(path.join(vault, 'raw-sources')).filter((p) => p.endsWith('.md'));
  assert.deepEqual(mds, [], 'raw-sources must contain no .md files');
  const wiki = walk(path.join(vault, 'wiki')).map((p) => path.relative(vault, p).split(path.sep).join('/'));
  assert.deepEqual(wiki, ['wiki/log.md'], 'wiki must contain only log.md');
  assert.deepEqual(fs.readdirSync(path.join(vault, 'scripts')), [], 'scripts/ must be empty');
  const obs = fs.readdirSync(path.join(vault, '.obsidian')).sort();
  assert.ok(!obs.includes('workspace.json') && !obs.includes('graph.json'), '.obsidian must not ship workspace.json/graph.json');
  for (const f of ['app.json', 'appearance.json', 'core-plugins.json']) assert.ok(obs.includes(f), `.obsidian missing ${f}`);

  // idempotent: second pass makes no change
  const before = walk(vault).sort().join('\n');
  r = run(process.execPath, [path.join(src, 'cli', 'claude-kit.js'), 'install', '--only', 'vault', '--home', home]);
  assert.equal(r.status, 0);
  assert.equal(walk(vault).sort().join('\n'), before, 'second run must not change the tree');
});
