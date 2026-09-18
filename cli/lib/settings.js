'use strict';
// ~/.claude/settings.json — kit-managed keys only, merged into whatever the user already has.
//
// Write order (PLAN Phase 3):
//   (a) applyPre  — extraKnownMarketplaces + the non-plugin kit keys, BEFORE `claude plugin install`
//   (b) plugins.js — marketplace add / plugin install (the CLI writes enabledPlugins itself)
//   (c) applyPost — re-read and merge the remaining kit keys (enabledPlugins backstop)
//
// Rules: the kit ADDS its own keys and never deletes or overwrites a value the user set.
// ~/.claude/plugins/installed_plugins.json and known_marketplaces.json are NEVER hand-written.
const fs = require('fs');
const path = require('path');
const { VENV_REL } = require('./deps');

const ALLOWLIST = ['extraKnownMarketplaces', 'enabledPlugins', 'hooks', 'permissions.defaultMode'];
const DEFAULT_MODE = 'auto'; // mirrors the source machine; only written when the user has none
const HOOK_COMMAND = `$HOME/${VENV_REL}/bin/python $HOME/.claude/hooks/auto-md.py`;

function settingsPath(home) { return path.join(home, '.claude', 'settings.json'); }

function read(home) {
  const p = settingsPath(home);
  if (!fs.existsSync(p)) return {};
  const raw = fs.readFileSync(p, 'utf8').trim();
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (e) { throw new Error(`~/.claude/settings.json is not valid JSON (${e.message}) — fix or move it, then re-run`); }
}

function write(home, obj, dryRun) {
  const p = settingsPath(home);
  if (dryRun) return;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}

// --- individual merges: each returns the list of things it changed -------------------------------

function mergeMarketplaces(s, manifest) {
  const changed = [];
  const cur = s.extraKnownMarketplaces || {};
  for (const m of manifest.marketplaces) {
    if (cur[m.name]) continue; // user's own entry (or ours) wins — never overwrite
    cur[m.name] = m.source;
    changed.push(`extraKnownMarketplaces.${m.name}`);
  }
  if (changed.length || !s.extraKnownMarketplaces) s.extraKnownMarketplaces = cur;
  return changed;
}

function mergePlugins(s, manifest) {
  const changed = [];
  const cur = s.enabledPlugins || {};
  for (const p of manifest.plugins) {
    if (p.id in cur) continue; // a boss-disabled plugin stays disabled
    cur[p.id] = true;
    changed.push(`enabledPlugins.${p.id}`);
  }
  if (changed.length || !s.enabledPlugins) s.enabledPlugins = cur;
  return changed;
}

function mergeDefaultMode(s) {
  const cur = s.permissions || {};
  if (cur.defaultMode) { if (!s.permissions) s.permissions = cur; return []; }
  cur.defaultMode = DEFAULT_MODE;
  s.permissions = cur;
  return ['permissions.defaultMode'];
}

// The auto-md hook is kit-owned: re-pinned in place (a Windows-era command is replaced, not duplicated).
function mergeHook(s, manifest) {
  const spec = manifest.hooks.find((h) => h.name === 'auto-md');
  if (!spec) return [];
  const want = { type: 'command', command: HOOK_COMMAND, timeout: spec.timeout, statusMessage: spec.statusMessage };
  const hooks = s.hooks || {};
  const groups = hooks[spec.event] || [];
  const isOurs = (h) => typeof h.command === 'string' && h.command.includes('auto-md.py');

  let found = null;
  for (const g of groups) for (const h of (g.hooks || [])) if (isOurs(h)) found = found || h;
  if (found) {
    const same = ['type', 'command', 'timeout', 'statusMessage'].every((k) => found[k] === want[k]);
    if (same) { s.hooks = hooks; hooks[spec.event] = groups; return []; }
    Object.assign(found, want);
    s.hooks = hooks; hooks[spec.event] = groups;
    return [`hooks.${spec.event}[auto-md] re-pinned`];
  }
  groups.push({ hooks: [want] });
  hooks[spec.event] = groups;
  s.hooks = hooks;
  return [`hooks.${spec.event}[auto-md]`];
}

// --- phases -------------------------------------------------------------------------------------

function applyPre(ctx) {
  const s = read(ctx.home);
  const changed = [...mergeMarketplaces(s, ctx.manifest), ...mergeHook(s, ctx.manifest), ...mergeDefaultMode(s)];
  if (changed.length || !fs.existsSync(settingsPath(ctx.home))) write(ctx.home, s, ctx.dryRun);
  return { changed };
}

function applyPost(ctx) {
  const s = read(ctx.home); // re-read: `claude plugin install` wrote enabledPlugins between the two passes
  const changed = [...mergePlugins(s, ctx.manifest), ...mergeHook(s, ctx.manifest), ...mergeDefaultMode(s)];
  if (changed.length) write(ctx.home, s, ctx.dryRun);
  return { changed };
}

module.exports = { applyPre, applyPost, read, settingsPath, ALLOWLIST, DEFAULT_MODE, HOOK_COMMAND };
