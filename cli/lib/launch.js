'use strict';
// One headless launch after install so plugin Setup hooks (claude-mem's `bun install --production`,
// 300 s) finish BEFORE doctor ever runs. Must work with no prior login — Phase 4 logs in later, so a
// credentials error here is expected and is NOT a failure; only a missing/crashing binary is.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const CLAUDE = process.env.KIT_CLAUDE_BIN || 'claude';
const TIMEOUT_MS = 360000; // > the 300 s claude-mem Setup hook

// Anything that means "the CLI ran, but you are not logged in yet".
const LOGIN_RE = /(not logged in|log ?in|authenticat|api key|credential|subscription|unauthorized)/i;

// The priming launch happens ONCE: the stamp is what makes a re-install report "0 changes".
function stampPath(home) { return path.join(home, '.claude-kit', '.setup-hooks-primed'); }

async function headlessLaunch(ctx) {
  const exec = ctx.exec || ((args, opts) => spawnSync(CLAUDE, args, {
    encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, HOME: ctx.home }, cwd: ctx.home, ...opts,
  }));
  if (ctx.dryRun) return { changed: [] };
  if (fs.existsSync(stampPath(ctx.home))) { ctx.log('  ok (Setup hooks already primed)'); return { changed: [] }; }

  const r = exec(['-p', 'ok']);
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  if (r.status === 0) {
    fs.mkdirSync(path.dirname(stampPath(ctx.home)), { recursive: true });
    fs.writeFileSync(stampPath(ctx.home), new Date().toISOString() + '\n');
    return { changed: ['headless launch (plugin Setup hooks primed)'] };
  }
  if (LOGIN_RE.test(out)) {
    ctx.log('  ok (claude ran but is not logged in yet — Setup hooks run at first real session)');
    return { changed: [] };
  }
  throw new Error(`headless \`claude -p ok\` failed (exit ${r.status}): ${out.trim().split('\n').slice(-3).join(' ')}`);
}

module.exports = { headlessLaunch, stampPath, TIMEOUT_MS, LOGIN_RE };
