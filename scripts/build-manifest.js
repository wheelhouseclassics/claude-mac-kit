#!/usr/bin/env node
'use strict';
// scripts/build-manifest.js — Windows-side build tool (never ships).
// Reads the build machine's ~/.claude (settings.json, plugins/known_marketplaces.json, the mcpServers key of
// ~/.claude.json, skills/, commands/, hooks/, pipeline/) and the source vault, applies manifest-config.js,
// validates against manifest.schema.json, writes manifest.json, populates kit/ and emits kit/DROPPED.md.
// Ported items (hand-maintained under kit/) are never overwritten; their source hash is recorded so drift is flagged.
//   node scripts/build-manifest.js            # build
//   node scripts/build-manifest.js --check    # validate + report, write nothing

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const cfg = require('./manifest-config');
const { validate } = require('./lib/schema-validate');

const ROOT = path.resolve(__dirname, '..');
const KIT = path.join(ROOT, 'kit');
const HOME = process.env.KIT_SOURCE_HOME || os.homedir();
const CLAUDE = path.join(HOME, '.claude');
const VAULT_SRC = process.env.KIT_VAULT_SOURCE || path.join(HOME, cfg.vault.sourceRelHome);
const CHECK = process.argv.includes('--check');

const errors = [];
const warnings = [];
const fail = (m) => errors.push(m);
const warn = (m) => warnings.push(m);
const posix = (p) => p.split(path.sep).join('/');
const tilde = (abs) => (abs.startsWith(HOME) ? '~' + posix(abs.slice(HOME.length)) : posix(abs));
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const TEXT = /\.(md|json|txt|py|sh|js|csv|yml|yaml|toml)$/i;

// ---------- copy-deny ----------
function copyDenied(relPath) {
  const r = posix(relPath);
  const base = path.basename(r);
  for (const pat of cfg.copyDeny) {
    if (pat.endsWith('/')) { const seg = pat.slice(0, -1); if (r.split('/').includes(seg)) return pat; }
    else if (pat.startsWith('*')) { if (base.endsWith(pat.slice(1))) return pat; }
    else if (base === pat) return pat;
  }
  return null;
}
function guardSource(abs) {
  const rel = abs.startsWith(CLAUDE) ? path.relative(CLAUDE, abs) : path.basename(abs);
  const hit = copyDenied(rel);
  if (hit) throw new Error(`refusing to read copy-denied path ${tilde(abs)} (matches ${hit})`);
}

// ---------- fs helpers ----------
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (copyDenied(e.isDirectory() ? e.name + '/' : e.name)) continue;
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
function hashTree(root) {
  const h = crypto.createHash('sha256');
  const files = fs.statSync(root).isDirectory() ? walk(root).sort() : [root];
  for (const f of files) {
    h.update(posix(path.relative(path.dirname(root), f)) + '\0');
    h.update(fs.readFileSync(f));
    h.update('\0');
  }
  return h.digest('hex');
}
function writeText(p, s) {
  if (CHECK) return;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s.replace(/\r\n/g, '\n'));
}
function applyRewrites(text, setName) {
  if (!setName) return text;
  const rules = cfg.rewrites[setName];
  if (!rules) throw new Error('unknown rewrite set ' + setName);
  return rules.reduce((s, fn) => fn(s), text);
}
function mirrorFile(src, dst, rewriteSet) {
  guardSource(src);
  if (CHECK) return;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (TEXT.test(src)) writeText(dst, applyRewrites(fs.readFileSync(src, 'utf8'), rewriteSet));
  else fs.copyFileSync(src, dst);
}
function mirrorTree(srcDir, dstDir, rewriteSet) {
  if (!CHECK) fs.rmSync(dstDir, { recursive: true, force: true });
  for (const f of walk(srcDir)) mirrorFile(f, path.join(dstDir, path.relative(srcDir, f)), rewriteSet);
}

// ---------- previous manifest (for drift warnings) ----------
let previous = null;
try { previous = readJson(path.join(ROOT, 'manifest.json')); } catch { /* first build */ }
function driftCheck(kind, name, sha) {
  if (!previous) return;
  const prev = (previous[kind] || []).find((x) => x.name === name);
  if (prev && prev.mode === 'port' && prev.sourceSha256 !== sha) warn(`${kind}/${name}: source changed since it was ported — re-port kit/${kind}/${name}`);
}

// ---------- 1. settings.json → plugins + marketplaces ----------
const settings = readJson(path.join(CLAUDE, 'settings.json'));
const enabled = Object.entries(settings.enabledPlugins || {}).filter(([, v]) => v === true).map(([k]) => k).sort();
const keepPlugins = [...cfg.plugins.keep].sort();
if (JSON.stringify(enabled) !== JSON.stringify(keepPlugins)) {
  fail(`enabledPlugins on the build machine differ from manifest-config.plugins.keep\n  enabled-only: ${enabled.filter((x) => !keepPlugins.includes(x)).join(', ') || '-'}\n  config-only: ${keepPlugins.filter((x) => !enabled.includes(x)).join(', ') || '-'}`);
}
const known = readJson(path.join(CLAUDE, 'plugins', 'known_marketplaces.json'));
// The kit ships what a FRESH Mac can resolve today, not what this machine happened to install: an
// upstream rename is declared in manifest-config.plugins.renames and applied here (the old id stays
// the key for the enabledPlugins assertion above, and for runtime/notes lookups).
const renames = cfg.plugins.renames || {};
const renamedTo = (id) => (renames[id] ? renames[id].id : id);
const effIds = keepPlugins.map(renamedTo);
const mktNames = new Set(cfg.marketplaces.alwaysInclude);
for (const id of effIds) mktNames.add(id.split('@')[1]);
const marketplaces = [...mktNames].sort().map((name) => {
  const ren = Object.values(renames).find((r) => r.marketplace === name);
  if (ren) { const wasName = Object.keys(renames).find((k) => renames[k] === ren).split('@')[1]; return { name, was: wasName, source: { source: 'github', repo: ren.repo }, note: ren.note }; }
  const k = known[name];
  if (!k || !k.source) { fail(`marketplace ${name} not in known_marketplaces.json`); return { name, source: { source: 'github', repo: 'unknown/unknown' } }; }
  return { name, source: { source: k.source.source, repo: k.source.repo } };
});
const plugins = keepPlugins.map((oldId) => {
  const id = renamedTo(oldId);
  const [name, marketplace] = id.split('@');
  const p = { id, name, marketplace };
  if (cfg.plugins.runtime[oldId]) p.runtime = cfg.plugins.runtime[oldId];
  if (cfg.plugins.notes[oldId]) p.note = cfg.plugins.notes[oldId];
  if (renames[oldId]) { p.was = oldId; p.note = renames[oldId].note; }
  return p;
}).sort((a, b) => a.id.localeCompare(b.id));

// ---------- 2. ~/.claude.json → ONLY the kept mcpServers (nothing else is read from that file) ----------
const mcp = [];
{
  const all = readJson(path.join(HOME, '.claude.json')).mcpServers || {};
  for (const name of cfg.mcp.keep) {
    const s = all[name];
    if (!s) { fail(`mcp ${name} not configured on the build machine`); continue; }
    if (s.headers || s.env) { fail(`mcp ${name} carries headers/env — refusing to ship it`); continue; }
    if (!/^https:\/\//.test(s.url || '')) { fail(`mcp ${name}: expected an https url`); continue; }
    mcp.push({ name, type: s.type, url: s.url, scope: cfg.mcp.scope, note: 'added with `claude mcp add --scope user --transport http`; login via `claude mcp login`' });
  }
}

// ---------- 3. skills ----------
function kitItem(kind, name, srcAbs, kitRel, mode, rewriteSet, note) {
  if (!fs.existsSync(srcAbs)) { fail(`${kind}/${name}: source ${tilde(srcAbs)} does not exist`); return null; }
  guardSource(srcAbs);
  const sha = hashTree(srcAbs);
  const dst = path.join(ROOT, kitRel);
  if (mode === 'port') {
    if (!fs.existsSync(dst)) fail(`${kind}/${name}: marked ported but ${kitRel} is missing — port it by hand`);
    driftCheck(kind, name, sha);
  } else if (fs.statSync(srcAbs).isDirectory()) mirrorTree(srcAbs, dst, rewriteSet);
  else mirrorFile(srcAbs, dst, rewriteSet);
  const item = { name, path: kitRel, source: tilde(srcAbs), mode, sourceSha256: sha };
  if (note) item.note = note;
  return item;
}
const skills = cfg.skills.keep.map((name) => {
  const ported = cfg.skills.ported[name];
  return kitItem('skills', name, path.join(CLAUDE, 'skills', name), `kit/skills/${name}`, ported ? 'port' : 'mirror', cfg.skills.rewriteSet[name], ported);
}).filter(Boolean);

// ---------- 4. commands ----------
const commands = cfg.commands.keep.map((name) => {
  const ported = cfg.commands.ported[name];
  return kitItem('commands', name, path.join(CLAUDE, 'commands', `${name}.md`), `kit/commands/${name}.md`, ported ? 'port' : 'mirror', cfg.commands.rewriteSet[name], ported);
}).filter(Boolean);

// ---------- 5. hooks ----------
const hooks = cfg.hooks.keep.map((h) => {
  const ported = cfg.hooks.ported[h.name];
  const item = kitItem('hooks', h.name, path.join(CLAUDE, 'hooks', h.file), `kit/hooks/${h.file}`, ported ? 'port' : 'mirror', null, h.note);
  if (!item) return null;
  return { name: h.name, event: h.event, path: item.path, install: h.install, command: h.command, timeout: h.timeout, statusMessage: h.statusMessage, source: item.source, mode: item.mode, sourceSha256: item.sourceSha256, note: h.note };
}).filter(Boolean);
// the source machine must actually register the hook we ship
{
  const registered = JSON.stringify(settings.hooks || {});
  for (const h of cfg.hooks.keep) if (!registered.includes(h.file)) warn(`hook ${h.name}: ${h.file} is not registered in the build machine's settings.json hooks`);
}

// ---------- 6. pipeline (stages + templates mirrored with path rewrites; registry seeded) ----------
{
  const srcStages = path.join(CLAUDE, 'pipeline', 'stages');
  const srcTemplates = path.join(CLAUDE, 'pipeline', 'templates');
  if (!CHECK) fs.rmSync(path.join(KIT, 'pipeline'), { recursive: true, force: true });
  for (const f of cfg.pipeline.stages) {
    const s = path.join(srcStages, f);
    if (!fs.existsSync(s)) { fail(`pipeline stage ${f} missing on the build machine`); continue; }
    mirrorFile(s, path.join(KIT, 'pipeline', 'stages', f), cfg.pipeline.rewriteSet);
  }
  for (const f of cfg.pipeline.templates) {
    const s = path.join(srcTemplates, f);
    if (!fs.existsSync(s)) { fail(`pipeline template ${f} missing on the build machine`); continue; }
    mirrorFile(s, path.join(KIT, 'pipeline', 'templates', f), cfg.pipeline.rewriteSet);
  }
  writeText(path.join(KIT, 'pipeline', 'registry.json'), JSON.stringify(cfg.pipeline.registrySeed, null, 2) + '\n');
}

// ---------- 7. vault ----------
const vaultFiles = [];
for (const rel of cfg.vault.mirror) {
  const s = path.join(VAULT_SRC, rel);
  if (!fs.existsSync(s)) { fail(`vault source ${tilde(s)} missing`); continue; }
  mirrorFile(s, path.join(KIT, 'vault', rel), rel.endsWith('.md') ? 'vault' : null);
  vaultFiles.push({ path: `kit/vault/${rel}`, mode: 'mirror', source: tilde(s), sourceSha256: hashTree(s) });
}
for (const rel of cfg.vault.authored) {
  if (!fs.existsSync(path.join(KIT, 'vault', rel))) fail(`authored vault file kit/vault/${rel} is missing`);
  vaultFiles.push({ path: `kit/vault/${rel}`, mode: 'authored' });
}

// ---------- 8. compose, validate, write ----------
const manifest = {
  $schema: './manifest.schema.json',
  version: 1,
  generatedAt: new Date().toISOString(),
  generator: 'scripts/build-manifest.js',
  marketplaces,
  plugins,
  skills,
  commands,
  hooks,
  mcp,
  connectors: cfg.connectors,
  deps: cfg.deps,
  brew: cfg.brew,
  vault: { root: cfg.vault.root, folders: cfg.vault.folders, files: vaultFiles },
  deny: cfg.deny,
  copyDeny: cfg.copyDeny,
  settingsDeny: cfg.settingsDeny,
};
const schema = readJson(path.join(ROOT, 'manifest.schema.json'));
for (const e of validate(schema, manifest)) fail('schema: ' + e);

// counts contract (PLAN.md G1.1)
const expect = { marketplaces: 5, plugins: 14, skills: 10, commands: 1, hooks: 1, mcp: 1, connectors: 6 };
for (const [k, n] of Object.entries(expect)) if (manifest[k].length !== n) fail(`${k}: expected ${n}, got ${manifest[k].length}`);

if (errors.length) {
  console.error('build-manifest: FAILED');
  for (const e of errors) console.error('  ✗ ' + e);
  process.exit(1);
}
// keep generatedAt stable when nothing else changed (avoids noisy diffs)
if (previous) {
  const a = { ...previous, generatedAt: null };
  const b = { ...manifest, generatedAt: null };
  if (JSON.stringify(a) === JSON.stringify(b)) manifest.generatedAt = previous.generatedAt;
}
writeText(path.join(ROOT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// DROPPED.md — generated from deny, inlined into the guide later
{
  const byKind = {};
  for (const d of cfg.deny) (byKind[d.kind] = byKind[d.kind] || []).push(d);
  const kindTitle = { skill: 'Skills', command: 'Commands', hook: 'Hooks', agent: 'Agents', 'mcp-server': 'Local MCP server scripts', mcp: 'MCP servers', plugin: 'Plugins', settings: 'settings.json keys', vault: 'Vault content' };
  let md = '# Dropped from the kit\n\n<!-- GENERATED by scripts/build-manifest.js from manifest-config.js deny list. Do not edit. -->\n\n';
  md += 'These items exist on the source machine but are intentionally NOT installed by the kit. Everything else in the source `~/.claude` that is Mac-compatible is mirrored (see `manifest.json`).\n\n';
  for (const [kind, items] of Object.entries(byKind)) {
    md += `## ${kindTitle[kind] || kind}\n\n`;
    for (const d of items) md += `- \`${d.name}\` — ${d.reason}${d.path ? ` (\`${d.path}\`)` : ''}\n`;
    md += '\n';
  }
  writeText(path.join(KIT, 'DROPPED.md'), md);
}

for (const w of warnings) console.warn('  ⚠ ' + w);
console.log(`build-manifest: ${CHECK ? 'check ok' : 'wrote manifest.json + kit/'} — marketplaces ${marketplaces.length}, plugins ${plugins.length}, skills ${skills.length}, commands ${commands.length}, hooks ${hooks.length}, mcp ${mcp.length}, connectors ${cfg.connectors.length}, deny ${cfg.deny.length}`);
