'use strict';
// G1.4 — ported UserPromptSubmit hook: POSIX + quoted paths detected, converts a real .docx, caches, tolerates bad stdin.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { KIT, ROOT, run, tmpdir, pythonPath } = require('./helpers');

const HOOK = path.join(KIT, 'hooks', 'auto-md.py');
const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'sample.docx');
const py = pythonPath();
const haveMarkitdown = run(py, ['-c', 'import markitdown']).status === 0;

function hook(stdin, env = {}) {
  return run(py, [HOOK], { input: stdin, env: { ...process.env, ...env } });
}

test('find_paths detects unquoted POSIX paths and quoted paths with spaces', () => {
  const prompt = 'look at /Users/boss/Desktop/report.pdf and ~/Downloads/deck.pptx and "/Users/boss/My Docs/q3 plan.xlsx" thanks';
  const code = [
    'import importlib.util, json, sys',
    'spec = importlib.util.spec_from_file_location("h", sys.argv[1])',
    'm = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)',
    'print(json.dumps(m.find_paths(sys.argv[2])))',
  ].join('\n');
  const r = run(py, ['-c', code, HOOK, prompt]);
  assert.equal(r.status, 0, r.stderr);
  const found = JSON.parse(r.stdout);
  assert.ok(found.includes('/Users/boss/Desktop/report.pdf'), 'unquoted POSIX path: ' + r.stdout);
  assert.ok(found.includes('~/Downloads/deck.pptx'), 'tilde path: ' + r.stdout);
  assert.ok(found.includes('/Users/boss/My Docs/q3 plan.xlsx'), 'quoted path with spaces: ' + r.stdout);
});

test('converts a real .docx to AUTO_MD_OUT_DIR, then reuses the cache', { skip: !haveMarkitdown && 'markitdown not importable' }, () => {
  const tmp = tmpdir('kit-automd-');
  const spaced = path.join(tmp, 'with space');
  fs.mkdirSync(spaced);
  const src1 = path.join(tmp, 'sample.docx');
  const src2 = path.join(spaced, 'sample two.docx');
  fs.copyFileSync(FIXTURE, src1);
  fs.copyFileSync(FIXTURE, src2);
  const out = path.join(tmp, 'out');
  const prompt = `summarize ${src1.split(path.sep).join('/')} and "${src2.split(path.sep).join('/')}"`;
  let r = hook(JSON.stringify({ prompt }), { AUTO_MD_OUT_DIR: out });
  assert.equal(r.status, 0, r.stderr);
  const payload = JSON.parse(r.stdout);
  const ctx = payload.hookSpecificOutput.additionalContext;
  assert.equal(payload.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.ok(ctx.includes('sample.md') && ctx.includes('sample two.md'), 'both mappings reported: ' + ctx);
  const md1 = path.join(out, 'sample.md');
  const md2 = path.join(out, 'sample two.md');
  for (const md of [md1, md2]) {
    assert.ok(fs.existsSync(md), 'output missing ' + md);
    assert.ok(fs.readFileSync(md, 'utf8').includes('Hello from the kit fixture'), 'converted text present');
  }
  // cache: mark the output, re-run, the mark must survive (no reconversion)
  fs.appendFileSync(md1, '\nCACHE-SENTINEL\n');
  r = hook(JSON.stringify({ prompt }), { AUTO_MD_OUT_DIR: out });
  assert.equal(r.status, 0);
  assert.ok(fs.readFileSync(md1, 'utf8').includes('CACHE-SENTINEL'), 'second run must reuse the cached .md');
});

test('malformed stdin exits 0 silently; no paths → no output', () => {
  let r = hook('this is not json', { AUTO_MD_OUT_DIR: tmpdir('kit-automd-') });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), '');
  r = hook(JSON.stringify({ prompt: 'no documents here' }), { AUTO_MD_OUT_DIR: tmpdir('kit-automd-') });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), '');
});
