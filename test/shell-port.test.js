'use strict';
// G1.5 — zero powershell fences under kit/; every bash/sh fence passes `bash -n`; every python fence compiles.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { KIT, walk, fences, run, tmpdir, bashPath, pythonPath, rel } = require('./helpers');

const mdFiles = walk(KIT).filter((p) => p.endsWith('.md'));
const scoped = mdFiles.filter((p) => {
  const r = rel(p);
  return /^kit\/skills\/.*\/SKILL\.md$/.test(r) || /^kit\/commands\/[^/]+\.md$/.test(r) || /^kit\/pipeline\//.test(r);
});

test('zero ```powershell fences anywhere under kit/', () => {
  const hits = [];
  for (const f of mdFiles) for (const fc of fences(fs.readFileSync(f, 'utf8'))) if (/^(powershell|ps1|pwsh)$/.test(fc.lang)) hits.push(`${rel(f)}:${fc.line}`);
  assert.deepEqual(hits, []);
});

test('every bash/sh fence passes bash -n; every python fence passes py_compile', () => {
  const tmp = tmpdir('kit-shellport-');
  const bash = bashPath();
  const py = pythonPath();
  const failures = [];
  let n = 0;
  for (const f of scoped) {
    for (const fc of fences(fs.readFileSync(f, 'utf8'))) {
      if (fc.lang === 'bash' || fc.lang === 'sh') {
        const t = path.join(tmp, `f${n++}.sh`);
        fs.writeFileSync(t, fc.code + '\n');
        const r = run(bash, ['-n', t]);
        if (r.status !== 0) failures.push(`${rel(f)}:${fc.line} bash -n: ${r.stderr.trim().slice(0, 200)}`);
      } else if (fc.lang === 'python' || fc.lang === 'py' || fc.lang === 'python3') {
        const t = path.join(tmp, `f${n++}.py`);
        fs.writeFileSync(t, fc.code + '\n');
        const r = run(py, ['-m', 'py_compile', t]);
        if (r.status !== 0) failures.push(`${rel(f)}:${fc.line} py_compile: ${r.stderr.trim().slice(0, 200)}`);
      }
    }
  }
  assert.ok(n > 0, 'expected at least one fence to check');
  assert.deepEqual(failures, [], failures.join('\n'));
});
