#!/usr/bin/env node
'use strict';
// claude-kit — zero-dependency Node CLI shipped in the kit (Node >= 22.13).
//   claude-kit install [--only step,step] [--home DIR]   idempotent install (steps land phase by phase)
//   claude-kit setup | doctor | airtable-init | bench-teardown   (later phases)
const path = require('path');
const os = require('os');
const { loadManifest } = require('./lib/manifest');
const install = require('./lib/install');

const KIT_ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const cmd = argv[0];

function opt(name, def) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : def;
}
function flag(name) { return argv.includes(name); }

const ctx = {
  kitRoot: KIT_ROOT,
  home: path.resolve(opt('--home', process.env.KIT_HOME || os.homedir())),
  manifest: null,
  log: (m) => console.log(m),
  dryRun: flag('--dry-run'),
};

function usage() {
  console.log('usage: claude-kit <install|setup|doctor|airtable-init|bench-teardown> [--only a,b] [--home DIR] [--dry-run]');
  console.log('  install steps: ' + install.stepNames().join(', '));
}

(async () => {
  try {
    switch (cmd) {
      case 'install': {
        ctx.manifest = loadManifest(KIT_ROOT);
        const only = (opt('--only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
        const result = await install.run(ctx, only);
        process.exit(result.failed ? 1 : 0);
        break;
      }
      case 'bench-teardown': {
        const r = require('child_process').spawnSync('bash', [path.join(KIT_ROOT, 'scripts', 'bench-teardown.sh'), ...argv.slice(1)], { stdio: 'inherit' });
        process.exit(r.status === null ? 1 : r.status);
        break;
      }
      case 'setup': {
        const setup = require('./lib/setup');
        if (flag('--list-steps')) { console.log(setup.listSteps().join('\n')); break; }
        const creds = require('./lib/credentials');
        creds.refuseArgvSecrets(argv.slice(1));
        if (opt('--leak-check', null)) {
          const rows = creds.leakCheck(creds.credDir(ctx.home), require('fs').readFileSync(opt('--leak-check'), 'utf8'));
          for (const r of rows) console.log(`${r.leaked ? 'LEAK ' : 'clean'} ${r.file} ${r.key}`);
          process.exit(rows.some((r) => r.leaked) ? 1 : 0);
        }
        const readline = require('readline');
        const { spawnSync } = require('child_process');
        const setupCtx = {
          ...ctx,
          force: flag('--force'),
          io: require('./lib/probe-io').create({ home: ctx.home }),
          prompt: {
            hidden: (q) => creds.promptHidden(q),
            line: (q) => new Promise((resolve) => {
              const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
              rl.question(q, (a) => { rl.close(); resolve(a); });
            }),
          },
          interactive: (c, a) => { const r = spawnSync(c, a, { stdio: 'inherit' }); return r.status === null ? 1 : r.status; },
        };
        const res = await setup.runSteps(setupCtx, { handlers: require('./lib/steps').handlers(), only: opt('--step', null) });
        const { steps, raw, wallClockSec } = res.counter;
        const failed = res.results.filter((r) => r.status === 'failed').map((r) => r.id);
        console.log(`\nsetup: ${steps} steps completed (target ≤ 15), ${raw} raw inputs, ${wallClockSec}s wall clock${failed.length ? `; failed: ${failed.join(', ')}` : ''}`);
        const fs = require('fs');
        const log = path.join(KIT_ROOT, 'TESTLOG.md');
        if (fs.existsSync(log)) {
          fs.appendFileSync(log, `| ${new Date().toISOString()} | claude-kit setup${opt('--step', '') ? ` --step ${opt('--step')}` : ''} | steps ${steps} | raw ${raw} | ${wallClockSec}s | failed: ${failed.join(' ') || 'none'} |\n`);
        }
        process.exit(failed.length ? 1 : 0);
        break;
      }
      case 'doctor':
      {
        const doctor = require('./lib/doctor');
        if (flag('--list-rows')) { console.log(doctor.ROWS.join('\n')); break; }
        const io = require('./lib/probe-io').create({ home: ctx.home });
        const rep = await doctor.run({ io, manifest: loadManifest(KIT_ROOT) });
        console.log(flag('--json') ? JSON.stringify(rep, null, 2) : doctor.format(rep));
        process.exit(rep.exitCode);
        break;
      }
      case 'airtable-init':
        console.error(`claude-kit ${cmd}: not implemented yet in this kit version`);
        process.exit(2);
        break;
      case '--list-steps':
        console.log(install.stepNames().join('\n'));
        break;
      default:
        usage();
        process.exit(cmd ? 2 : 0);
    }
  } catch (e) {
    console.error('claude-kit: ' + (e && e.message ? e.message : e));
    process.exit(1);
  }
})();
