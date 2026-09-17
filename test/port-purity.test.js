'use strict';
// G1.3 — no Windows-isms anywhere under kit/; substituted paths present; registry seed exact; no Airtable ids.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { KIT, walk, isTextFile, rel, readJson } = require('./helpers');

const FORBIDDEN = [
  // a backslash acting as a path separator: followed by another segment ending in a backslash, a file name with an
  // extension, or a glob — so regex escapes (\w, \n) and LaTeX (\pi) do not count
  ['backslash path', /[A-Za-z0-9>.)]\\(?:[A-Za-z0-9_*<>.-]+\\|[A-Za-z0-9_<>*-]+\.[A-Za-z]{1,5}\b|\*)/],
  ['C: drive', /\bC:/],
  ['OpenClaw', /OpenClaw/],
  ['AppData', /AppData/],
  ['powershell', /powershell/i],
  ['$LASTEXITCODE', /\$LASTEXITCODE/],
  ['Select-Object', /Select-Object/],
  ['New-Item', /New-Item/],
  ['Out-Null', /Out-Null/],
  ['Test-Path', /Test-Path/],
  ['schtasks', /schtasks/i],
  ['.exe', /\.exe\b/i],
  ['cd /d', /\bcd \/d\b/],
  ['tradingview', /tradingview/i],
];
const AIRTABLE_ID = /\b(?:app|tbl|fld|rec)(?=[A-Za-z0-9]{14}\b)(?![a-z]{14}\b)[A-Za-z0-9]{14}\b/;

function textFiles() { return walk(KIT).filter(isTextFile); }

test('kit/ contains zero Windows-isms', () => {
  const hits = [];
  for (const f of textFiles()) {
    const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const [name, re] of FORBIDDEN) if (re.test(line)) hits.push(`${rel(f)}:${i + 1} [${name}] ${line.trim().slice(0, 120)}`);
    });
  }
  assert.deepEqual(hits, [], 'Windows-isms found:\n' + hits.join('\n'));
});

test('substituted macOS paths are present where expected', () => {
  const expect = [
    ['pipeline/stages/1-idea.md', '~/projects/'],
    ['pipeline/stages/audit.md', '~/projects/'],
    ['commands/project.md', '~/.claude/pipeline/registry.json'],
    ['skills/thought-note/SKILL.md', '~/second-brain'],
    ['skills/decision-note/SKILL.md', '~/second-brain'],
    ['skills/handoff/SKILL.md', '~/second-brain'],
    ['hooks/auto-md.py', '~/md-converted'],
  ];
  for (const [f, needle] of expect) {
    const p = path.join(KIT, f);
    assert.ok(fs.existsSync(p), `missing ${f}`);
    assert.ok(fs.readFileSync(p, 'utf8').includes(needle), `${f} lacks ${needle}`);
  }
});

test('registry seed shape is exact', () => {
  const seed = readJson(path.join(KIT, 'pipeline', 'registry.json'));
  assert.deepEqual(seed, {
    version: 1,
    airtable: { baseId: null, projects: null, phases: null, events: null, fieldIds: { Projects: {}, Phases: {}, Events: {} } },
    outbox: [],
    projects: {},
  });
});

test('no Airtable record/table/field/base id anywhere under kit/', () => {
  const hits = [];
  for (const f of textFiles()) {
    const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => { if (AIRTABLE_ID.test(line)) hits.push(`${rel(f)}:${i + 1} ${line.trim().slice(0, 120)}`); });
  }
  assert.deepEqual(hits, [], 'Airtable ids found:\n' + hits.join('\n'));
});
