'use strict';
// Marketplaces and plugins, applied through the `claude` CLI itself.
//
// Guards: `claude plugin marketplace list --json` and `claude plugin list --json` are read FIRST, and
// only what is missing is added/installed (a re-run otherwise UPDATEs every plugin). Set equality on
// `id` over installed scopes, ignoring `@skills-dir` entries — counting is wrong, disabled and
// skills-dir rows exist. `--yes` is mandatory: there is no TTY under `curl | bash`.
const { spawnSync } = require('child_process');

const CLAUDE = process.env.KIT_CLAUDE_BIN || 'claude';

function defaultExec(args) {
  const r = spawnSync(CLAUDE, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (r.error) return { status: 127, stdout: '', stderr: r.error.message };
  return { status: r.status === null ? 1 : r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}
const execOf = (ctx) => ctx.exec || defaultExec;

function parseJson(out) {
  const t = (out || '').trim();
  if (!t) return null;
  try { return JSON.parse(t); } catch { /* fall through */ }
  const i = t.search(/[[{]/); // the CLI sometimes prints a banner line before the JSON
  if (i < 0) return null;
  try { return JSON.parse(t.slice(i)); } catch { return null; }
}

// Accepts: ["name"], [{name}], [{id}] or {name: {...}}
function namesOf(json) {
  if (!json) return new Set();
  if (Array.isArray(json)) return new Set(json.map((e) => (typeof e === 'string' ? e : e && (e.name || e.id))).filter(Boolean));
  if (typeof json === 'object') return new Set(Object.keys(json));
  return new Set();
}

// Installed plugin ids, ignoring @skills-dir pseudo-entries. Accepts array or object-map shapes.
function pluginIdsOf(json) {
  const ids = new Set();
  const add = (id) => { if (id && !String(id).endsWith('@skills-dir')) ids.add(String(id)); };
  if (Array.isArray(json)) {
    for (const e of json) {
      if (typeof e === 'string') add(e);
      else if (e && e.id) add(e.id);
      else if (e && e.name && e.marketplace) add(`${e.name}@${e.marketplace}`);
    }
  } else if (json && typeof json === 'object') {
    for (const [k, v] of Object.entries(json)) {
      if (v && typeof v === 'object' && v.id) add(v.id);
      else add(k);
    }
  }
  return ids;
}

function listMarketplaces(ctx) {
  const r = execOf(ctx)(['plugin', 'marketplace', 'list', '--json']);
  return namesOf(parseJson(r.stdout));
}
function listPlugins(ctx) {
  const r = execOf(ctx)(['plugin', 'list', '--json']);
  return pluginIdsOf(parseJson(r.stdout));
}

// What is missing, given the current machine state.
function plan(manifest, haveMarketplaces, havePlugins) {
  return {
    marketplaces: manifest.marketplaces.filter((m) => !haveMarketplaces.has(m.name)),
    plugins: manifest.plugins.filter((p) => !havePlugins.has(p.id)),
  };
}

async function ensurePlugins(ctx) {
  const exec = execOf(ctx);
  const { marketplaces, plugins: missing } = plan(ctx.manifest, listMarketplaces(ctx), listPlugins(ctx));
  const changed = [];

  for (const m of marketplaces) {
    const ref = m.source && m.source.repo ? m.source.repo : m.name;
    const r = exec(['plugin', 'marketplace', 'add', ref]);
    if (r.status !== 0) throw new Error(`claude plugin marketplace add ${ref} failed: ${(r.stderr || r.stdout || '').trim().split('\n').slice(-2).join(' ')}`);
    changed.push(`marketplace:${m.name}`);
  }

  for (const p of missing) {
    const r = exec(['plugin', 'install', p.id, '--scope', 'user', '--yes', '--json']);
    if (r.status !== 0) throw new Error(`claude plugin install ${p.id} failed: ${(r.stderr || r.stdout || '').trim().split('\n').slice(-2).join(' ')}`);
    changed.push(`plugin:${p.id}`);
  }

  return { changed };
}

module.exports = { ensurePlugins, plan, listMarketplaces, listPlugins, pluginIdsOf, namesOf, parseJson, CLAUDE };
