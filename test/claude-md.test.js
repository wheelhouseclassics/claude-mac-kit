'use strict';
// G1.6 — kit/CLAUDE.md is authored for the boss's Mac, not a copy of Mike's.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { KIT } = require('./helpers');

const text = fs.readFileSync(path.join(KIT, 'CLAUDE.md'), 'utf8');

test('contains none of the Windows / trading / trigger-mandate content', () => {
  const bad = [/tradingview/i, /\bpine\b/i, /kalshi/i, /polymarket/i, /crosstrade/i, /alpaca/i, /MSYS_NO_PATHCONV/, /winget/i, /schtasks/i, /powershell/i, /scheduled trigger/i];
  for (const re of bad) assert.ok(!re.test(text), `kit/CLAUDE.md must not match ${re}`);
});

test('references the three folders and has the required sections', () => {
  for (const s of ['~/Data', '~/second-brain', '~/projects']) assert.ok(text.includes(s), `missing ${s}`);
  assert.ok(/^##+ .*dealership/im.test(text), 'dealership section heading');
  assert.ok(/^##+ .*macOS shell rules/im.test(text), 'macOS shell rules heading');
  const idx = text.search(/^## About me\s*$/m);
  assert.ok(idx >= 0, '## About me block');
  const rest = text.slice(idx + '## About me'.length);
  const next = rest.search(/^## /m);
  const block = next >= 0 ? rest.slice(0, next) : rest;
  const fills = (block.match(/<fill in>/g) || []).length;
  assert.ok(fills >= 3, `About me needs >=3 <fill in> placeholders, found ${fills}`);
});
