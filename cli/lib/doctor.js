'use strict';
// `claude-kit doctor` — row ids are FROZEN (PLAN "Doctor row ids", 18).
// Every probe goes through ONE adapter (`io`: exec/http/exists/readFile/readdir/env/home) so the
// whole doctor runs against fixtures in test/doctor.test.js. Rows report green / red / na + reason;
// red on any row → exit 1; na keeps exit 0. `claude mcp list` is TEXT (no --json; exits 0 even on
// "Needs authentication") and is run from $HOME so project-scoped servers do not leak in.
const { redact } = require('./credentials');

const ROWS = [
  'claude_login_max', 'desktop_installed', 'plugins_match_manifest', 'skills_match_manifest',
  'hooks_registered', 'bun_present', 'git_identity', 'telegram_getme', 'marketcheck_vin_decode',
  'marketcheck_connector', 'composio_mcp', 'airtable_pat', 'airtable_mcp', 'tailscale_online',
  'vault_folders', 'imessage_full_disk_access', 'imessage_automation', 'imessage_signed_in',
];
const TEST_VIN = '1HGCM82633A004352'; // public sample VIN (2003 Honda Accord)
const AIRTABLE = 'https://api.airtable.com';

const green = (reason) => ({ status: 'green', reason });
const red = (reason) => ({ status: 'red', reason });
const na = (reason) => ({ status: 'na', reason });

function sessionInfo(env) {
  const host = env.TERM_PROGRAM || env.__CFBundleIdentifier || 'unknown';
  const session = env.SSH_CONNECTION || env.SSH_TTY ? 'SSH' : 'Aqua';
  return `host: ${host}, session: ${session}`;
}

function parseJson(t) { try { return JSON.parse(String(t || '').trim()); } catch { return null; } }

function creds(c, name) {
  try { return JSON.parse(c.io.readFile(`${c.home}/.claude/credentials/${name}.json`)); } catch { return null; }
}

// "<name>: <url> - <status>" → status text, or null when the server is absent
function mcpStatus(text, name) {
  for (const line of String(text || '').split(/\r?\n/)) {
    if (line.startsWith(name + ':')) {
      const i = line.lastIndexOf(' - ');
      return i >= 0 ? line.slice(i + 3).trim() : line.slice(name.length + 1).trim();
    }
  }
  return null;
}
function mcpRow(c, name) {
  const s = mcpStatus(c.mcpList, name);
  if (s === null) return red(`${name} not in \`claude mcp list\``);
  return /^[✔✓] Connected$/.test(s) ? green(s) : red(s);
}

const PROBES = {
  async claude_login_max(c) {
    const gw = creds(c, 'gateway');
    if (gw) { // amendment A-P4-1: provider-agnostic gateway
      const r = await c.http(`${gw.base_url.replace(/\/$/, '')}/models`, { headers: { Authorization: `Bearer ${gw.auth_token}` } });
      return r.status === 200 ? green(`gateway ${new URL(gw.base_url).host} answered /models 200`) : red(`gateway /models returned ${r.status}`);
    }
    const r = await c.exec('claude', ['auth', 'status', '--json']);
    const j = parseJson(r.stdout);
    if (!j && /keychain|user interaction is not allowed|security/i.test(r.stderr || '')) {
      return na('login Keychain unavailable in this session — run in GUI Terminal');
    }
    if (!j || !j.loggedIn) return red('not signed in — claude-kit setup --step S01');
    if (j.subscriptionType !== 'max') return red(`signed in, but subscription is ${j.subscriptionType || 'unknown'}, not max`);
    return green('signed in, max');
  },
  async desktop_installed(c) {
    return c.io.exists('/Applications/Claude.app') ? green('/Applications/Claude.app') : red('Claude.app not in /Applications');
  },
  async plugins_match_manifest(c) {
    const r = await c.exec('claude', ['plugin', 'list', '--json']);
    const list = parseJson(r.stdout);
    if (!Array.isArray(list)) return red('`claude plugin list --json` unreadable');
    const have = new Map(list.filter((p) => p && p.id && !/@(synced|skills-dir)$/.test(p.id)).map((p) => [p.id, p]));
    const missing = c.manifest.plugins.filter((p) => !have.has(p.id)).map((p) => p.name);
    const disabled = c.manifest.plugins.filter((p) => have.get(p.id)?.enabled === false).map((p) => p.name);
    if (missing.length) return red(`missing: ${missing.join(', ')}`);
    if (disabled.length) return green(`${c.manifest.plugins.length} installed (${disabled.length} disabled by you: ${disabled.join(', ')})`);
    return green(`${c.manifest.plugins.length} installed`);
  },
  async skills_match_manifest(c) {
    const dir = `${c.home}/.claude/skills`;
    const want = new Set(c.manifest.skills.map((s) => s.name));
    const missing = [...want].filter((n) => !c.io.exists(`${dir}/${n}/SKILL.md`));
    let extra = [];
    try {
      extra = c.io.readdir(dir).filter((d) => d !== 'synced' && !want.has(d) && c.io.exists(`${dir}/${d}/SKILL.md`));
    } catch { /* no dir → everything missing */ }
    if (missing.length) return red(`missing: ${missing.join(', ')}`);
    return green(`${want.size} kit skills${extra.length ? ` (+${extra.length} of your own)` : ''}`);
  },
  async hooks_registered(c) {
    let s = {};
    try { s = parseJson(c.io.readFile(`${c.home}/.claude/settings.json`)) || {}; } catch { return red('no ~/.claude/settings.json — claude-kit install'); }
    const ok = c.manifest.hooks.every((h) => (s.hooks?.[h.event] || []).some((g) => (g.hooks || []).some((x) => String(x.command || '').includes(h.install.split('/').pop()))))
      && c.manifest.hooks.every((h) => c.io.exists(h.install.replace('~', c.home)));
    return ok ? green(c.manifest.hooks.map((h) => `${h.event}:${h.name}`).join(', ')) : red('kit hook missing from settings.json — claude-kit install --only settings');
  },
  async bun_present(c) {
    const r = await c.exec('bun', ['--version']);
    return r.status === 0 ? green(`bun ${r.stdout.trim()}`) : red('bun not on PATH');
  },
  async git_identity(c) {
    const name = (await c.exec('git', ['config', '--global', 'user.name'])).stdout?.trim();
    const email = (await c.exec('git', ['config', '--global', 'user.email'])).stdout?.trim();
    return name && email ? green(`${name} <${email}>`) : red('git user.name/user.email unset — claude-kit setup --step S02');
  },
  async telegram_getme(c) {
    const t = creds(c, 'telegram');
    if (!t) return red('no telegram.json — claude-kit setup --step S03');
    const r = await c.http(`https://api.telegram.org/bot${t.token}/getMe`);
    return r.status === 200 && r.body?.ok ? green(`@${r.body.result?.username}`) : red(`getMe returned ${r.status}`);
  },
  async marketcheck_vin_decode(c) {
    const m = creds(c, 'marketcheck');
    if (!m) return red('no marketcheck.json — claude-kit setup --step S04');
    const base = (m.base_url || 'https://api.marketcheck.com').replace(/\/$/, '');
    const r = await c.http(`${base}/v2/decode/car/${TEST_VIN}/specs?api_key=${encodeURIComponent(m.api_key)}`);
    return r.status === 200 ? green('VIN decode 200') : red(`VIN decode returned ${r.status}`);
  },
  async marketcheck_connector(c) { return mcpRow(c, 'claude.ai MarketCheck'); },
  async composio_mcp(c) { return mcpRow(c, 'composio'); },
  async airtable_pat(c) {
    const a = creds(c, 'airtable');
    if (!a) return red('no airtable.json — claude-kit setup --step S05');
    if (!/^wsp[A-Za-z0-9]{14}$/.test(a.workspaceId || '')) return red('workspaceId must start with wsp (copy it from the workspace URL)');
    const h = { headers: { Authorization: `Bearer ${a.pat}` } };
    const who = await c.http(`${AIRTABLE}/v0/meta/whoami`, h);
    if (who.status !== 200) return red(`whoami returned ${who.status}`);
    const bases = await c.http(`${AIRTABLE}/v0/meta/bases`, h);
    return bases.status === 200 ? green('whoami 200, bases 200') : red(`bases returned ${bases.status} — token lacks schema.bases:read`);
  },
  async airtable_mcp(c) { return mcpRow(c, 'claude.ai Airtable'); },
  async tailscale_online(c) {
    const j = parseJson((await c.exec('tailscale', ['status', '--json'])).stdout);
    if (!j) return red('tailscale status unreadable');
    return j.BackendState === 'Running' && j.Self?.Online ? green('Running, online') : red(`${j.BackendState || 'unknown'}${j.Self?.Online ? '' : ', offline'}`);
  },
  async vault_folders(c) {
    const root = c.manifest.vault.root.replace('~', c.home);
    const missing = c.manifest.vault.folders.filter((f) => !c.io.exists(`${root}/${f}`));
    return missing.length ? red(`missing: ${missing.join(', ')}`) : green(`${c.manifest.vault.folders.length} folders in ${c.manifest.vault.root}`);
  },
  // Phase 6 replaces these three stubs with real TCC probes.
  async imessage_full_disk_access(c) { return imessageStub(c); },
  async imessage_automation(c) { return imessageStub(c); },
  async imessage_signed_in(c) { return imessageStub(c); },
};
const TCC_ROWS = new Set(['claude_login_max', 'imessage_full_disk_access', 'imessage_automation', 'imessage_signed_in']);

function imessageStub(c) {
  if (c.io.env.MESSAGES_SIGNED_IN === '0') return na('Messages not signed in on this Mac');
  return na('iMessage probes land in Phase 6 (Messages)');
}

async function run({ io, manifest, timeoutMs = 15000, mcpTimeoutMs = 90000 }) {
  const home = io.home || io.env.HOME;
  const c = {
    io, manifest, home,
    exec: (cmd, args, o = {}) => io.exec(cmd, args, { cwd: home, timeout: o.timeout || timeoutMs }),
    http: (url, opts = {}) => io.http(url, { ...opts, timeout: timeoutMs }),
  };
  c.mcpList = null;
  // `mcp list` health-checks every server, so it gets a longer budget than single probes.
  try { c.mcpList = (await c.exec('claude', ['mcp', 'list'], { timeout: mcpTimeoutMs })).stdout; } catch (e) { c.mcpList = ''; c.mcpError = e.message; }
  const rows = [];
  for (const id of ROWS) {
    let r;
    try { r = await PROBES[id](c); } catch (e) { r = red(e.message); }
    if (c.mcpError && /mcp/.test(id) && r.status === 'red') r.reason += ` (${c.mcpError})`;
    const out = { id, status: r.status, reason: redact(r.reason) };
    if (TCC_ROWS.has(id)) out.detail = sessionInfo(io.env);
    rows.push(out);
  }
  return { rows, exitCode: rows.some((r) => r.status === 'red') ? 1 : 0 };
}

const GLYPH = { green: '✔', red: '✘', na: '–' };
function format(rep) {
  const w = Math.max(...rep.rows.map((r) => r.id.length));
  const lines = rep.rows.map((r) => `${GLYPH[r.status]} ${r.id.padEnd(w)}  ${r.reason}${r.detail ? `  [${r.detail}]` : ''}`);
  const n = (s) => rep.rows.filter((r) => r.status === s).length;
  lines.push('', `${n('green')} green, ${n('red')} red, ${n('na')} na`);
  return lines.join('\n');
}

module.exports = { ROWS, run, format, mcpStatus, sessionInfo, TEST_VIN };
