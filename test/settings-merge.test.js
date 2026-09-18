'use strict';
// G3.1 — settings.json merge: allowlist only, denylist never, boss edits survive, apply is idempotent.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT, tmpdir, readJson } = require('./helpers');
const { loadManifest } = require('../cli/lib/manifest');
const settings = require('../cli/lib/settings');
const deps = require('../cli/lib/deps');

const MANIFEST = loadManifest(ROOT);
const ALLOWED_TOP = ['enabledPlugins', 'extraKnownMarketplaces', 'hooks', 'permissions'];

function ctxFor(home) {
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  return { home, kitRoot: ROOT, manifest: MANIFEST, log: () => {}, dryRun: false };
}
function settingsPath(home) { return path.join(home, '.claude', 'settings.json'); }
function applyBoth(ctx) {
  const a = settings.applyPre(ctx);
  const b = settings.applyPost(ctx);
  return [...a.changed, ...b.changed];
}

test('fresh HOME: writes exactly the allowlist and none of the denylist', () => {
  const home = tmpdir('kit-settings-fresh-');
  const ctx = ctxFor(home);
  applyBoth(ctx);

  const s = readJson(settingsPath(home));
  assert.deepEqual(Object.keys(s).sort(), ALLOWED_TOP, 'top-level keys must be exactly the allowlist');
  for (const k of MANIFEST.settingsDeny) assert.ok(!(k in s), `denylist key written: ${k}`);
  assert.deepEqual(Object.keys(s.permissions), ['defaultMode'], 'permissions must carry only defaultMode on a fresh HOME');

  // every manifest marketplace + plugin lands
  for (const m of MANIFEST.marketplaces) assert.deepEqual(s.extraKnownMarketplaces[m.name], m.source, `marketplace ${m.name}`);
  for (const p of MANIFEST.plugins) assert.equal(s.enabledPlugins[p.id], true, `plugin ${p.id} not enabled`);
  assert.equal(Object.keys(s.enabledPlugins).length, MANIFEST.plugins.length);
});

test('auto-md hook: literal $HOME path, pinned venv interpreter, no absolute or ~ paths', () => {
  const home = tmpdir('kit-settings-hook-');
  const ctx = ctxFor(home);
  applyBoth(ctx);

  const s = readJson(settingsPath(home));
  const entries = s.hooks.UserPromptSubmit;
  assert.equal(entries.length, 1, 'exactly one UserPromptSubmit matcher group');
  const hooks = entries[0].hooks;
  assert.equal(hooks.length, 1, 'exactly one auto-md hook');
  const h = hooks[0];
  assert.equal(h.type, 'command');
  assert.equal(h.command, '$HOME/.claude-kit/venv/bin/python $HOME/.claude/hooks/auto-md.py');
  assert.equal(h.timeout, MANIFEST.hooks[0].timeout);
  assert.equal(h.statusMessage, MANIFEST.hooks[0].statusMessage);
  assert.ok(!h.command.includes('~'), 'command must not use ~');
  assert.ok(!h.command.includes(home), 'command must not bake in an absolute HOME');
  // the venv the command points at is built from the pinned Homebrew python
  assert.equal(deps.PYTHON_BIN, '/opt/homebrew/bin/python3.12');
  assert.ok(h.command.startsWith('$HOME/' + deps.VENV_REL + '/bin/python '), 'hook interpreter must be the kit venv python');
});

test('pre-existing settings: unrelated keys and boss edits inside kit-managed objects survive', () => {
  const home = tmpdir('kit-settings-merge-');
  const ctx = ctxFor(home);
  const before = {
    statusLine: { type: 'command', command: 'my-statusline' },
    extraKnownMarketplaces: { 'boss-private': { source: { source: 'github', repo: 'boss/private' } } },
    enabledPlugins: { 'github@claude-plugins-official': false },
    permissions: { allow: ['Bash(ls:*)'], defaultMode: 'plan' },
    hooks: { Stop: [{ hooks: [{ type: 'command', command: 'say done' }] }] },
  };
  fs.writeFileSync(settingsPath(home), JSON.stringify(before, null, 2));
  applyBoth(ctx);

  const s = readJson(settingsPath(home));
  assert.deepEqual(s.statusLine, before.statusLine, 'unrelated key must be untouched');
  assert.deepEqual(s.extraKnownMarketplaces['boss-private'], before.extraKnownMarketplaces['boss-private'], 'boss marketplace must survive');
  assert.equal(Object.keys(s.extraKnownMarketplaces).length, MANIFEST.marketplaces.length + 1);
  assert.equal(s.enabledPlugins['github@claude-plugins-official'], false, 'a boss-disabled plugin must stay disabled');
  assert.equal(s.permissions.defaultMode, 'plan', 'a boss-set defaultMode must survive');
  assert.deepEqual(s.permissions.allow, ['Bash(ls:*)'], 'permissions.allow must be untouched');
  assert.deepEqual(s.hooks.Stop, before.hooks.Stop, 'an unrelated hook event must survive');
  assert.equal(s.hooks.UserPromptSubmit.length, 1, 'auto-md hook added alongside');
});

test('second apply is a no-op over kit-managed and unrelated keys', () => {
  const home = tmpdir('kit-settings-idem-');
  const ctx = ctxFor(home);
  fs.writeFileSync(settingsPath(home), JSON.stringify({ statusLine: { type: 'command', command: 'mine' } }, null, 2));
  applyBoth(ctx);
  const first = fs.readFileSync(settingsPath(home), 'utf8');

  const changed = applyBoth(ctx);
  assert.deepEqual(changed, [], 'second apply must report no changes');
  assert.equal(fs.readFileSync(settingsPath(home), 'utf8'), first, 'second apply must not rewrite the file');
});

test('a stale auto-md hook command is re-pinned, not duplicated', () => {
  const home = tmpdir('kit-settings-stale-');
  const ctx = ctxFor(home);
  fs.writeFileSync(settingsPath(home), JSON.stringify({
    hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'python "C:/Users/OpenClaw/.claude/hooks/auto-md.py"', timeout: 60 }] }] },
  }, null, 2));
  applyBoth(ctx);

  const s = readJson(settingsPath(home));
  const all = s.hooks.UserPromptSubmit.flatMap((g) => g.hooks);
  assert.equal(all.length, 1, 'no duplicate auto-md hook');
  assert.equal(all[0].command, '$HOME/.claude-kit/venv/bin/python $HOME/.claude/hooks/auto-md.py');
});
