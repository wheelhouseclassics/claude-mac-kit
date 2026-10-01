'use strict';
// Secrets: ~/.claude/credentials/<name>.json at mode 600, written tmp+rename (atomic).
// Frozen file/key contract (PLAN "Credential files" + amendment A-P4-1 gateway.json).
// Secrets are only ever read from an echo-off prompt — never argv (shell history, `ps`).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CONTRACT = {
  telegram: ['token', 'userId'],
  marketcheck: ['api_key', 'base_url'],
  airtable: ['pat', 'workspaceId'],
  gateway: ['base_url', 'auth_token'],
  'imessage-contacts': null, // free {alias: e164} map
};
const E164 = /^\+[1-9]\d{6,14}$/;

function credDir(home) { return path.join(home, '.claude', 'credentials'); }

function validate(name, values) {
  if (!Object.prototype.hasOwnProperty.call(CONTRACT, name)) throw new Error(`unknown credential file: ${name}.json`);
  if (!values || typeof values !== 'object') throw new Error(`${name}.json: values must be an object`);
  const keys = CONTRACT[name];
  if (keys === null) {
    for (const [alias, num] of Object.entries(values)) {
      if (!E164.test(String(num))) throw new Error(`${name}.json: "${alias}" must be E.164 (+15551234567)`);
    }
    return;
  }
  for (const k of keys) if (!(k in values)) throw new Error(`${name}.json: missing key ${k}`);
  for (const k of Object.keys(values)) if (!keys.includes(k)) throw new Error(`${name}.json: unexpected key ${k}`);
  for (const k of keys) if (String(values[k]).trim() === '') throw new Error(`${name}.json: empty value for ${k}`);
}

// choose(name) → 'keep' | 'replace'; absent = non-interactive, which needs force to overwrite.
function saveSecret({ dir, name, values, force = false, choose = null }) {
  validate(name, values);
  const file = path.join(dir, `${name}.json`);
  if (fs.existsSync(file) && !force) {
    if (!choose) throw new Error(`${name}.json exists — re-run with --force to replace it`);
    if (choose(name) !== 'replace') return { action: 'kept', file };
  }
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = path.join(dir, `.${name}.json.${crypto.randomBytes(4).toString('hex')}.tmp`);
  try {
    fs.writeFileSync(tmp, JSON.stringify(values, null, 2) + '\n', { mode: 0o600 });
    fs.chmodSync(tmp, 0o600);
    fs.renameSync(tmp, file);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* already gone */ }
    throw e;
  }
  fs.chmodSync(file, 0o600);
  return { action: 'written', file };
}

function loadSecret(dir, name) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8')); } catch { return null; }
}

// Secret-looking values: OpenRouter/Anthropic keys, Airtable PATs, Telegram bot tokens.
const SECRET_VALUE = [/^sk-[A-Za-z0-9_-]{8,}/, /^pat[A-Za-z0-9]{14}\./, /^\d{6,}:[A-Za-z0-9_-]{30,}$/];
const SECRET_FLAG = /^--(token|api[-_]?key|pat|auth[-_]?token|key|secret|password)(=|$)/i;

function refuseArgvSecrets(argv) {
  for (const a of argv) {
    if (SECRET_FLAG.test(a) || SECRET_VALUE.some((re) => re.test(a))) {
      throw new Error('secrets go in at the hidden prompt, never on the command line (shell history keeps them)');
    }
  }
}

// Reads one line without echoing it. Raw mode on a TTY; plain line read on a pipe.
function promptHidden(question, { input = process.stdin, output = process.stdout } = {}) {
  return new Promise((resolve, reject) => {
    output.write(question);
    const raw = Boolean(input.isTTY && input.setRawMode);
    if (raw) input.setRawMode(true);
    let buf = '';
    const cleanup = () => {
      input.removeListener('data', onData);
      if (raw) input.setRawMode(false);
      input.pause();
    };
    function onData(d) {
      for (const ch of d.toString('utf8')) {
        if (ch === '\n' || ch === '\r') { cleanup(); output.write('\n'); resolve(buf); return; }
        if (ch === '\u0003') { cleanup(); output.write('\n'); reject(new Error('cancelled')); return; }
        if (ch === '\u007f' || ch === '\b') buf = buf.slice(0, -1);
        else buf += ch;
      }
    }
    input.on('data', onData);
    input.resume();
  });
}

const R = 'REDACTED';
function redact(text) {
  if (text === null || text === undefined) return text;
  return String(text)
    .replace(/([?&](?:api_key|apikey|token|pat|key|auth_token|access_token)=)[^&\s"'#]+/gi, `$1${R}`)
    .replace(/\bbot\d+:[A-Za-z0-9_-]+/g, `bot${R}`)
    .replace(/("(?:api_key|apiKey|token|pat|auth_token|access_token|password|secret)"\s*:\s*")[^"]*"/g, `$1${R}"`)
    .replace(/(Bearer\s+)[^\s"']+/gi, `$1${R}`)
    .replace(/\b((?:api_key|auth_token|access_token|token|pat)=)[^\s&"']+/gi, `$1${R}`)
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, R)
    .replace(/\bpat[A-Za-z0-9]{14}\.[A-Za-z0-9]+/g, R)
    .replace(/\b\d{6,}:[A-Za-z0-9_-]{30,}/g, R);
}

// G4.4 evidence: does a run log contain the first 8 chars of any stored secret?
const SECRET_KEYS = new Set(['token', 'api_key', 'pat', 'auth_token']);
function leakCheck(dir, text) {
  const out = [];
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { continue; }
    for (const [k, v] of Object.entries(j || {})) {
      if (SECRET_KEYS.has(k) && String(v).length >= 8) out.push({ file: f, key: k, leaked: text.includes(String(v).slice(0, 8)) });
    }
  }
  return out;
}

module.exports = { CONTRACT, credDir, saveSecret, loadSecret, refuseArgvSecrets, promptHidden, redact, leakCheck };
