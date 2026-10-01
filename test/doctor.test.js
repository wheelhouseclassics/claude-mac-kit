'use strict';
// G4.3 (sim) — doctor against ONE injected probe adapter (`io`): every frozen row present;
// applicable red → exit 1; `na` → exit 0; imessage rows `na` (Phase 6 stubs, and when
// MESSAGES_SIGNED_IN=0); `claude mcp list` "Needs authentication"/"Disabled for this project" → red,
// never green; keychain-unavailable auth status → `na` "run in GUI Terminal".
const test = require('node:test');
const assert = require('node:assert/strict');
// Telegram-shaped fake, assembled at runtime so the secret scanner never sees a token literal.
const FAKE_TG = ['123456789', 'AA' + 'Hdq7'.repeat(8)].join(':');
const FAKE_MC = 'MCKEY' + 'abcdef123';
const { ROOT } = require('./helpers');
const { loadManifest } = require('../cli/lib/manifest');
const doctor = require('../cli/lib/doctor');

const MANIFEST = loadManifest(ROOT);
const HOME = '/Users/boss';
const C = `${HOME}/.claude`;

const MCP_GREEN = [
  'Checking MCP server health...',
  '',
  'claude.ai Airtable: https://mcp.airtable.com/mcp - ✔ Connected',
  'claude.ai MarketCheck: https://mcp.marketcheck.com/mcp - ✔ Connected',
  'claude.ai Gmail: https://gmail.mcp.claude.com/mcp - ✔ Connected',
  'composio: https://connect.composio.dev/mcp (HTTP) - ✔ Connected',
].join('\n');

// A healthy Mac. Each test mutates a copy.
function world(over = {}) {
  const files = {
    [`${C}/credentials/telegram.json`]: JSON.stringify({ token: FAKE_TG, userId: '42' }),
    [`${C}/credentials/marketcheck.json`]: JSON.stringify({ api_key: FAKE_MC, base_url: 'https://api.marketcheck.com' }),
    [`${C}/credentials/airtable.json`]: JSON.stringify({ pat: 'patAbCdEfGhIjKlMn.0123456789abcdef', workspaceId: 'wspAbCdEfGhIjKlMn' }),
    [`${C}/settings.json`]: JSON.stringify({ hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: '$HOME/.claude-kit/venv/bin/python $HOME/.claude/hooks/auto-md.py' }] }] } }),
    [`${C}/hooks/auto-md.py`]: '# hook',
    '/Applications/Claude.app': '',
  };
  for (const s of MANIFEST.skills) files[`${C}/skills/${s.name}/SKILL.md`] = `# ${s.name}`;
  const vroot = MANIFEST.vault.root.replace('~', HOME);
  for (const f of MANIFEST.vault.folders) files[`${vroot}/${f}`] = '';
  const w = {
    files,
    env: { HOME, TERM_PROGRAM: 'Apple_Terminal' },
    plugins: MANIFEST.plugins.map((p) => ({ id: p.id, enabled: true })),
    authStatus: { status: 0, stdout: JSON.stringify({ loggedIn: true, subscriptionType: 'max', authMethod: 'claude.ai' }), stderr: '' },
    mcpList: MCP_GREEN,
    tailscale: { BackendState: 'Running', Self: { Online: true } },
    git: { 'user.name': 'Boss', 'user.email': 'boss@example.com' },
    http: {},
    throwOn: null,
    ...over,
  };
  return w;
}

function io(w) {
  const calls = [];
  return {
    calls,
    env: w.env,
    home: HOME,
    exists: (p) => Object.keys(w.files).some((f) => f === p || f.startsWith(p + '/')),
    readFile: (p) => { if (!(p in w.files)) throw new Error('ENOENT ' + p); return w.files[p]; },
    readdir: (p) => [...new Set(Object.keys(w.files).filter((f) => f.startsWith(p + '/')).map((f) => f.slice(p.length + 1).split('/')[0]))],
    exec: async (cmd, args, opts) => {
      calls.push({ cmd, args, opts });
      const line = [cmd, ...args].join(' ');
      if (w.throwOn && line.includes(w.throwOn)) throw new Error(`timed out after ${opts?.timeout}ms: GET ...?api_key=${FAKE_MC}`);
      if (line === 'claude auth status --json') return w.authStatus;
      if (line === 'claude plugin list --json') return { status: 0, stdout: JSON.stringify(w.plugins), stderr: '' };
      if (line === 'claude mcp list') return { status: 0, stdout: w.mcpList, stderr: '' };
      if (line === 'bun --version') return w.noBun ? { status: 127, stdout: '', stderr: 'not found' } : { status: 0, stdout: '1.2.3', stderr: '' };
      if (cmd === 'git' && args[0] === 'config') { const v = w.git[args[2]]; return v ? { status: 0, stdout: v + '\n', stderr: '' } : { status: 1, stdout: '', stderr: '' }; }
      if (line === 'tailscale status --json') return { status: 0, stdout: JSON.stringify(w.tailscale), stderr: '' };
      return { status: 127, stdout: '', stderr: `unexpected ${line}` };
    },
    http: async (url, opts) => {
      calls.push({ http: url, opts });
      if (w.throwOn && url.includes(w.throwOn)) throw new Error(`timed out: ${url}`);
      for (const [frag, res] of Object.entries(w.http)) if (url.includes(frag)) return res;
      if (url.includes('api.telegram.org')) return { status: 200, body: { ok: true, result: { username: 'boss_bot' } } };
      if (url.includes('marketcheck.com')) return { status: 200, body: { make: 'Honda' } };
      if (url.includes('/v0/meta/whoami')) return { status: 200, body: { id: 'usrX' } };
      if (url.includes('/v0/meta/bases')) return { status: 200, body: { bases: [] } };
      if (url.endsWith('/models')) return { status: 200, body: { data: [] } };
      return { status: 404, body: {} };
    },
  };
}

const run = (w) => doctor.run({ io: io(w), manifest: MANIFEST, timeoutMs: 5000 });
const row = (rep, id) => rep.rows.find((r) => r.id === id);

test('healthy machine: all 18 rows present, applicable rows green, imessage rows na, exit 0', async () => {
  const rep = await run(world());
  assert.deepEqual(rep.rows.map((r) => r.id), doctor.ROWS);
  for (const r of rep.rows) {
    if (r.id.startsWith('imessage_')) assert.equal(r.status, 'na', r.id);
    else assert.equal(r.status, 'green', `${r.id}: ${r.reason}`);
  }
  assert.equal(rep.exitCode, 0);
});

test('imessage rows na when MESSAGES_SIGNED_IN=0, and TCC rows show host app + session type', async () => {
  const w = world({ env: { HOME, TERM_PROGRAM: 'Apple_Terminal', MESSAGES_SIGNED_IN: '0', SSH_CONNECTION: '1.2.3.4 5 6.7.8.9 22' } });
  const rep = await run(w);
  for (const id of ['imessage_full_disk_access', 'imessage_automation', 'imessage_signed_in']) {
    const r = row(rep, id);
    assert.equal(r.status, 'na');
    assert.match(r.reason, /Messages/);
    assert.match(r.detail, /host: Apple_Terminal/);
    assert.match(r.detail, /session: SSH/);
  }
  assert.equal(rep.exitCode, 0);
  assert.match(row(await run(world()), 'imessage_automation').detail, /session: Aqua/);
});

test('"Needs authentication" and "Disabled for this project" map to red, never green → exit 1', async () => {
  const w = world({
    mcpList: [
      'claude.ai Airtable: https://mcp.airtable.com/mcp - Disabled for this project',
      'claude.ai MarketCheck: https://mcp.marketcheck.com/mcp - ✔ Connected',
      'composio: https://connect.composio.dev/mcp (HTTP) - ! Needs authentication',
    ].join('\n'),
  });
  const rep = await run(w);
  assert.equal(row(rep, 'airtable_mcp').status, 'red');
  assert.match(row(rep, 'airtable_mcp').reason, /Disabled for this project/);
  assert.equal(row(rep, 'composio_mcp').status, 'red');
  assert.match(row(rep, 'composio_mcp').reason, /Needs authentication/);
  assert.equal(row(rep, 'marketcheck_connector').status, 'green');
  assert.equal(rep.exitCode, 1);
  // a server missing from the list entirely is red too
  const gone = await run(world({ mcpList: 'claude.ai Airtable: x - ✔ Connected' }));
  assert.equal(row(gone, 'composio_mcp').status, 'red');
  assert.equal(row(gone, 'marketcheck_connector').status, 'red');
});

test('mcp list is run from $HOME with a per-probe timeout', async () => {
  const i = io(world());
  await doctor.run({ io: i, manifest: MANIFEST, timeoutMs: 1234, mcpTimeoutMs: 4321 });
  const mcp = i.calls.find((c) => c.cmd === 'claude' && c.args.join(' ') === 'mcp list');
  assert.equal(mcp.opts.cwd, HOME);
  assert.equal(mcp.opts.timeout, 4321); // own budget: it health-checks every server
  assert.ok(i.calls.every((c) => (c.opts?.timeout ?? 0) > 0), 'every probe carries a timeout');
});

test('keychain unavailable → claude_login_max na "run in GUI Terminal" (not red); exit 0', async () => {
  const w = world({
    env: { HOME, SSH_CONNECTION: '1 2 3 4' },
    authStatus: { status: 1, stdout: '', stderr: 'Error: Keychain access denied: User interaction is not allowed.' },
  });
  const rep = await run(w);
  const r = row(rep, 'claude_login_max');
  assert.equal(r.status, 'na');
  assert.match(r.reason, /run in GUI Terminal/);
  assert.match(r.detail, /session: SSH/);
  assert.equal(rep.exitCode, 0);
});

test('logged in but not max → red; logged out → red', async () => {
  const pro = await run(world({ authStatus: { status: 0, stdout: JSON.stringify({ loggedIn: true, subscriptionType: 'pro' }), stderr: '' } }));
  assert.equal(row(pro, 'claude_login_max').status, 'red');
  assert.match(row(pro, 'claude_login_max').reason, /pro/);
  const out = await run(world({ authStatus: { status: 1, stdout: JSON.stringify({ loggedIn: false }), stderr: '' } }));
  assert.equal(row(out, 'claude_login_max').status, 'red');
});

test('gateway mode (A-P4-1): gateway.json + GET /models 200 → green; 401 → red', async () => {
  const w = world({ authStatus: { status: 1, stdout: JSON.stringify({ loggedIn: false }), stderr: '' } });
  w.files[`${C}/credentials/gateway.json`] = JSON.stringify({ base_url: 'https://openrouter.ai/api/v1', auth_token: 'sk-or-v1-deadbeefcafe' });
  const ok = await run(w);
  assert.equal(row(ok, 'claude_login_max').status, 'green');
  assert.match(row(ok, 'claude_login_max').reason, /gateway/);
  w.http = { '/models': { status: 401, body: { error: 'bad key sk-or-v1-deadbeefcafe' } } };
  const bad = await run(w);
  assert.equal(row(bad, 'claude_login_max').status, 'red');
  assert.ok(!JSON.stringify(bad).includes('deadbeefcafe'), 'token redacted from the report');
});

test('A-P4-2: *@synced plugins and skills/synced are ignored; a missing manifest plugin/skill is red', async () => {
  const w = world();
  w.plugins.push({ id: 'something@synced', enabled: true });
  w.files[`${C}/skills/synced/foo/SKILL.md`] = '# synced';
  w.files[`${C}/skills/learned/.keep`] = ''; // CLI-created empty dir, no SKILL.md
  const rep = await run(w);
  assert.equal(row(rep, 'plugins_match_manifest').status, 'green');
  assert.equal(row(rep, 'skills_match_manifest').status, 'green');

  const w2 = world();
  w2.plugins = w2.plugins.slice(1);
  delete w2.files[`${C}/skills/${MANIFEST.skills[0].name}/SKILL.md`];
  const rep2 = await run(w2);
  assert.equal(row(rep2, 'plugins_match_manifest').status, 'red');
  assert.match(row(rep2, 'plugins_match_manifest').reason, new RegExp(MANIFEST.plugins[0].name));
  assert.equal(row(rep2, 'skills_match_manifest').status, 'red');
  assert.match(row(rep2, 'skills_match_manifest').reason, new RegExp(MANIFEST.skills[0].name));
});

test('missing credential file, bad workspace prefix, probe timeout → red with redacted reason', async () => {
  const w = world({ throwOn: 'marketcheck.com' });
  delete w.files[`${C}/credentials/telegram.json`];
  w.files[`${C}/credentials/airtable.json`] = JSON.stringify({ pat: 'patAbCdEfGhIjKlMn.0123456789abcdef', workspaceId: 'appWRONG' });
  const rep = await run(w);
  assert.equal(row(rep, 'telegram_getme').status, 'red');
  assert.match(row(rep, 'telegram_getme').reason, /S03/);
  assert.equal(row(rep, 'airtable_pat').status, 'red');
  assert.match(row(rep, 'airtable_pat').reason, /wsp/);
  const mc = row(rep, 'marketcheck_vin_decode');
  assert.equal(mc.status, 'red');
  assert.match(mc.reason, /timed out/);
  assert.ok(!JSON.stringify(rep).includes(FAKE_MC), 'key never in the report');
  assert.equal(rep.exitCode, 1);
});

test('other rows: no bun, no git identity, tailscale stopped, no Desktop, no hook, missing vault folder → red', async () => {
  const w = world({ noBun: true, git: {}, tailscale: { BackendState: 'Stopped', Self: { Online: false } } });
  delete w.files['/Applications/Claude.app'];
  w.files[`${C}/settings.json`] = '{}';
  delete w.files[`${MANIFEST.vault.root.replace('~', HOME)}/wiki`];
  const rep = await run(w);
  for (const id of ['bun_present', 'git_identity', 'tailscale_online', 'desktop_installed', 'hooks_registered', 'vault_folders']) {
    assert.equal(row(rep, id).status, 'red', id);
  }
});

test('format(): one line per row with a status glyph, and a summary', async () => {
  const rep = await run(world());
  const text = doctor.format(rep);
  for (const id of doctor.ROWS) assert.match(text, new RegExp(id));
  assert.match(text, /15 green, 0 red, 3 na/);
});
