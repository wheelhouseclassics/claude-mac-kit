'use strict';
// Install steps registry. Every step is idempotent ("check then act") and reports what it changed.
// Phase 1 ships the vault step; later phases add brew, claude, plugins, skills, hooks, mcp, desktop, ...
const vault = require('./vault');

const STEPS = [
  { name: 'vault', title: 'Second brain vault skeleton (~/second-brain)', run: vault.ensureVault },
];

function stepNames() { return STEPS.map((s) => s.name); }

async function run(ctx, only) {
  const selected = only.length ? STEPS.filter((s) => only.includes(s.name)) : STEPS;
  const unknown = only.filter((n) => !STEPS.some((s) => s.name === n));
  if (unknown.length) throw new Error('unknown install step(s): ' + unknown.join(', ') + ' (known: ' + stepNames().join(', ') + ')');
  let failed = false;
  for (const step of selected) {
    ctx.log(`▶ ${step.name}: ${step.title}`);
    try {
      const r = await step.run(ctx);
      const changed = (r && r.changed) || [];
      ctx.log(changed.length ? `  changed: ${changed.join(', ')}` : '  ok (no changes)');
    } catch (e) {
      failed = true;
      ctx.log(`  ✗ ${e.message}`);
    }
  }
  return { failed };
}

module.exports = { run, stepNames, STEPS };
