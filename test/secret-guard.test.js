'use strict';
// G1.7 — gitleaks clean on the tree; pre-commit hook rejects each real secret shape in a throwaway clone; Action uses the same toml.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ROOT, run, tmpdir, gitleaksPath, bashPath } = require('./helpers');

const gitleaks = gitleaksPath();
const skip = !gitleaks && 'gitleaks not installed';
const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const alnum = (n, alphabet = ALNUM) => Array.from(crypto.randomBytes(n), (b) => alphabet[b % alphabet.length]).join('');
const hex = (n) => crypto.randomBytes(n / 2).toString('hex');

// Fixtures are generated at runtime so no secret-shaped literal ever lives in the repo.
function fixtures() {
  return {
    anthropic: `ANTHROPIC_API_KEY=sk-ant-api03-${alnum(93, ALNUM + '_-')}AA`,
    telegram: `telegram bot token: 123456789:A${alnum(34)}`,
    airtable_pat: `airtable pat: pat${alnum(14)}.${hex(64)}`,
    tailscale: `tailscale: tskey-auth-k${alnum(9)}CNTRL-${alnum(38)}`,
    // alphabet split in two literals so this line itself is not a 32-char [a-z0-9] run next to "MARKETCHECK"
    marketcheck: `MARKETCHECK_API_KEY=${alnum(32, 'abcdefghijklmnopqrstuvwxyz' + '0123456789')}`,
  };
}

test('gitleaks is clean on the working tree (no false positives from Airtable ids)', { skip }, () => {
  const r = run(gitleaks, ['dir', ROOT, '--config', path.join(ROOT, '.gitleaks.toml'), '--no-banner', '--redact', '--exit-code', '1']);
  assert.equal(r.status, 0, 'gitleaks found leaks:\n' + r.stdout + r.stderr);
});

test('pre-commit hook rejects every real secret shape and accepts a clean commit', { skip }, () => {
  const tmp = tmpdir('kit-secret-');
  const clone = path.join(tmp, 'clone');
  let r = run('git', ['clone', '-q', ROOT, clone]);
  assert.equal(r.status, 0, r.stderr);
  const env = { ...process.env, PATH: path.dirname(gitleaks) + path.delimiter + process.env.PATH, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
  r = run(bashPath(), ['scripts/install-git-hooks.sh'], { cwd: clone, env });
  assert.equal(r.status, 0, 'install-git-hooks.sh failed: ' + r.stderr + r.stdout);
  assert.equal(run('git', ['config', 'core.hooksPath'], { cwd: clone }).stdout.trim(), 'scripts/git-hooks');

  for (const [name, content] of Object.entries(fixtures())) {
    const f = path.join(clone, `leak-${name}.txt`);
    fs.writeFileSync(f, content + '\n');
    run('git', ['add', f], { cwd: clone, env });
    r = run('git', ['commit', '-q', '-m', 'leak ' + name], { cwd: clone, env });
    assert.notEqual(r.status, 0, `commit with ${name} secret must be rejected`);
    run('git', ['reset', '-q'], { cwd: clone, env });
    fs.unlinkSync(f);
  }
  // Airtable ids next to the word airtable must NOT be flagged (allowlist), and a clean commit passes.
  fs.writeFileSync(path.join(clone, 'clean.md'), 'airtable base appABCDEFGHIJKLMN table tblABCDEFGHIJKLMN field fldABCDEFGHIJKLMN record recABCDEFGHIJKLMN\n');
  run('git', ['add', 'clean.md'], { cwd: clone, env });
  r = run('git', ['commit', '-q', '-m', 'clean'], { cwd: clone, env });
  assert.equal(r.status, 0, 'clean commit must pass: ' + r.stderr + r.stdout);
});

test('GitHub Action uses the same .gitleaks.toml', () => {
  const wf = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'gitleaks.yml'), 'utf8');
  assert.ok(wf.includes('.gitleaks.toml'), 'gitleaks.yml must reference .gitleaks.toml');
});
