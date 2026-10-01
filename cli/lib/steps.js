'use strict';
// Real handlers for `claude-kit setup` (PLAN Phase 4, S01–S15). Each handler gets
// ctx = {home, log, io (probe adapter), prompt: {hidden, line}, interactive(cmd, args) → exit code,
// force} and returns {ok, inputs, reason?}. A secret is verified live BEFORE it is saved; every
// reason passes the redactor. S07 and S09–S15 are guide steps: the user confirms, counted once.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { saveSecret, credDir, redact } = require('./credentials');
const settings = require('./settings');
const { mcpStatus, TEST_VIN } = require('./doctor');

const GATEWAY_DEFAULT = 'https://openrouter.ai/api/v1';
const MARKETCHECK = 'https://api.marketcheck.com';
const AIRTABLE = 'https://api.airtable.com';
const COMPOSIO_URL = 'https://connect.composio.dev/mcp';
const AIRTABLE_SCOPES = ['schema.bases:read', 'schema.bases:write', 'data.records:read', 'data.records:write'];

const fail = (reason) => ({ ok: false, reason });
const isSsh = (env) => Boolean(env.SSH_CONNECTION || env.SSH_TTY);
const parseJson = (t) => { try { return JSON.parse(String(t || '').trim()); } catch { return null; } };

// tmp+rename at 0600 for the files that are not credentials/*.json (channel .env, settings.json).
function writePrivate(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, content, { mode: 0o600 });
  fs.chmodSync(tmp, 0o600);
  fs.renameSync(tmp, file);
  fs.chmodSync(file, 0o600);
}

function save(ctx, name, values) {
  return saveSecret({ dir: credDir(ctx.home), name, values, force: true });
}

// Existing file + no --force → ask before replacing. Returns true when the user keeps it.
async function keepExisting(ctx, name) {
  if (ctx.force || !fs.existsSync(path.join(credDir(ctx.home), `${name}.json`))) return false;
  const a = await ctx.prompt.line(`  ${name}.json already exists — replace it? [y/N] `);
  return !/^y/i.test(a.trim());
}

async function claude_login(ctx) {
  const choice = (await ctx.prompt.line('  Claude subscription sign-in (s) or a gateway key such as OpenRouter (g)? [s] ')).trim().toLowerCase();
  if (choice.startsWith('g')) {
    const base = ((await ctx.prompt.line(`  Gateway base URL [${GATEWAY_DEFAULT}]: `)).trim() || GATEWAY_DEFAULT).replace(/\/$/, '');
    const token = (await ctx.prompt.hidden('  Gateway key (hidden): ')).trim();
    if (!token) return fail('no key entered');
    const r = await ctx.io.http(`${base}/models`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.status !== 200) return fail(`gateway ${base}/models returned ${r.status} — check the key`);
    save(ctx, 'gateway', { base_url: base, auth_token: token });
    const s = settings.read(ctx.home);
    s.env = { ...(s.env || {}), ANTHROPIC_BASE_URL: base, ANTHROPIC_AUTH_TOKEN: token };
    writePrivate(settings.settingsPath(ctx.home), JSON.stringify(s, null, 2) + '\n');
    ctx.log(`  gateway ${new URL(base).host} answered /models 200; settings.json env set`);
    return { ok: true, inputs: 2 };
  }
  if (isSsh(ctx.io.env)) {
    return fail('subscription sign-in must run in the GUI Terminal.app (the login Keychain is unreadable over SSH); headless fallback: `claude setup-token`');
  }
  await ctx.interactive('claude', ['auth', 'login', '--claudeai']);
  const j = parseJson((await ctx.io.exec('claude', ['auth', 'status', '--json'])).stdout);
  if (!j || !j.loggedIn) return fail('still not signed in after `claude auth login`');
  ctx.log(`  signed in (${j.subscriptionType || 'unknown plan'})`);
  return { ok: true, inputs: 1 };
}

async function github_login(ctx) {
  let inputs = 0;
  if ((await ctx.io.exec('gh', ['auth', 'status'])).status !== 0) {
    await ctx.interactive('gh', ['auth', 'login', '--web', '--git-protocol', 'https']);
    inputs++;
    if ((await ctx.io.exec('gh', ['auth', 'status'])).status !== 0) return fail('gh auth status still failing after login');
  }
  const cur = async (k) => (await ctx.io.exec('git', ['config', '--global', k])).stdout?.trim();
  const name = await cur('user.name');
  const email = await cur('user.email');
  if (!name || !email) {
    const u = parseJson((await ctx.io.exec('gh', ['api', 'user'])).stdout);
    if (!u || !u.login) return fail('`gh api user` returned nothing — set git user.name/user.email by hand');
    const want = { 'user.name': name || u.name || u.login, 'user.email': email || u.email || `${u.id}+${u.login}@users.noreply.github.com` };
    for (const [k, v] of Object.entries(want)) {
      if ((await ctx.io.exec('git', ['config', '--global', k, v])).status !== 0) return fail(`git config ${k} failed`);
    }
    ctx.log(`  git identity: ${want['user.name']} <${want['user.email']}>`);
  }
  return { ok: true, inputs: Math.max(inputs, 1) };
}

async function telegram(ctx) {
  if (await keepExisting(ctx, 'telegram')) return { ok: true, inputs: 1 };
  const token = (await ctx.prompt.hidden('  Bot token from @BotFather (hidden): ')).trim();
  const userId = (await ctx.prompt.line('  Your numeric Telegram user id (from @userinfobot): ')).trim();
  if (!/^\d+$/.test(userId)) return fail('the user id is numeric (e.g. 123456789) — ask @userinfobot');
  const r = await ctx.io.http(`https://api.telegram.org/bot${token}/getMe`);
  if (r.status !== 200 || !r.body?.ok) return fail(`Telegram getMe returned ${r.status} — check the token`);
  save(ctx, 'telegram', { token, userId });
  const ch = path.join(ctx.home, '.claude', 'channels', 'telegram');
  writePrivate(path.join(ch, '.env'), `TELEGRAM_BOT_TOKEN=${token}\n`);
  // The plugin defaults to dmPolicy "pairing", which would answer the first "hello" with a code.
  writePrivate(path.join(ch, 'access.json'), JSON.stringify({ dmPolicy: 'allowlist', allowFrom: [userId] }, null, 2) + '\n');
  ctx.log(`  @${r.body.result?.username} verified. Restart \`claude\` or run /reload-plugins; replies arrive only while a \`claude\` session is open.`);
  return { ok: true, inputs: 2 };
}

async function marketcheck_key(ctx) {
  if (await keepExisting(ctx, 'marketcheck')) return { ok: true, inputs: 1 };
  const key = (await ctx.prompt.hidden('  MarketCheck API key (hidden): ')).trim();
  const r = await ctx.io.http(`${MARKETCHECK}/v2/decode/car/${TEST_VIN}/specs?api_key=${encodeURIComponent(key)}`);
  if (r.status !== 200) return fail(`VIN decode returned ${r.status} — check the key`);
  save(ctx, 'marketcheck', { api_key: key, base_url: MARKETCHECK });
  ctx.log('  VIN decode 200');
  return { ok: true, inputs: 1 };
}

async function airtable(ctx) {
  if (await keepExisting(ctx, 'airtable')) return { ok: true, inputs: 1 };
  ctx.log(`  Create a token at https://airtable.com/create/tokens with scopes ${AIRTABLE_SCOPES.join(', ')}`);
  ctx.log('  and under Access choose "grant access to the workspace". The workspace id (wsp…) is in the workspace URL.');
  const pat = (await ctx.prompt.hidden('  Airtable token (hidden): ')).trim();
  const workspaceId = (await ctx.prompt.line('  Workspace id (starts with wsp): ')).trim();
  if (!/^wsp[A-Za-z0-9]{14}$/.test(workspaceId)) return fail('the workspace id starts with wsp and is 17 characters — copy it from the workspace URL');
  const h = { headers: { Authorization: `Bearer ${pat}` } };
  const who = await ctx.io.http(`${AIRTABLE}/v0/meta/whoami`, h);
  if (who.status !== 200) return fail(`whoami returned ${who.status} — check the token`);
  const bases = await ctx.io.http(`${AIRTABLE}/v0/meta/bases`, h);
  if (bases.status !== 200) return fail(`bases returned ${bases.status} — the token lacks schema.bases:read or workspace access`);
  save(ctx, 'airtable', { pat, workspaceId });
  ctx.log('  whoami 200, bases 200');
  return { ok: true, inputs: 2 };
}

async function composio_login(ctx) {
  const list = async () => (await ctx.io.exec('claude', ['mcp', 'list'], { timeout: 90000 })).stdout;
  if (mcpStatus(await list(), 'composio') === null) {
    const r = await ctx.io.exec('claude', ['mcp', 'add', '--scope', 'user', '--transport', 'http', 'composio', COMPOSIO_URL]);
    if (r.status !== 0) return fail(`claude mcp add composio failed: ${r.stderr || r.status}`);
  }
  ctx.log('  Open the printed URL, sign in, then paste the redirect URL back here.');
  await ctx.interactive('claude', ['mcp', 'login', 'composio', '--no-browser']);
  const s = mcpStatus(await list(), 'composio');
  if (!s || !/^[✔✓] Connected$/.test(s)) return fail(`composio is "${s || 'absent'}" in \`claude mcp list\``);
  return { ok: true, inputs: 1 };
}

async function tailscale_login(ctx) {
  await ctx.interactive('tailscale', ['up']);
  const j = parseJson((await ctx.io.exec('tailscale', ['status', '--json'])).stdout);
  if (!j || j.BackendState !== 'Running' || !j.Self?.Online) return fail(`tailscale is ${j?.BackendState || 'unreadable'} — re-run after signing in`);
  return { ok: true, inputs: 1 };
}

// Guide-driven steps: the Guide (Phase 7) and PERMISSIONS.md (Phase 6) carry the screens.
const GUIDE = {
  composio_connections: 'In the Composio dashboard, connect Gmail and Google Drive (Guide: "Composio connections").',
  messages_automation: 'Allow Terminal to control Messages — see kit/skills/imessage/PERMISSIONS.md.',
  messages_full_disk_access: 'Give Terminal Full Disk Access — see kit/skills/imessage/PERMISSIONS.md.',
  tailscale_admin: 'Invite Mike as an admin of your tailnet (Guide: "Tailscale").',
  phone_tailscale: 'Install Tailscale on your phone and sign in with the same account (Guide: "Tailscale").',
  desktop_block: 'Open Claude Desktop, sign in, and turn on the connectors (Guide: "Claude Desktop").',
  desktop_filesystem_approval: 'Approve Claude Desktop\'s file access when it asks (Guide: "Claude Desktop").',
  obsidian_vault: 'Open Obsidian and confirm "second-brain" is listed (Guide: "Second brain").',
};
function guideStep(key) {
  return async (ctx) => {
    ctx.log(`  ${GUIDE[key]}`);
    const a = await ctx.prompt.line('  Done? [y/N] ');
    return /^y/i.test(a.trim()) ? { ok: true, inputs: 1 } : fail('not confirmed — re-run this step when it is done');
  };
}

function redacted(fn) {
  return async (ctx) => {
    const r = await fn(ctx);
    return r && r.reason ? { ...r, reason: redact(r.reason) } : r;
  };
}

function handlers() {
  const live = { claude_login, github_login, telegram, marketcheck_key, airtable, composio_login, tailscale_login };
  const out = {};
  for (const [k, fn] of Object.entries(live)) out[k] = redacted(fn);
  for (const k of Object.keys(GUIDE)) out[k] = guideStep(k);
  return out;
}

module.exports = { handlers, writePrivate, AIRTABLE_SCOPES };
