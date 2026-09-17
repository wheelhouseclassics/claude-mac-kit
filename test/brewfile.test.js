'use strict';
// G2.4 — every brew/cask token in Brewfile + Brewfile.extras returns 200 from formulae.brew.sh;
// node token is node@24; no sqlite; no cask tailscale; extras (whisper.cpp, ffmpeg) live in Brewfile.extras only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT, exists } = require('./helpers');

const MAIN = path.join(ROOT, 'Brewfile');
const EXTRAS = path.join(ROOT, 'Brewfile.extras');

function parse(file) {
  if (!exists(file)) return null;
  const out = { tap: [], brew: [], cask: [] };
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = /^(tap|brew|cask)\s+"([^"]+)"/.exec(line);
    assert.ok(m, `unparseable Brewfile line: ${raw}`);
    out[m[1]].push(m[2]);
  }
  return out;
}
function apiUrl(kind, token) {
  if (token.includes('/')) { // tap-qualified owner/repo/name → the tap's Formula file
    const [o, r, n] = token.split('/');
    return `https://raw.githubusercontent.com/${o}/homebrew-${r}/HEAD/Formula/${n}.rb`;
  }
  return `https://formulae.brew.sh/api/${kind}/${encodeURIComponent(token)}.json`;
}
async function status(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 20000);
  try { const r = await fetch(url, { signal: ac.signal, redirect: 'follow' }); return r.status; }
  catch (e) { return `ERR ${e.name}`; }
  finally { clearTimeout(t); }
}

test('Brewfile and Brewfile.extras exist and parse', () => {
  assert.ok(exists(MAIN), 'Brewfile missing at repo root');
  assert.ok(exists(EXTRAS), 'Brewfile.extras missing at repo root');
  const m = parse(MAIN), x = parse(EXTRAS);
  assert.ok(m.brew.length > 0 && m.cask.length > 0, 'Brewfile needs brew + cask lines');
  assert.ok(x.brew.length > 0, 'Brewfile.extras needs brew lines');
});

test('token policy: node@24, formula tailscale, casks claude+obsidian; no sqlite / whisper-cpp / cask tailscale; extras split out', () => {
  const m = parse(MAIN), x = parse(EXTRAS);
  assert.ok(m && x, 'Brewfile(s) missing');
  for (const t of ['node@24', 'git', 'gh', 'gitleaks', 'bun', 'python@3.12', 'tmux', 'tailscale']) assert.ok(m.brew.includes(t), `Brewfile missing brew "${t}"`);
  for (const t of ['claude', 'obsidian']) assert.ok(m.cask.includes(t), `Brewfile missing cask "${t}"`);
  for (const t of ['sqlite', 'sqlite3', 'whisper-cpp', 'whisper.cpp', 'ffmpeg', 'node']) assert.ok(!m.brew.includes(t), `Brewfile must not list brew "${t}"`);
  for (const t of ['tailscale', 'tailscale-app']) assert.ok(!m.cask.includes(t), `Brewfile must not list cask "${t}" (D9: open-source formula only)`);
  for (const t of ['whisper.cpp', 'ffmpeg']) assert.ok(x.brew.includes(t), `Brewfile.extras missing brew "${t}"`);
  assert.ok(!x.brew.includes('whisper-cpp'), 'extras must use the whisper.cpp token');
});

test('every brew/cask token resolves with HTTP 200', async () => {
  const files = [parse(MAIN), parse(EXTRAS)];
  assert.ok(files.every(Boolean), 'Brewfile(s) missing');
  const checks = [];
  for (const f of files) {
    for (const t of f.brew) checks.push(['formula', t]);
    for (const t of f.cask) checks.push(['cask', t]);
  }
  assert.ok(checks.length > 0);
  const results = await Promise.all(checks.map(async ([k, t]) => [k, t, await status(apiUrl(k, t))]));
  const bad = results.filter(([, , s]) => s !== 200).map(([k, t, s]) => `${k} "${t}" → ${s}`);
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('negative control: the API check discriminates (whisper-cpp and cask tailscale are 404)', async () => {
  assert.equal(await status(apiUrl('formula', 'whisper-cpp')), 404);
  assert.equal(await status(apiUrl('cask', 'tailscale')), 404);
});
