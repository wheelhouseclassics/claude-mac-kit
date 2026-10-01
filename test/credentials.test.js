'use strict';
// G4.1 — saveSecret(): tmp+rename at 0600, file/key contract, argv refusal, echo-off prompt,
// keep/replace on an existing file, and redact() for URLs and error bodies.
const test = require('node:test');
const assert = require('node:assert/strict');
// Telegram-shaped fake, assembled at runtime so the secret scanner never sees a token literal.
const FAKE_TG = ['123456789', 'AA' + 'Hdq7'.repeat(8)].join(':');
const fs = require('fs');
const path = require('path');
const { PassThrough } = require('stream');
const { tmpdir } = require('./helpers');
const cred = require('../cli/lib/credentials');

const POSIX = process.platform !== 'win32';

function fresh() { return path.join(tmpdir('kit-cred-'), 'credentials'); }

test('writes via tmp + rename, mode 0600, exact JSON', (t) => {
  const dir = fresh();
  const renames = [];
  const chmods = [];
  const realRename = fs.renameSync;
  const realChmod = fs.chmodSync;
  t.mock.method(fs, 'renameSync', (a, b) => { renames.push([a, b]); return realRename(a, b); });
  t.mock.method(fs, 'chmodSync', (p, m) => { chmods.push([p, m]); return realChmod(p, m); });
  const r = cred.saveSecret({ dir, name: 'telegram', values: { token: FAKE_TG, userId: '987654' } });
  assert.equal(r.action, 'written');
  const file = path.join(dir, 'telegram.json');
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { token: FAKE_TG, userId: '987654' });
  assert.equal(renames.length, 1, 'exactly one rename');
  assert.equal(renames[0][1], file);
  assert.notEqual(renames[0][0], file, 'written to a temp name first');
  assert.ok(path.dirname(renames[0][0]) === dir, 'temp lives in the same dir (atomic rename)');
  assert.ok(chmods.some(([p, m]) => m === 0o600), 'chmod 0600 applied');
  if (POSIX) assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.deepEqual(fs.readdirSync(dir), ['telegram.json'], 'no temp file left behind');
});

test('enforces the frozen file/key contract', () => {
  const dir = fresh();
  assert.deepEqual(Object.keys(cred.CONTRACT).sort(), ['airtable', 'gateway', 'imessage-contacts', 'marketcheck', 'telegram']);
  assert.throws(() => cred.saveSecret({ dir, name: 'github', values: { token: 'x' } }), /unknown credential file/);
  assert.throws(() => cred.saveSecret({ dir, name: 'telegram', values: { token: 'x' } }), /missing key.*userId/);
  assert.throws(() => cred.saveSecret({ dir, name: 'airtable', values: { pat: 'patX', workspaceId: 'wspX', extra: 1 } }), /unexpected key.*extra/);
  assert.throws(() => cred.saveSecret({ dir, name: 'marketcheck', values: { api_key: '', base_url: 'https://api.marketcheck.com' } }), /empty value.*api_key/);
  // imessage-contacts: free alias map, values must be E.164
  assert.equal(cred.saveSecret({ dir, name: 'imessage-contacts', values: { mike: '+17605551234' } }).action, 'written');
  assert.throws(() => cred.saveSecret({ dir, name: 'imessage-contacts', values: { mike: '760-555-1234' }, force: true }), /E\.164/);
});

test('refuses secrets passed on argv', () => {
  for (const argv of [
    ['setup', '--token', 'abc'],
    ['setup', '--api-key=abc'],
    ['setup', '--pat', 'patABC.def'],
    ['setup', '--auth-token', 'sk-or-v1-abc'],
    ['setup', 'sk-or-v1-0123456789abcdef'],
    ['setup', 'patAbCdEfGhIjKlMn.0123456789abcdef0123456789abcdef'],
    ['setup', FAKE_TG],
  ]) assert.throws(() => cred.refuseArgvSecrets(argv), /never on the command line/, argv.join(' '));
  assert.doesNotThrow(() => cred.refuseArgvSecrets(['setup', '--step', 'S03', '--force']));
});

test('prompt is echo-off: typed characters never reach the output stream', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  let shown = '';
  output.on('data', (d) => { shown += d.toString(); });
  const p = cred.promptHidden('Bot token: ', { input, output });
  input.write('s3cr3t-value\n');
  assert.equal(await p, 's3cr3t-value');
  assert.match(shown, /Bot token: /);
  assert.doesNotMatch(shown, /s3cr3t/);
});

test('existing file: keep or replace; non-interactive needs --force', async () => {
  const dir = fresh();
  cred.saveSecret({ dir, name: 'marketcheck', values: { api_key: 'OLDKEY12345', base_url: 'https://api.marketcheck.com' } });
  const next = { api_key: 'NEWKEY67890', base_url: 'https://api.marketcheck.com' };
  assert.throws(() => cred.saveSecret({ dir, name: 'marketcheck', values: next }), /exists.*--force/);
  const file = path.join(dir, 'marketcheck.json');
  assert.match(fs.readFileSync(file, 'utf8'), /OLDKEY/);
  // interactive: an injected chooser decides
  assert.equal(cred.saveSecret({ dir, name: 'marketcheck', values: next, choose: () => 'keep' }).action, 'kept');
  assert.match(fs.readFileSync(file, 'utf8'), /OLDKEY/);
  assert.equal(cred.saveSecret({ dir, name: 'marketcheck', values: next, choose: () => 'replace' }).action, 'written');
  assert.match(fs.readFileSync(file, 'utf8'), /NEWKEY/);
  assert.equal(cred.saveSecret({ dir, name: 'marketcheck', values: { ...next, api_key: 'FORCEDKEY1' }, force: true }).action, 'written');
  if (POSIX) assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

test('redact() strips api_key / token / pat from URLs and error bodies', () => {
  const cases = [
    ['GET https://api.marketcheck.com/v2/decode/car/1HGCM/specs?api_key=MCKEYabcdef123&x=1', 'MCKEYabcdef123'],
    [`https://api.telegram.org/bot${FAKE_TG}/getMe`, FAKE_TG.split(':')[1]],
    ['{"error":"bad","token":"tok_SECRET99","ok":false}', 'tok_SECRET99'],
    ['Authorization: Bearer patAbCdEfGhIjKlMn.0123456789abcdef', 'patAbCdEfGhIjKlMn'],
    ['{"pat": "patZZZ.yyy", "workspaceId": "wspABC"}', 'patZZZ'],
    ['request failed: auth_token=sk-or-v1-deadbeefcafe', 'sk-or-v1-deadbeefcafe'],
  ];
  for (const [input, secret] of cases) {
    const out = cred.redact(input);
    assert.ok(!out.includes(secret), `leaked in: ${out}`);
    assert.match(out, /REDACTED/);
  }
  assert.match(cred.redact('{"pat": "patZZZ.yyy", "workspaceId": "wspABC"}'), /wspABC/, 'non-secret fields survive');
  assert.equal(cred.redact('plain text'), 'plain text');
});

test('leakCheck: flags a log that contains the first 8 chars of any stored secret', () => {
  const fs = require('fs'); const os = require('os'); const path = require('path');
  const { saveSecret, leakCheck } = require('../cli/lib/credentials');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leak-'));
  const key = 'MCKEY' + 'abcdef123456';
  saveSecret({ dir, name: 'marketcheck', values: { api_key: key, base_url: 'https://api.marketcheck.com' } });
  const clean = leakCheck(dir, 'decode 200 api_key=REDACTED');
  assert.deepEqual(clean, [{ file: 'marketcheck.json', key: 'api_key', leaked: false }]);
  assert.equal(leakCheck(dir, `GET ...?api_key=${key.slice(0, 8)}`)[0].leaked, true);
});
