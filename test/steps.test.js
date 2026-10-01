'use strict';
// Setup step handlers (PLAN Phase 4 S01–S15) against an injected io + scripted prompts:
// each live verifier gates the save, secrets land at 0600, failures are redacted, and the
// guide stubs count one input each.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const steps = require('../cli/lib/steps');
const { STEPS } = require('../cli/lib/setup');

// Secret-shaped fakes assembled at runtime so the secret scanner never sees a literal.
const FAKE_TG = ['123456789', 'AA' + 'Hdq7'.repeat(8)].join(':');
const FAKE_MC = 'MCKEY' + 'abcdef123';
const FAKE_PAT = 'pat' + 'AbCdEfGhIjKlMn' + '.' + '0123456789abcdef';
const FAKE_GW = 'sk-' + 'or-v1-' + 'f00dfeed'.repeat(4);
const POSIX = process.platform !== 'win32';

function mode(p) { return (fs.statSync(p).mode & 0o777).toString(8); }

// http: {urlSubstring: {status, body}}; exec: {"cmd arg arg": {status, stdout}}
function harness({ http = {}, exec = {}, hidden = [], lines = [], env = {} } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'steps-'));
  const logs = [];
  const calls = [];
  const interactive = [];
  const ctx = {
    home,
    log: (m) => logs.push(String(m)),
    io: {
      home,
      env: { HOME: home, ...env },
      async exec(cmd, args) {
        const k = [cmd, ...args].join(' ');
        calls.push(k);
        if (exec[k]) return { stderr: '', stdout: '', status: 0, ...exec[k] };
        for (const [pat, r] of Object.entries(exec)) if (k.startsWith(pat)) return { stderr: '', stdout: '', status: 0, ...r };
        return { status: 127, stdout: '', stderr: `${cmd}: command not found` };
      },
      async http(url) {
        calls.push(url);
        for (const [pat, r] of Object.entries(http)) if (url.includes(pat)) return r;
        return { status: 404, body: {} };
      },
      exists: (p) => fs.existsSync(p),
      readFile: (p) => fs.readFileSync(p, 'utf8'),
      readdir: (p) => fs.readdirSync(p),
    },
    prompt: {
      hidden: async () => { if (!hidden.length) throw new Error('unexpected hidden prompt'); return hidden.shift(); },
      line: async () => { if (!lines.length) throw new Error('unexpected prompt'); return lines.shift(); },
    },
    interactive: async (cmd, args) => { interactive.push([cmd, ...args].join(' ')); return 0; },
  };
  return { ctx, home, logs, calls, interactive, cred: (n) => path.join(home, '.claude', 'credentials', `${n}.json`) };
}

test('a handler exists for every frozen step key', () => {
  const h = steps.handlers();
  for (const s of STEPS) assert.equal(typeof h[s.key], 'function', `${s.id} ${s.key}`);
});

test('S01 gateway: /models 200 → gateway.json 600 + settings.json env (600); 2 inputs', async () => {
  const t = harness({ lines: ['g', ''], hidden: [FAKE_GW], http: { 'openrouter.ai/api/v1/models': { status: 200, body: { data: [] } } } });
  const r = await steps.handlers().claude_login(t.ctx);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.inputs, 2);
  const gw = JSON.parse(fs.readFileSync(t.cred('gateway'), 'utf8'));
  assert.deepEqual(gw, { base_url: 'https://openrouter.ai/api/v1', auth_token: FAKE_GW });
  const s = JSON.parse(fs.readFileSync(path.join(t.home, '.claude', 'settings.json'), 'utf8'));
  assert.equal(s.env.ANTHROPIC_BASE_URL, 'https://openrouter.ai/api/v1');
  assert.equal(s.env.ANTHROPIC_AUTH_TOKEN, FAKE_GW);
  if (POSIX) { assert.equal(mode(t.cred('gateway')), '600'); assert.equal(mode(path.join(t.home, '.claude', 'settings.json')), '600'); }
});

test('S01 gateway: /models 401 → not saved, reason redacted', async () => {
  const t = harness({ lines: ['g', ''], hidden: [FAKE_GW], http: { '/models': { status: 401, body: { error: `bad key ${FAKE_GW}` } } } });
  const r = await steps.handlers().claude_login(t.ctx);
  assert.equal(r.ok, false);
  assert.match(r.reason, /401/);
  assert.ok(!r.reason.includes(FAKE_GW.slice(0, 12)));
  assert.equal(fs.existsSync(t.cred('gateway')), false);
});

test('S01 subscription over SSH → refuses with "GUI Terminal" (login Keychain unreadable)', async () => {
  const t = harness({ lines: ['s'], env: { SSH_CONNECTION: '1.2.3.4 5 6.7.8.9 22' } });
  const r = await steps.handlers().claude_login(t.ctx);
  assert.equal(r.ok, false);
  assert.match(r.reason, /GUI Terminal/);
  assert.match(r.reason, /setup-token/);
  assert.equal(t.interactive.length, 0);
});

test('S01 subscription in Aqua → runs claude auth login, verifies loggedIn', async () => {
  const t = harness({ lines: ['s'], exec: { 'claude auth status --json': { stdout: JSON.stringify({ loggedIn: true, subscriptionType: 'max' }) } } });
  const r = await steps.handlers().claude_login(t.ctx);
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(t.interactive, ['claude auth login --claudeai']);
});

test('S02: gh already signed in; git identity derived from gh api user', async () => {
  const t = harness({ exec: {
    'gh auth status': { status: 0 },
    'git config --global user.name': { status: 1 },
    'git config --global user.email': { status: 1 },
    'gh api user': { stdout: JSON.stringify({ login: 'boss', id: 7, name: 'The Boss', email: null }) },
    'git config --global user.name The Boss': { status: 0 },
    'git config --global user.email 7+boss@users.noreply.github.com': { status: 0 },
  } });
  const r = await steps.handlers().github_login(t.ctx);
  assert.equal(r.ok, true, r.reason);
  assert.equal(t.interactive.length, 0);
  assert.ok(t.calls.includes('git config --global user.name The Boss'));
  assert.ok(t.calls.includes('git config --global user.email 7+boss@users.noreply.github.com'));
});

test('S03: getMe ok → telegram.json + channels .env (600) + allowlist access.json; 2 inputs', async () => {
  const t = harness({ hidden: [FAKE_TG], lines: ['42'], http: { '/getMe': { status: 200, body: { ok: true, result: { username: 'kit_bot' } } } } });
  const r = await steps.handlers().telegram(t.ctx);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.inputs, 2);
  const ch = path.join(t.home, '.claude', 'channels', 'telegram');
  assert.equal(fs.readFileSync(path.join(ch, '.env'), 'utf8'), `TELEGRAM_BOT_TOKEN=${FAKE_TG}\n`);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(ch, 'access.json'), 'utf8')), { dmPolicy: 'allowlist', allowFrom: ['42'] });
  assert.deepEqual(JSON.parse(fs.readFileSync(t.cred('telegram'), 'utf8')), { token: FAKE_TG, userId: '42' });
  if (POSIX) { assert.equal(mode(path.join(ch, '.env')), '600'); assert.equal(mode(t.cred('telegram')), '600'); }
  assert.ok(t.logs.some((l) => /reload-plugins/.test(l)));
  assert.ok(!t.logs.join('\n').includes(FAKE_TG.split(':')[1].slice(0, 8)), 'token never logged');
});

test('S03: non-numeric user id rejected before any HTTP', async () => {
  const t = harness({ hidden: [FAKE_TG], lines: ['@boss'] });
  const r = await steps.handlers().telegram(t.ctx);
  assert.equal(r.ok, false);
  assert.match(r.reason, /numeric/);
  assert.equal(t.calls.length, 0);
});

test('S04: decode 200 → marketcheck.json; failure reason never carries the key', async () => {
  const ok = harness({ hidden: [FAKE_MC], http: { '/v2/decode/car/': { status: 200, body: { make: 'Honda' } } } });
  assert.equal((await steps.handlers().marketcheck_key(ok.ctx)).ok, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(ok.cred('marketcheck'), 'utf8')), { api_key: FAKE_MC, base_url: 'https://api.marketcheck.com' });
  const bad = harness({ hidden: [FAKE_MC], http: { '/v2/decode/car/': { status: 401, body: `invalid api_key=${FAKE_MC}` } } });
  const r = await steps.handlers().marketcheck_key(bad.ctx);
  assert.equal(r.ok, false);
  assert.ok(!r.reason.includes(FAKE_MC));
  assert.equal(fs.existsSync(bad.cred('marketcheck')), false);
});

test('S05: wsp prefix checked before HTTP; whoami 200 AND bases 200 required', async () => {
  const pre = harness({ hidden: [FAKE_PAT], lines: ['appNotAWorkspace1'] });
  const r1 = await steps.handlers().airtable(pre.ctx);
  assert.equal(r1.ok, false);
  assert.match(r1.reason, /wsp/);
  assert.equal(pre.calls.length, 0);

  const noBases = harness({ hidden: [FAKE_PAT], lines: ['wspAbCdEfGhIjKlMn'], http: { '/meta/whoami': { status: 200, body: { id: 'usr1' } }, '/meta/bases': { status: 403, body: {} } } });
  const r2 = await steps.handlers().airtable(noBases.ctx);
  assert.equal(r2.ok, false);
  assert.match(r2.reason, /schema\.bases:read/);

  const good = harness({ hidden: [FAKE_PAT], lines: ['wspAbCdEfGhIjKlMn'], http: { '/meta/whoami': { status: 200, body: {} }, '/meta/bases': { status: 200, body: { bases: [] } } } });
  assert.equal((await steps.handlers().airtable(good.ctx)).ok, true);
  assert.ok(good.logs.join('\n').includes('schema.bases:write'), 'guide names the scopes');
});

test('S06: adds composio at user scope when absent, logs in, verifies Connected', async () => {
  let listed = 0;
  const t = harness();
  t.ctx.io.exec = async (cmd, args) => {
    const k = [cmd, ...args].join(' ');
    t.calls.push(k);
    if (k === 'claude mcp list') return { status: 0, stderr: '', stdout: listed++ === 0 ? '' : 'composio: https://connect.composio.dev/mcp (HTTP) - ✔ Connected' };
    return { status: 0, stdout: '', stderr: '' };
  };
  const r = await steps.handlers().composio_login(t.ctx);
  assert.equal(r.ok, true, r.reason);
  assert.ok(t.calls.some((c) => c.startsWith('claude mcp add --scope user --transport http composio ')));
  assert.deepEqual(t.interactive, ['claude mcp login composio --no-browser']);
});

test('S08: tailscale up then Running+Online', async () => {
  const t = harness({ exec: { 'tailscale status --json': { stdout: JSON.stringify({ BackendState: 'Running', Self: { Online: true } }) } } });
  const r = await steps.handlers().tailscale_login(t.ctx);
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(t.interactive, ['tailscale up']);
});

test('guide stubs (S07, S09–S15): confirm → ok with 1 input; anything else → not done', async () => {
  const h = steps.handlers();
  for (const key of ['composio_connections', 'messages_automation', 'messages_full_disk_access', 'tailscale_admin', 'phone_tailscale', 'desktop_block', 'desktop_filesystem_approval', 'obsidian_vault']) {
    const yes = harness({ lines: ['y'] });
    assert.deepEqual(await h[key](yes.ctx), { ok: true, inputs: 1 }, key);
    const no = harness({ lines: [''] });
    assert.equal((await h[key](no.ctx)).ok, false, key);
  }
});
