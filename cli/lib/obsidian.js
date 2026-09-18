'use strict';
// Obsidian vault registration (N11): Obsidian has no CLI/config API. We ATTEMPT the undocumented
// ~/Library/Application Support/obsidian/obsidian.json write; if Obsidian does not honour it, S15
// ("Open folder as vault", one click) stays in the setup guide — it is already counted there.
// Never clobbers an existing obsidian.json entry, and never runs while Obsidian is open.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

function configPath(home) { return path.join(home, 'Library', 'Application Support', 'obsidian', 'obsidian.json'); }
function vaultId(p) { return crypto.createHash('md5').update(p).digest('hex').slice(0, 16); }

function obsidianRunning() {
  if (process.platform !== 'darwin') return false;
  const r = spawnSync('pgrep', ['-x', 'Obsidian'], { encoding: 'utf8' });
  return r.status === 0 && !!(r.stdout || '').trim();
}

async function registerVault(ctx) {
  const { home, dryRun, log } = ctx;
  const vault = path.join(home, 'second-brain');
  const p = configPath(home);
  const changed = [];

  if (process.platform !== 'darwin') { log('  skip (not macOS — obsidian.json write is a macOS path)'); return { changed }; }
  if (obsidianRunning()) { log('  skip (Obsidian is running — it would overwrite obsidian.json on quit; use S15)'); return { changed }; }

  let cfg = { vaults: {} };
  if (fs.existsSync(p)) {
    try { cfg = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { log('  ! obsidian.json unreadable — leaving it alone (S15 covers this)'); return { changed }; }
    cfg.vaults = cfg.vaults || {};
  }
  if (Object.values(cfg.vaults).some((v) => v && v.path === vault)) return { changed };

  cfg.vaults[vaultId(vault)] = { path: vault, ts: Date.now(), open: true };
  if (!dryRun) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(cfg, null, 2));
  }
  changed.push('obsidian.json vault entry (verify in the app — S15 is the fallback)');
  return { changed };
}

module.exports = { registerVault, configPath, vaultId };
