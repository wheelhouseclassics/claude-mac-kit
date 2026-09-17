'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const KIT = path.join(ROOT, 'kit');

function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }

function bashPath() {
  if (process.env.KIT_BASH) return process.env.KIT_BASH;
  if (process.platform === 'win32') {
    for (const c of ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files\\Git\\usr\\bin\\bash.exe']) if (exists(c)) return c;
  }
  return 'bash';
}
function pythonPath() {
  if (process.env.KIT_PYTHON) return process.env.KIT_PYTHON;
  return process.platform === 'win32' ? 'python' : 'python3';
}
function gitleaksPath() {
  if (process.env.GITLEAKS) return process.env.GITLEAKS;
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['gitleaks'], { encoding: 'utf8' });
  if (r.status === 0 && r.stdout.trim()) return r.stdout.split(/\r?\n/)[0].trim();
  if (process.platform === 'win32') {
    const links = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', 'gitleaks.exe');
    if (exists(links)) return links;
    // winget portable install: %LOCALAPPDATA%\Microsoft\WinGet\Packages\Gitleaks.Gitleaks_*\gitleaks.exe
    const pkgs = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
    if (exists(pkgs)) {
      for (const d of fs.readdirSync(pkgs)) {
        if (/^Gitleaks\.Gitleaks_/i.test(d) && exists(path.join(pkgs, d, 'gitleaks.exe'))) return path.join(pkgs, d, 'gitleaks.exe');
      }
    }
  }
  return null;
}
function shellcheckPath() {
  if (process.env.SHELLCHECK) return process.env.SHELLCHECK;
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['shellcheck'], { encoding: 'utf8' });
  if (r.status === 0 && r.stdout.trim()) return r.stdout.split(/\r?\n/)[0].trim();
  if (process.platform === 'win32') {
    const links = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', 'shellcheck.exe');
    if (exists(links)) return links;
    const pkgs = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
    if (exists(pkgs)) {
      for (const d of fs.readdirSync(pkgs)) {
        if (/^koalaman\.shellcheck_/i.test(d) && exists(path.join(pkgs, d, 'shellcheck.exe'))) return path.join(pkgs, d, 'shellcheck.exe');
      }
    }
  }
  return null;
}
function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
}
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
function tmpdir(prefix) { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }
function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function rel(p) { return path.relative(ROOT, p).split(path.sep).join('/'); }

// Extract fenced code blocks: [{lang, code, line}] (line = 1-based line of the first code line)
function fences(md) {
  const out = [];
  const lines = md.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const m = /^\s*```([A-Za-z0-9_+.-]*)[^`]*$/.exec(lines[i]);
    if (m) {
      const lang = m[1].toLowerCase();
      const start = i + 1;
      let j = start;
      while (j < lines.length && !/^\s*```\s*$/.test(lines[j])) j++;
      out.push({ lang, code: lines.slice(start, j).join('\n'), line: start + 1 });
      i = j + 1;
    } else i++;
  }
  return out;
}
const TEXT_EXT = /\.(md|json|py|sh|js|mjs|cjs|txt|toml|yml|yaml|csv|html|css|applescript|plist)$/i;
function isTextFile(p) { return TEXT_EXT.test(p) || /^(pre-commit|Brewfile|\.gitattributes|\.gitignore)$/.test(path.basename(p)); }

module.exports = { ROOT, KIT, exists, bashPath, pythonPath, gitleaksPath, shellcheckPath, run, walk, tmpdir, readJson, rel, fences, isTextFile };
