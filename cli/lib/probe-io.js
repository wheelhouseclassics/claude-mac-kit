'use strict';
// The real probe adapter behind `claude-kit doctor` and the setup verifiers — the same shape the
// tests inject: {exec, http, exists, readFile, readdir, env, home}. exec never throws for a missing
// binary (status 127, like a shell) but DOES throw on timeout; http parses JSON when it can.
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

function exec(cmd, args = [], { cwd, timeout = 15000, env, input } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(cmd, args, { cwd, env: env || process.env, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      if (e.code === 'ENOENT') return resolve({ status: 127, stdout: '', stderr: e.message });
      return reject(e);
    }
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeout);
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (e) => {
      clearTimeout(timer);
      if (e.code === 'ENOENT') resolve({ status: 127, stdout: '', stderr: `${cmd}: command not found` });
      else reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) reject(new Error(`${cmd} timed out after ${timeout} ms`));
      else resolve({ status: code === null ? 1 : code, stdout, stderr });
    });
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}

async function http(url, { headers = {}, timeout = 15000, method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(timeout) });
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') throw new Error(`request timed out after ${timeout} ms`);
    throw new Error(`request failed: ${e.cause?.code || e.message}`);
  }
  const text = await res.text();
  let parsed = text;
  try { parsed = JSON.parse(text); } catch { /* not JSON — keep text */ }
  return { status: res.status, body: parsed };
}

function create({ home = os.homedir(), env = process.env } = {}) {
  return {
    home,
    env,
    exec,
    http,
    exists: (p) => fs.existsSync(p),
    readFile: (p) => fs.readFileSync(p, 'utf8'),
    readdir: (p) => fs.readdirSync(p),
  };
}

module.exports = { create, exec, http };
