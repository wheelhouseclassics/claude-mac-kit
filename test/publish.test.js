'use strict';
// G1.8 — scripts/publish.sh builds the `public` orphan branch: no pipeline internals, has install.sh/kit/cli; idempotent.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { ROOT, run, tmpdir, bashPath } = require('./helpers');

test('publish.sh → public branch on a bare remote', () => {
  const tmp = tmpdir('kit-publish-');
  const remote = path.join(tmp, 'remote.git');
  const work = path.join(tmp, 'work');
  let r = run('git', ['init', '-q', '--bare', remote]);
  assert.equal(r.status, 0, r.stderr);
  r = run('git', ['clone', '-q', ROOT, work]);
  assert.equal(r.status, 0, r.stderr);
  const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
  run('git', ['remote', 'add', 'kit-public', remote], { cwd: work });

  r = run(bashPath(), ['scripts/publish.sh', '--remote', 'kit-public'], { cwd: work, env });
  assert.equal(r.status, 0, 'publish.sh failed: ' + r.stderr + r.stdout);

  const names = run('git', ['log', '--all', '--name-only', '--pretty=format:'], { cwd: remote }).stdout.split(/\r?\n/).filter(Boolean);
  for (const n of names) {
    assert.ok(!n.startsWith('.pipeline/'), 'leaked ' + n);
    assert.ok(!/^(idea|proposed-plan|PLAN|PROGRESS)\.md$/.test(n), 'leaked ' + n);
  }
  assert.ok(names.includes('install.sh'), 'install.sh missing on public');
  assert.ok(names.some((n) => n.startsWith('kit/')), 'kit/ missing on public');
  assert.ok(names.some((n) => n.startsWith('cli/')), 'cli/ missing on public');
  const branches = run('git', ['branch', '--list'], { cwd: remote }).stdout;
  assert.ok(/\bpublic\b/.test(branches) && !/\bmain\b/.test(branches), 'remote must have only public: ' + branches);

  const count1 = run('git', ['rev-list', '--count', 'public'], { cwd: remote }).stdout.trim();
  r = run(bashPath(), ['scripts/publish.sh', '--remote', 'kit-public'], { cwd: work, env });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout + r.stderr, /no changes/i);
  const count2 = run('git', ['rev-list', '--count', 'public'], { cwd: remote }).stdout.trim();
  assert.equal(count2, count1, 'second publish must not create a commit');
});
