'use strict';
// G1.1 — manifest validates, counts exact, sources resolve, deny/deps/DROPPED complete, no copy-denied source.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { ROOT, KIT, exists, readJson } = require('./helpers');

const manifestPath = path.join(ROOT, 'manifest.json');
const schemaPath = path.join(ROOT, 'manifest.schema.json');
const sourceHome = process.env.KIT_SOURCE_HOME || os.homedir();
const haveSource = exists(path.join(sourceHome, '.claude', 'settings.json'));

test('manifest.json and manifest.schema.json exist and manifest validates', () => {
  assert.ok(exists(manifestPath), 'manifest.json missing (run: node scripts/build-manifest.js)');
  assert.ok(exists(schemaPath), 'manifest.schema.json missing');
  const { validate } = require('../scripts/lib/schema-validate');
  const errors = validate(readJson(schemaPath), readJson(manifestPath));
  assert.deepEqual(errors, [], 'schema errors: ' + errors.join('; '));
});

test('section counts are exact', () => {
  const m = readJson(manifestPath);
  assert.equal(m.marketplaces.length, 5, 'marketplaces');
  assert.equal(m.plugins.length, 14, 'plugins');
  assert.equal(m.skills.length, 10, 'skills');
  assert.equal(m.commands.length, 1, 'commands');
  assert.equal(m.hooks.length, 1, 'hooks');
  assert.equal(m.mcp.length, 1, 'mcp');
  assert.equal(m.connectors.length, 6, 'connectors');
});

test('every plugin marketplace resolves (incl. claude-plugins-official) and kit paths exist', () => {
  const m = readJson(manifestPath);
  const names = new Set(m.marketplaces.map((x) => x.name));
  assert.ok(names.has('claude-plugins-official'), 'claude-plugins-official must be listed explicitly');
  for (const p of m.plugins) assert.ok(names.has(p.marketplace), `plugin ${p.id}: marketplace ${p.marketplace} not in manifest.marketplaces`);
  for (const s of [...m.skills, ...m.commands, ...m.hooks]) assert.ok(exists(path.join(ROOT, s.path)), `${s.name}: kit path ${s.path} missing`);
});

test('every KEEP entry resolves to an existing source path on the build machine', { skip: !haveSource && 'no source ~/.claude on this machine' }, () => {
  const m = readJson(manifestPath);
  const km = readJson(path.join(sourceHome, '.claude', 'plugins', 'known_marketplaces.json'));
  // a marketplace renamed upstream is known to this machine under its OLD name (manifest.was)
  for (const mk of m.marketplaces) assert.ok(km[mk.was || mk.name], `marketplace ${mk.was || mk.name} not in known_marketplaces.json`);
  const expand = (p) => p.replace(/^~/, sourceHome);
  for (const s of [...m.skills, ...m.commands, ...m.hooks]) {
    assert.ok(exists(expand(s.source)), `${s.name}: source ${s.source} does not exist`);
  }
});

test('deny covers agents/, mcp-servers/, vault .ps1; deps complete; DROPPED.md lists every deny entry', () => {
  const m = readJson(manifestPath);
  const denyText = JSON.stringify(m.deny);
  for (const needle of ['agents/', 'mcp-servers/', '.ps1']) assert.ok(denyText.includes(needle), `deny missing ${needle}`);
  const deps = m.deps.map((d) => d.name);
  for (const d of ['graphifyy', 'defuddle', 'markitdown[all]', 'whisper.cpp', 'ffmpeg', 'bun']) assert.ok(deps.includes(d), `deps missing ${d}`);
  const dropped = fs.readFileSync(path.join(KIT, 'DROPPED.md'), 'utf8');
  for (const d of m.deny) assert.ok(dropped.includes(d.name), `DROPPED.md missing deny entry ${d.name}`);
});

test('no copy-denied path is ever used as a source', () => {
  const m = readJson(manifestPath);
  const bad = /(^|\/)(credentials|channels|sessions|projects|file-history|backups|__pycache__)(\/|$)|\.credentials\.json|(^|\/)\.claude\.json$|history\.jsonl|\.log$|\.pyc$/;
  const sources = [];
  for (const s of [...m.skills, ...m.commands, ...m.hooks]) sources.push(s.source);
  for (const f of m.vault.files || []) if (f.source) sources.push(f.source);
  for (const src of sources) {
    const relToClaude = src.replace(/^~\/\.claude\//, '');
    assert.ok(!bad.test(relToClaude), `copy-denied source: ${src}`);
  }
  assert.ok(Array.isArray(m.copyDeny) && m.copyDeny.length >= 10, 'copyDeny list present');
});
