'use strict';
// `claude-kit setup` — resumable, skippable step-per-integration wizard. Step ids are FROZEN
// (PLAN "Setup step ids", D8 count = 15). State: ~/.claude-kit/setup-state.json.
// A step handler returns {ok, inputs?, reason?}; only ok:true is recorded done.
const fs = require('fs');
const path = require('path');

const STEPS = [
  { id: 'S01', key: 'claude_login', title: 'Sign in to Claude (subscription) or paste a gateway key' },
  { id: 'S02', key: 'github_login', title: 'Sign in to GitHub' },
  { id: 'S03', key: 'telegram', title: 'Telegram bot token + your user id' },
  { id: 'S04', key: 'marketcheck_key', title: 'MarketCheck API key' },
  { id: 'S05', key: 'airtable', title: 'Airtable token + workspace id' },
  { id: 'S06', key: 'composio_login', title: 'Connect Composio to Claude Code' },
  { id: 'S07', key: 'composio_connections', title: 'Connect Gmail + Google Drive in Composio' },
  { id: 'S08', key: 'tailscale_login', title: 'Sign in to Tailscale' },
  { id: 'S09', key: 'messages_automation', title: 'Allow Terminal to control Messages' },
  { id: 'S10', key: 'messages_full_disk_access', title: 'Give Terminal Full Disk Access' },
  { id: 'S11', key: 'tailscale_admin', title: 'Invite Mike as Tailscale admin' },
  { id: 'S12', key: 'phone_tailscale', title: 'Tailscale on your phone' },
  { id: 'S13', key: 'desktop_block', title: 'Claude Desktop sign-in + connectors' },
  { id: 'S14', key: 'desktop_filesystem_approval', title: 'Approve Desktop file access' },
  { id: 'S15', key: 'obsidian_vault', title: 'Confirm the second-brain vault is listed in Obsidian' },
];

function statePath(home) { return path.join(home, '.claude-kit', 'setup-state.json'); }

function loadState(home) {
  try { return JSON.parse(fs.readFileSync(statePath(home), 'utf8')); } catch { return { version: 1, steps: {} }; }
}
function saveState(home, state) {
  const p = statePath(home);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
  fs.renameSync(tmp, p);
}

function findStep(sel) {
  const s = STEPS.find((x) => x.id === sel || x.key === sel);
  if (!s) throw new Error(`unknown step: ${sel} (see claude-kit setup --list-steps)`);
  return s;
}

function listSteps() { return STEPS.map((s) => `${s.id} ${s.key}`); }

// only: one step id/key → rerun it regardless of state. Otherwise run every non-done step in order.
async function runSteps(ctx, { handlers, only = null, now = () => new Date() }) {
  const { home, log } = ctx;
  const state = loadState(home);
  const targets = only ? [findStep(only)] : STEPS;
  const results = [];
  const started = Date.now();
  for (const s of targets) {
    if (!only && state.steps[s.id]?.status === 'done') {
      results.push({ id: s.id, key: s.key, status: 'skip' });
      log(`  ${s.id} ${s.key}: skip (done ${state.steps[s.id].at})`);
      continue;
    }
    const h = handlers[s.key];
    if (!h) throw new Error(`no handler for ${s.id} ${s.key}`);
    log(`\n${s.id} — ${s.title}`);
    let r;
    try { r = await h(ctx); } catch (e) { r = { ok: false, reason: e.message }; }
    if (r && r.ok) {
      state.steps[s.id] = { key: s.key, status: 'done', at: now().toISOString(), inputs: r.inputs ?? 1 };
      results.push({ id: s.id, key: s.key, status: 'done', inputs: r.inputs ?? 1 });
      log(`  ${s.id}: done`);
    } else {
      state.steps[s.id] = { key: s.key, status: 'failed', at: now().toISOString(), reason: r?.reason || 'failed' };
      results.push({ id: s.id, key: s.key, status: 'failed', reason: r?.reason || 'failed' });
      log(`  ${s.id}: FAILED — ${r?.reason || 'failed'} (re-run: claude-kit setup --step ${s.id})`);
    }
    saveState(home, state);
  }
  return { results, counter: counter(results, Date.now() - started) };
}

// D8 counter: steps the user acted on (target ≤ 15) and raw inputs (clicks/pastes) this run.
function counter(results, ms) {
  const acted = results.filter((r) => r.status === 'done');
  return {
    steps: acted.length,
    raw: acted.reduce((n, r) => n + (r.inputs || 0), 0),
    wallClockSec: Math.round(ms / 1000),
  };
}

module.exports = { STEPS, statePath, loadState, saveState, listSteps, findStep, runSteps, counter };
