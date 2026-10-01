'use strict';
// Real probe adapter for `claude-kit doctor` / setup verifiers: exec ENOENT → status 127,
// exec timeout → throws, http parses JSON bodies and throws on timeout, fs helpers behave.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const probeIo = require('../cli/lib/probe-io');

test('exec: missing binary → status 127, never throws', async () => {
  const io = probeIo.create();
  const r = await io.exec('definitely-not-a-binary-xyz', ['--version'], { cwd: os.tmpdir(), timeout: 5000 });
  assert.equal(r.status, 127);
  assert.equal(r.stdout, '');
});

test('exec: captures stdout and exit status', async () => {
  const io = probeIo.create();
  const r = await io.exec(process.execPath, ['-e', 'process.stdout.write("hi"); process.exit(3)'], { cwd: os.tmpdir(), timeout: 5000 });
  assert.equal(r.status, 3);
  assert.equal(r.stdout, 'hi');
});

test('exec: timeout → throws', async () => {
  const io = probeIo.create();
  await assert.rejects(io.exec(process.execPath, ['-e', 'setTimeout(()=>{},5000)'], { cwd: os.tmpdir(), timeout: 200 }), /timed out/);
});

function server(handler) {
  return new Promise((resolve) => {
    const s = http.createServer(handler).listen(0, '127.0.0.1', () => resolve(s));
  });
}

test('http: JSON body parsed, status returned, headers sent', async () => {
  const s = await server((req, res) => {
    res.writeHead(201, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, auth: req.headers.authorization || null }));
  });
  try {
    const io = probeIo.create();
    const r = await io.http(`http://127.0.0.1:${s.address().port}/x`, { headers: { Authorization: 'Bearer t' }, timeout: 3000 });
    assert.equal(r.status, 201);
    assert.deepEqual(r.body, { ok: true, auth: 'Bearer t' });
  } finally { s.close(); }
});

test('http: non-JSON body returned as text', async () => {
  const s = await server((req, res) => { res.writeHead(404); res.end('nope'); });
  try {
    const r = await probeIo.create().http(`http://127.0.0.1:${s.address().port}/`, { timeout: 3000 });
    assert.equal(r.status, 404);
    assert.equal(r.body, 'nope');
  } finally { s.close(); }
});

test('http: timeout → throws', async () => {
  const s = await server(() => { /* never answers */ });
  try {
    await assert.rejects(probeIo.create().http(`http://127.0.0.1:${s.address().port}/`, { timeout: 200 }), /timed out/);
  } finally { s.closeAllConnections(); s.close(); }
});

test('fs helpers and env/home', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pio-'));
  fs.writeFileSync(path.join(d, 'a.txt'), 'A');
  const io = probeIo.create({ home: d, env: { HOME: d, X: '1' } });
  assert.equal(io.home, d);
  assert.equal(io.env.X, '1');
  assert.equal(io.exists(path.join(d, 'a.txt')), true);
  assert.equal(io.exists(path.join(d, 'b.txt')), false);
  assert.equal(io.readFile(path.join(d, 'a.txt')), 'A');
  assert.deepEqual(io.readdir(d), ['a.txt']);
});
