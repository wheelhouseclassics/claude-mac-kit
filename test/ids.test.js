'use strict';
// G4.2 — frozen setup step ids (S01–S15) and doctor row ids (18); step state round-trips;
// a completed step reports `skip`; `--step <id>` reruns exactly one.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT, run, tmpdir } = require('./helpers');
const setup = require('../cli/lib/setup');

const CLI = path.join(ROOT, 'cli', 'claude-kit.js');
const FROZEN_STEPS = [
  'S01 claude_login', 'S02 github_login', 'S03 telegram', 'S04 marketcheck_key', 'S05 airtable',
  'S06 composio_login', 'S07 composio_connections', 'S08 tailscale_login', 'S09 messages_automation',
  'S10 messages_full_disk_access', 'S11 tailscale_admin', 'S12 phone_tailscale', 'S13 desktop_block',
  'S14 desktop_filesystem_approval', 'S15 obsidian_vault',
];
const FROZEN_ROWS = [
  'claude_login_max', 'desktop_installed', 'plugins_match_manifest', 'skills_match_manifest',
  'hooks_registered', 'bun_present', 'git_identity', 'telegram_getme', 'marketcheck_vin_decode',
  'marketcheck_connector', 'composio_mcp', 'airtable_pat', 'airtable_mcp', 'tailscale_online',
  'vault_folders', 'imessage_full_disk_access', 'imessage_automation', 'imessage_signed_in',
];
const lines = (s) => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

test('`setup --list-steps` emits exactly S01–S15 in order', () => {
  const r = run(process.execPath, [CLI, 'setup', '--list-steps']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(lines(r.stdout), FROZEN_STEPS);
});

test('`doctor --list-rows` emits exactly the 18 frozen row ids', () => {
  const r = run(process.execPath, [CLI, 'doctor', '--list-rows']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(lines(r.stdout), FROZEN_ROWS);
});

function handlers(calls) {
  const h = {};
  for (const s of setup.STEPS) h[s.key] = async () => { calls.push(s.id); return { ok: true, inputs: 1 }; };
  return h;
}

test('step state round-trips; completed steps skip; --step reruns one', async () => {
  const home = tmpdir('kit-setup-');
  const calls = [];
  const first = await setup.runSteps({ home, log: () => {} }, { handlers: handlers(calls) });
  assert.equal(calls.length, 15);
  assert.ok(first.results.every((r) => r.status === 'done'));

  const state = setup.loadState(home);
  assert.deepEqual(Object.keys(state.steps).sort(), FROZEN_STEPS.map((s) => s.split(' ')[0]).sort());
  assert.ok(Object.values(state.steps).every((s) => s.status === 'done' && s.at));

  calls.length = 0;
  const second = await setup.runSteps({ home, log: () => {} }, { handlers: handlers(calls) });
  assert.equal(calls.length, 0, 'nothing re-run');
  assert.ok(second.results.every((r) => r.status === 'skip'));

  const one = await setup.runSteps({ home, log: () => {} }, { handlers: handlers(calls), only: 'S04' });
  assert.deepEqual(calls, ['S04']);
  assert.deepEqual(one.results.map((r) => [r.id, r.status]), [['S04', 'done']]);
  // also accepted by key
  calls.length = 0;
  await setup.runSteps({ home, log: () => {} }, { handlers: handlers(calls), only: 'telegram' });
  assert.deepEqual(calls, ['S03']);
  await assert.rejects(setup.runSteps({ home, log: () => {} }, { handlers: handlers(calls), only: 'S99' }), /unknown step/);
});

test('a failed step is not recorded done and is retried next run', async () => {
  const home = tmpdir('kit-setup-');
  const h = handlers([]);
  h.marketcheck_key = async () => ({ ok: false, reason: 'decode returned 401' });
  const r = await setup.runSteps({ home, log: () => {} }, { handlers: h });
  assert.equal(r.results.find((x) => x.id === 'S04').status, 'failed');
  assert.notEqual(setup.loadState(home).steps.S04?.status, 'done');
  assert.ok(fs.existsSync(setup.statePath(home)));
  const calls = [];
  const h2 = handlers(calls);
  await setup.runSteps({ home, log: () => {} }, { handlers: h2 });
  assert.deepEqual(calls, ['S04']);
});
