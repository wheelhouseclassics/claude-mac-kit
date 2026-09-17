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
      case 'setup':
      case 'doctor':
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
