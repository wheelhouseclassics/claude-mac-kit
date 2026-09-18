'use strict';
// G3.2 — marketplace/plugin planner against a stubbed `claude` that records argv.
const test = require('node:test');
const assert = require('node:assert/strict');
const { ROOT } = require('./helpers');
const { loadManifest } = require('../cli/lib/manifest');
const plugins = require('../cli/lib/plugins');
const install = require('../cli/lib/install');

const MANIFEST = loadManifest(ROOT);
const OFFICIAL = 'anthropics/claude-plugins-official';

// A stub `claude`: records every argv, answers the two list commands from `state`, and fails
// any install whose id is in `state.failInstalls`.
function stub(state = {}) {
  const calls = [];
  const exec = (args) => {
    calls.push(args);
    const j = (o) => ({ status: 0, stdout: JSON.stringify(o), stderr: '' });
    if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') return j(state.marketplaces ?? []);
    if (args[0] === 'plugin' && args[1] === 'list') return j(state.plugins ?? []);
    if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'add') return { status: 0, stdout: 'added', stderr: '' };
    if (args[0] === 'plugin' && args[1] === 'install') {
      const id = args[2];
      if ((state.failInstalls || []).includes(id)) return { status: 1, stdout: '', stderr: `error: could not resolve ${id}` };
      return j({ installed: id });
    }
    return { status: 0, stdout: '', stderr: '' };
  };
  return { exec, calls };
}
function ctxFor(s) {
  return { home: '/tmp/none', kitRoot: ROOT, manifest: MANIFEST, log: () => {}, dryRun: false, exec: s.exec };
}
const argvOf = (calls, verb) => calls.filter((a) => a.join(' ').includes(verb));

test('empty machine: official marketplace added, one add per manifest marketplace, 14 installs', async () => {
  const s = stub();
  await plugins.ensurePlugins(ctxFor(s));

  const adds = argvOf(s.calls, 'marketplace add');
  assert.equal(adds.length, MANIFEST.marketplaces.length, 'one add per manifest marketplace');
  assert.ok(adds.some((a) => a[3] === OFFICIAL), `official marketplace add missing: ${JSON.stringify(adds)}`);
  for (const m of MANIFEST.marketplaces) assert.ok(adds.some((a) => a[3] === m.source.repo), `no add for ${m.name}`);

  const installs = s.calls.filter((a) => a[1] === 'install');
  assert.equal(installs.length, MANIFEST.plugins.length, 'one install per manifest plugin');
  for (const a of installs) {
    assert.equal(a[0], 'plugin');
    assert.ok(a[2].includes('@'), 'install target must be <name>@<marketplace>');
    for (const f of ['--scope', 'user', '--yes', '--json']) assert.ok(a.includes(f), `install missing ${f}: ${a.join(' ')}`);
  }
  const ids = installs.map((a) => a[2]).sort();
  assert.deepEqual(ids, MANIFEST.plugins.map((p) => p.id).sort());
});

test('fully provisioned machine: zero add and zero install calls', async () => {
  const s = stub({
    marketplaces: MANIFEST.marketplaces.map((m) => ({ name: m.name, source: m.source })),
    plugins: [
      ...MANIFEST.plugins.map((p) => ({ id: p.id, scope: 'user', enabled: true })),
      // noise that must not change the verdict: a disabled plugin and a skills-dir pseudo-entry
      { id: 'someone-else@thedotmack', scope: 'user', enabled: false },
      { id: 'local-thing@skills-dir', scope: 'local' },
    ],
  });
  await plugins.ensurePlugins(ctxFor(s));
  assert.deepEqual(argvOf(s.calls, 'marketplace add'), [], 'no marketplace add expected');
  assert.deepEqual(s.calls.filter((a) => a[1] === 'install'), [], 'no install expected');
  assert.equal(s.calls.length, 2, 'only the two guard list calls');
});

test('object-map list shapes parse the same as array shapes', async () => {
  const mk = {};
  for (const m of MANIFEST.marketplaces) mk[m.name] = { source: m.source };
  const pl = {};
  for (const p of MANIFEST.plugins) pl[p.id] = { enabled: true, scope: 'user' };
  const s = stub({ marketplaces: mk, plugins: pl });
  await plugins.ensurePlugins(ctxFor(s));
  assert.equal(s.calls.length, 2, 'object-map output must satisfy both guards');
});

test('partial state: only the missing marketplace and the missing plugins are touched', async () => {
  const keepMk = MANIFEST.marketplaces.filter((m) => m.name !== 'claude-video');
  const keepPl = MANIFEST.plugins.slice(0, 12);
  const s = stub({
    marketplaces: keepMk.map((m) => ({ name: m.name })),
    plugins: keepPl.map((p) => ({ id: p.id, scope: 'user' })),
  });
  await plugins.ensurePlugins(ctxFor(s));
  const adds = argvOf(s.calls, 'marketplace add');
  assert.deepEqual(adds.map((a) => a[3]), ['bradautomates/claude-video']);
  const installs = s.calls.filter((a) => a[1] === 'install').map((a) => a[2]).sort();
  assert.deepEqual(installs, MANIFEST.plugins.slice(12).map((p) => p.id).sort());
});

test('a failed install fails the step, naming the plugin', async () => {
  const bad = MANIFEST.plugins[3].id;
  const s = stub({ failInstalls: [bad] });
  await assert.rejects(() => plugins.ensurePlugins(ctxFor(s)), (e) => e.message.includes(bad));

  // and the install runner turns that into a non-zero exit
  const s2 = stub({ failInstalls: [bad] });
  const r = await install.run({ ...ctxFor(s2), log: () => {} }, ['plugins']);
  assert.equal(r.failed, true, 'install.run must report failure');
});
