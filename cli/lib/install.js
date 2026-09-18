'use strict';
// Install steps registry. Every step is idempotent ("check then act") and reports what it changed.
// Order matters: the tree and settings must exist before `claude plugin install` runs, and the
// headless launch must come last so plugin Setup hooks see a complete machine.
const vault = require('./vault');
const tree = require('./tree');
const deps = require('./deps');
const settings = require('./settings');
const plugins = require('./plugins');
const launch = require('./launch');
const obsidian = require('./obsidian');

const STEPS = [
  { name: 'tree', title: 'Claude Code mirror (~/.claude skills, commands, hooks, pipeline) + ~/Data, ~/projects', run: tree.ensureTree },
  { name: 'vault', title: 'Second brain vault skeleton (~/second-brain)', run: vault.ensureVault },
  { name: 'deps', title: 'Kit venv (markitdown, graphifyy), defuddle, bun check', run: deps.ensureDeps },
  { name: 'settings-pre', title: 'settings.json: marketplaces, auto-md hook, permission mode', run: settings.applyPre },
  { name: 'plugins', title: 'Marketplaces added and the manifest plugins installed', run: plugins.ensurePlugins },
  { name: 'settings-post', title: 'settings.json: enabledPlugins backstop after the CLI wrote its own', run: settings.applyPost },
  { name: 'launch', title: 'One headless `claude -p ok` so plugin Setup hooks finish', run: launch.headlessLaunch },
  { name: 'obsidian', title: 'Register ~/second-brain with Obsidian (best effort; S15 is the fallback)', run: obsidian.registerVault },
];

function stepNames() { return STEPS.map((s) => s.name); }

async function run(ctx, only) {
  const selected = only.length ? STEPS.filter((s) => only.includes(s.name)) : STEPS;
  const unknown = only.filter((n) => !STEPS.some((s) => s.name === n));
  if (unknown.length) throw new Error('unknown install step(s): ' + unknown.join(', ') + ' (known: ' + stepNames().join(', ') + ')');
  let failed = false;
  let total = 0;
  for (const step of selected) {
    ctx.log(`▶ ${step.name}: ${step.title}`);
    try {
      const r = await step.run(ctx);
      const changed = (r && r.changed) || [];
      total += changed.length;
      ctx.log(changed.length ? `  changed: ${changed.length <= 6 ? changed.join(', ') : changed.slice(0, 6).join(', ') + `, +${changed.length - 6} more`}` : '  ok (no changes)');
    } catch (e) {
      failed = true;
      ctx.log(`  ✗ ${e.message}`);
    }
  }
  if (!failed) ctx.log(total === 0 ? '0 changes' : `${total} changes`);
  return { failed, changes: total };
}

module.exports = { run, stepNames, STEPS };
