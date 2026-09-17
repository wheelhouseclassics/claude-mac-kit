'use strict';
// G2.2 / G2.3 / G2.7 — install.sh: shellcheck + bash-3.2 clean, truncation-safe (`main "$@"` last),
// Intel guard that honours Rosetta, CLT pre-check that defers to Homebrew (never the interactive CLT
// installer), and a no-tty + no-cached-sudo fail-fast. All sims run in a throwaway HOME with stubbed
// `sudo`/`xcode-select`/`curl` first on PATH so nothing real is touched and nothing reaches the network.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT, run, tmpdir, bashPath, shellcheckPath } = require('./helpers');

const SCRIPT = path.join(ROOT, 'install.sh');
const buf = fs.readFileSync(SCRIPT);
const src = buf.toString('utf8');
const bash = bashPath();
const MARK = '==>'; // every step prints "==> [step] run|skip|dry-run ..."

const fwd = (p) => p.split(path.sep).join('/');

// Throwaway HOME + stub bin dir FIRST on PATH; every stub appends "<name> <args>" to STUB_LOG.
function sandbox(stubs) {
  const home = tmpdir('kit-install-home-');
  const bin = path.join(home, 'stubbin');
  fs.mkdirSync(bin);
  const log = path.join(home, 'stub.log');
  for (const [name, body] of Object.entries(stubs)) {
    fs.writeFileSync(path.join(bin, name), `#!/bin/bash\nprintf '%s %s\\n' '${name}' "$*" >> "$STUB_LOG"\n${body}\n`, { mode: 0o755 });
  }
  const sep = process.platform === 'win32' ? ';' : ':';
  const env = {
    ...process.env,
    HOME: fwd(home), STUB_LOG: fwd(log), PATH: bin + sep + process.env.PATH,
    KIT_OS_OVERRIDE: 'Darwin', ARCH_OVERRIDE: 'arm64', PROC_TRANSLATED_OVERRIDE: '0',
    https_proxy: 'http://127.0.0.1:1', HTTPS_PROXY: 'http://127.0.0.1:1', http_proxy: 'http://127.0.0.1:1',
  };
  delete env.KIT_TTY; delete env.KIT_EXTRAS; delete env.KIT_DIR; delete env.KIT_REF;
  const readLog = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '');
  const calls = (name) => readLog().split(/\r?\n/).filter((l) => l.startsWith(name + ' ') || l === name);
  const homeEntries = () => fs.readdirSync(home).filter((e) => e !== 'stubbin' && e !== 'stub.log').sort();
  return { home, bin, log, env, readLog, calls, homeEntries };
}
function runInstall(sb, args, extraEnv = {}) {
  const t0 = Date.now();
  const r = run(bash, [SCRIPT, ...args], { env: { ...sb.env, ...extraEnv }, input: '', cwd: ROOT, timeout: 60000 });
  return { ...r, out: (r.stdout || '') + (r.stderr || ''), ms: Date.now() - t0 };
}
const SAFE_STUBS = { sudo: 'exit 1', 'xcode-select': 'echo /Library/Developer/CommandLineTools', curl: 'exit 7' };

// ---------- G2.2 ----------
test('G2.2 shellcheck -s bash install.sh is clean', () => {
  const sc = shellcheckPath();
  assert.ok(sc, 'shellcheck not found: winget install koalaman.shellcheck / brew install shellcheck / apt install shellcheck');
  const r = run(sc, ['-s', 'bash', SCRIPT]);
  assert.equal(r.status, 0, `shellcheck:\n${r.stdout}${r.stderr}`);
});

test('G2.2 bash -n parses', () => {
  const r = run(bash, ['-n', SCRIPT]);
  assert.equal(r.status, 0, r.stderr);
});

const DENY = [
  ['associative arrays: declare/typeset/local -A (bash 4.0)', /\b(declare|typeset|local)\s+-[A-Za-z]*A\b/],
  ['mapfile / readarray (4.0)', /\b(mapfile|readarray)\b/],
  ['case modification ${x^^} ${x,,} ${x^} ${x,} (4.0)', /\$\{[A-Za-z_][A-Za-z0-9_]*(\^\^?|,,?)\}/],
  ['|& pipe (4.0)', /\|&/],
  ['[[ -v / [ -v (4.2)', /\[\[?\s+-v\s/],
  ['&>> append-both (4.0)', /&>>/],
  [';& and ;;& fallthrough (4.0)', /;;&|;&(?!&)/],
  ['coproc (4.0)', /\bcoproc\b/],
  ['namerefs declare/local -n (4.3)', /\b(declare|typeset|local)\s+-[A-Za-z]*n\b/],
  ['parameter transformations ${x@Q} (4.4)', /\$\{[^}]*@[QEPAaKk]\}/],
  ['negative substring length ${x:1:-1} (4.2)', /\$\{[A-Za-z_][A-Za-z0-9_]*:[^}:]*:-[0-9]/],
  ['negative array index [-1] (4.3)', /\[\s*-[0-9]+\s*\]/],
  ['wait -n (4.3)', /\bwait\s+-n\b/],
  ['$EPOCHSECONDS / $EPOCHREALTIME (5.0)', /\$\{?EPOCH(SECONDS|REALTIME)/],
  ['shopt globstar/lastpipe/inherit_errexit (4.x)', /\bshopt\s+-s\s+(globstar|lastpipe|inherit_errexit)/],
  ['read -i prefill (4.0)', /\bread\s[^\n]*\s-i\b/],
  ['read -t fractional (4.0)', /\bread\s[^\n]*-t\s+[0-9]*\.[0-9]/],
  ['printf %(fmt)T (4.2)', /%\([^)]*\)T/],
  ['dynamic fd exec {fd}< (4.1)', /\{[A-Za-z_][A-Za-z0-9_]*\}[<>]/],
  ['associative literal ([k]=v)', /\(\s*\[[^\]]+\]=/],
];
test('G2.2 bash-3.2 denylist returns nothing (comment lines ignored)', () => {
  const hits = [];
  src.split(/\r?\n/).forEach((line, i) => {
    if (/^\s*#/.test(line)) return;
    for (const [name, re] of DENY) if (re.test(line)) hits.push(`${i + 1}: ${name} :: ${line.trim()}`);
  });
  assert.deepEqual(hits, [], hits.join('\n'));
});

test('G2.2 shape: #!/bin/bash, LF only, last non-blank line is main "$@"', () => {
  assert.ok(src.startsWith('#!/bin/bash\n'), 'shebang must be #!/bin/bash (macOS ships bash 3.2 there)');
  assert.ok(!src.includes('\r'), 'CRLF found');
  const last = src.trimEnd().split('\n').pop().trim();
  assert.equal(last, 'main "$@"');
});

test('G2.2 truncated download (50/60/75/90% of the bytes piped into bash) exits non-zero and starts no step', () => {
  const sb = sandbox(SAFE_STUBS);
  for (const frac of [0.5, 0.6, 0.75, 0.9]) {
    const cut = buf.subarray(0, Math.floor(buf.length * frac));
    const r = run(bash, ['-s'], { input: cut, env: sb.env, cwd: ROOT, timeout: 30000 });
    const out = (r.stdout || '') + (r.stderr || '');
    assert.notEqual(r.status, 0, `${Math.round(frac * 100)}%: exited 0\n${out}`);
    assert.ok(!out.includes(MARK), `${Math.round(frac * 100)}%: a step started:\n${out}`);
  }
  assert.deepEqual(sb.homeEntries(), [], 'truncated script wrote into HOME');
});

test('static contract: node@24 forced link, no interactive CLT installer, flags documented', () => {
  assert.ok(src.includes('brew link --overwrite --force node@24'), 'node@24 is keg-only; must force-link');
  assert.ok(!/xcode-select\s+--install/.test(src), 'must never invoke xcode-select --install');
  for (const s of ['--bootstrap-only', '--dry-run', 'KIT_EXTRAS', 'KIT_REF', 'NONINTERACTIVE=1', 'install-system-daemon']) {
    assert.ok(src.includes(s), `missing ${s}`);
  }
});

// ---------- G2.3 ----------
test('G2.3 Intel guard: x86_64 without Rosetta exits 1 with the Intel message and makes no network call', () => {
  const sb = sandbox(SAFE_STUBS);
  const r = runInstall(sb, [], { ARCH_OVERRIDE: 'x86_64', PROC_TRANSLATED_OVERRIDE: '0' });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /Intel/i);
  assert.match(r.out, /Apple Silicon/i);
  assert.doesNotMatch(r.out, /downloading/i);
  assert.deepEqual(sb.calls('curl'), [], 'curl was invoked');
  assert.deepEqual(sb.homeEntries(), []);
});

test('G2.3 Rosetta: x86_64 + proc_translated=1 --dry-run exits 0 and writes nothing', () => {
  const sb = sandbox(SAFE_STUBS);
  const r = runInstall(sb, ['--dry-run'], { ARCH_OVERRIDE: 'x86_64', PROC_TRANSLATED_OVERRIDE: '1' });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /rosetta/i);
  assert.match(r.out, /dry-run/);
  assert.deepEqual(sb.calls('curl'), [], 'curl was invoked in dry-run');
  assert.deepEqual(sb.calls('sudo'), [], 'sudo was invoked in dry-run');
  assert.deepEqual(sb.homeEntries(), [], 'dry-run wrote into HOME');
});

// ---------- G2.7 ----------
test('G2.7 CLT pre-check: stub xcode-select -p exiting 2 → defers to Homebrew/softwareupdate, never --install', () => {
  const sb = sandbox({ ...SAFE_STUBS, 'xcode-select': 'exit 2' });
  const r = runInstall(sb, ['--dry-run']);
  assert.equal(r.status, 0, r.out);
  const xs = sb.calls('xcode-select');
  assert.ok(xs.some((l) => /^xcode-select -p$/.test(l.trim())), `no "xcode-select -p" probe in stub log:\n${sb.readLog()}`);
  assert.ok(!sb.readLog().includes('--install'), `xcode-select --install was called:\n${sb.readLog()}`);
  assert.match(r.out, /Command Line Tools/i);
  assert.match(r.out, /Homebrew/);
  assert.match(r.out, /softwareupdate/);
});

test('G2.7 no tty + sudo -n failing → non-zero within 5 s with the "run this in Terminal" message, nothing downloaded', () => {
  const sb = sandbox(SAFE_STUBS);
  const r = runInstall(sb, [], { KIT_TTY: fwd(path.join(sb.home, 'no-such-tty')) });
  assert.notEqual(r.status, 0, r.out);
  assert.ok(r.ms < 5000, `took ${r.ms} ms`);
  assert.match(r.out, /run this in Terminal/i);
  assert.ok(sb.calls('sudo').some((l) => /^sudo -n\b/.test(l)), `expected a "sudo -n" probe:\n${sb.readLog()}`);
  assert.deepEqual(sb.calls('curl'), [], 'curl was invoked before sudo was secured');
  assert.doesNotMatch(r.out, /downloading/i);
  assert.deepEqual(sb.homeEntries(), []);
});
