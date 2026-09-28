#!/usr/bin/env bash
# claude-mac-kit — Phase 3 gate runner for a REAL Mac (bash 3.2 clean, no dependencies beyond the kit).
#
#   1) BEFORE installing:   curl -fsSL https://raw.githubusercontent.com/wheelhouseclassics/claude-mac-kit/public/scripts/mac-gates.sh | bash -s -- preflight
#   2) install the kit:     curl -fsSL https://raw.githubusercontent.com/wheelhouseclassics/claude-mac-kit/public/install.sh | bash
#      (count the password prompts — you will be asked for the number)
#   3) AFTER installing:    curl -fsSL https://raw.githubusercontent.com/wheelhouseclassics/claude-mac-kit/public/scripts/mac-gates.sh | bash
#
# Prints one PASS / FAIL / SKIP line per gate plus a fingerprint block. Paste the WHOLE output back.
# Session gates (G3.5b, G3.6) use whatever Claude auth this Mac has: a `claude` login, OR a gateway via
#   ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN (e.g. OpenRouter). Nothing here writes secrets anywhere.
set -u

MODE="${1:-gates}"
STATE_DIR="$HOME/.claude-kit-bench"
KIT="$HOME/.claude-kit"
PASS=0; FAIL=0; SKIP=0
ok()   { PASS=$((PASS + 1)); printf 'PASS  %s\n' "$*"; }
bad()  { FAIL=$((FAIL + 1)); printf 'FAIL  %s\n' "$*"; }
skip() { SKIP=$((SKIP + 1)); printf 'SKIP  %s\n' "$*"; }
note() { printf '      %s\n' "$*"; }
hr()   { printf '\n== %s ==\n' "$*"; }

# macOS has no `timeout`: run a command with a wall-clock cap (seconds), return 124 on expiry.
with_timeout() {
  local secs=$1; shift
  "$@" & local pid=$! i=0
  while kill -0 "$pid" 2>/dev/null && [ "$i" -lt "$secs" ]; do sleep 1; i=$((i + 1)); done
  if kill -0 "$pid" 2>/dev/null; then kill "$pid" 2>/dev/null; wait "$pid" 2>/dev/null; return 124; fi
  wait "$pid"
}

fingerprint() {
  hr "fingerprint"
  sw_vers 2>/dev/null | tr '\n' ' '; echo
  echo "arch: $(uname -m)  rosetta: $(sysctl -n sysctl.proc_translated 2>/dev/null || echo n/a)  bash: $(/bin/bash --version | head -1 | awk '{print $4}')"
  echo "existing ~/.claude: $([ -d "$HOME/.claude" ] && echo yes || echo no)   ~/.claude.json: $([ -f "$HOME/.claude.json" ] && echo yes || echo no)"
  echo "brew: $(command -v brew || echo none)   node: $(command -v node || echo none)   claude: $(command -v claude || echo none)"
  echo "auth env: ANTHROPIC_BASE_URL=${ANTHROPIC_BASE_URL:-unset}  ANTHROPIC_AUTH_TOKEN=$([ -n "${ANTHROPIC_AUTH_TOKEN:-}" ] && echo set || echo unset)  ANTHROPIC_API_KEY=$([ -n "${ANTHROPIC_API_KEY:-}" ] && echo set || echo unset)"
}

if [ "$MODE" = "preflight" ]; then
  fingerprint
  mkdir -p "$STATE_DIR"
  {
    echo "started_epoch=$(date +%s)"
    echo "had_claude_dir=$([ -d "$HOME/.claude" ] && echo yes || echo no)"
    echo "had_claude_json=$([ -f "$HOME/.claude.json" ] && echo yes || echo no)"
    echo "had_brew=$(command -v brew >/dev/null && echo yes || echo no)"
    echo "had_node=$(command -v node >/dev/null && echo yes || echo no)"
    echo "had_claude_bin=$(command -v claude >/dev/null && echo yes || echo no)"
  } > "$STATE_DIR/preflight.txt"
  echo
  echo "preflight recorded in $STATE_DIR/preflight.txt"
  echo "NOW: run the installer, COUNT every password prompt, then re-run this script without 'preflight'."
  exit 0
fi

export PATH="/opt/homebrew/bin:$HOME/.local/bin:$PATH"
fingerprint
# shellcheck disable=SC1090,SC2154  # the had_* / started_epoch vars come from the sourced preflight file
if [ -f "$STATE_DIR/preflight.txt" ]; then
  . "$STATE_DIR/preflight.txt"
  echo "preflight: ~/.claude existed=$had_claude_dir  credentials=$had_claude_json  brew=$had_brew  node=$had_node  claude=$had_claude_bin"
  echo "wall clock since preflight: $(( $(date +%s) - started_epoch ))s (includes your own time between steps)"
else
  echo "preflight: NOT recorded (fresh-machine precondition unknown — say so when you paste this back)"
fi

hr "install present"
if [ ! -f "$KIT/manifest.json" ] || ! command -v claude-kit >/dev/null; then
  bad "kit not installed ($KIT/manifest.json or claude-kit missing) — run install.sh first"
  echo; echo "PASS=$PASS FAIL=$FAIL SKIP=$SKIP"; exit 1
fi
ok "kit at $KIT ($(cd "$KIT" && git rev-parse --short HEAD 2>/dev/null || echo '?')), claude $(claude --version 2>/dev/null | head -1)"

hr "G3.3 — marketplaces + plugin id set == manifest (pre-login install)"
MK="$STATE_DIR/marketplaces.json"; PL="$STATE_DIR/plugins.json"; mkdir -p "$STATE_DIR"
claude plugin marketplace list --json > "$MK" 2>/dev/null
claude plugin list --json > "$PL" 2>/dev/null
if node - "$KIT/manifest.json" "$MK" "$PL" "$KIT/cli/lib/plugins.js" <<'JS'
const fs = require('fs');
const [mf, mkf, plf, lib] = process.argv.slice(2);
const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
const p = require(lib);
const have = p.namesOf(p.parseJson(fs.readFileSync(mkf, 'utf8')));
const ids = p.pluginIdsOf(p.parseJson(fs.readFileSync(plf, 'utf8')));
const want = m.plugins.map((x) => x.id).sort();
const missMk = m.marketplaces.map((x) => x.name).filter((n) => !have.has(n));
const missing = want.filter((i) => !ids.has(i));
const extra = [...ids].filter((i) => !want.includes(i));
console.log('      marketplaces: ' + [...have].sort().join(', '));
console.log('      plugins: ' + [...ids].sort().join(', '));
if (missMk.length) console.log('      MISSING marketplaces: ' + missMk.join(', '));
if (missing.length) console.log('      MISSING plugins: ' + missing.join(', '));
if (extra.length) console.log('      EXTRA plugins (yours, not the kit\'s): ' + extra.join(', '));
process.exit(missMk.length || missing.length ? 1 : 0);
JS
then ok "G3.3 all manifest marketplaces + plugins present"; else bad "G3.3 manifest marketplaces/plugins incomplete (above)"; fi

hr "G3.4 — installed tree"
cd "$HOME" || exit 1
# `.claude/skills/synced` is claude.ai account sync (the signed-in user's own skills), not kit-owned.
# Captured to a variable: `if grep | head` would report head's exit status, never grep's.
RESIDUE=$(grep -rIEn 'C:\\|C:/Users|OpenClaw|tradingview|kalshi|polymarket|jessup|MSYS_NO_PATHCONV|schtasks|powershell' \
     .claude/skills .claude/commands .claude/hooks .claude/pipeline second-brain \
     --exclude-dir=__pycache__ --exclude-dir=.git --exclude-dir=synced 2>/dev/null | head -5)
if [ -n "$RESIDUE" ]; then
  printf '%s\n' "$RESIDUE"
  bad "G3.4 residue found in the installed tree (above)"
else
  ok "G3.4 residue grep clean (account-synced skills excluded)"
fi
if node - "$KIT/manifest.json" <<'JS'
const fs = require('fs'), path = require('path'), os = require('os');
const m = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const dir = path.join(os.homedir(), '.claude/skills');
const got = fs.readdirSync(dir).filter((d) => fs.statSync(path.join(dir, d)).isDirectory());
const want = m.skills.map((s) => s.name);
const missing = want.filter((s) => !got.includes(s) || !fs.existsSync(path.join(dir, s, 'SKILL.md')) || fs.statSync(path.join(dir, s, 'SKILL.md')).size === 0);
if (missing.length) { console.log('      missing/empty skills: ' + missing.join(', ')); process.exit(1); }
const seed = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude/pipeline/registry.json'), 'utf8'));
if (seed.version !== 1 || !seed.projects || seed.airtable.baseId === undefined) { console.log('      registry.json is not a kit registry'); process.exit(1); }
const md = fs.readFileSync(path.join(os.homedir(), '.claude/CLAUDE.md'), 'utf8');
for (const s of ['~/Data', '~/second-brain', '~/projects']) if (!md.includes(s)) { console.log('      CLAUDE.md missing ' + s); process.exit(1); }
console.log('      ' + want.length + ' kit skills with SKILL.md; registry parses; CLAUDE.md references the three folders');
JS
then ok "G3.4 skills / registry / CLAUDE.md"; else bad "G3.4 skills / registry / CLAUDE.md (above)"; fi
V_OK=1
for d in raw-sources/Thoughts raw-sources/Decisions raw-sources/Handoffs raw-sources/Sessions raw-sources/Projects wiki scripts .obsidian; do
  [ -d "second-brain/$d" ] || { note "vault missing $d"; V_OK=0; }
done
for f in wiki/log.md .obsidian/app.json .obsidian/appearance.json .obsidian/core-plugins.json; do
  [ -f "second-brain/$f" ] || { note "vault missing $f"; V_OK=0; }
done
[ -d Data ] && [ -d projects ] || { note "$HOME/Data or $HOME/projects missing"; V_OK=0; }
[ "$V_OK" = 1 ] && ok "G3.4 SC8 vault + ~/Data + ~/projects" || bad "G3.4 vault/folders incomplete (above)"
D_OK=1
command -v bun >/dev/null || { note "bun not on PATH"; D_OK=0; }
command -v defuddle >/dev/null || { note "defuddle not on PATH"; D_OK=0; }
"$KIT/venv/bin/python" -c 'import markitdown' 2>/dev/null || { note "venv markitdown import failed"; D_OK=0; }
"$KIT/venv/bin/python" -m pip show graphifyy >/dev/null 2>&1 || { note "graphifyy not in venv"; D_OK=0; }
[ "$("$KIT/venv/bin/python" -c 'import sys; print(sys.version_info[0], sys.version_info[1])' 2>/dev/null)" = "3 12" ] || { note "venv python is not 3.12"; D_OK=0; }
[ "$D_OK" = 1 ] && ok "G3.4 deps: bun, defuddle, venv 3.12 + markitdown + graphifyy" || bad "G3.4 deps incomplete (above)"

hr "G3.7 — installed auto-md hook converts a .docx named in a prompt"
mkdir -p "$HOME/Data"
"$KIT/venv/bin/python" - <<'PY'
import os, zipfile
NS = "http://schemas.openxmlformats.org/"
parts = {
  "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="%spackage/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' % NS,
  "_rels/.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="%spackage/2006/relationships"><Relationship Id="rId1" Type="%sofficeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' % (NS, NS),
  "word/_rels/document.xml.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="%spackage/2006/relationships"/>' % NS,
  "word/document.xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="%swordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello from the bench. Second brain test document.</w:t></w:r></w:p></w:body></w:document>' % NS,
}
with zipfile.ZipFile(os.path.expanduser("~/Data/kit-bench-sample.docx"), "w", zipfile.ZIP_DEFLATED) as z:
    for n, b in parts.items(): z.writestr(n, b)
PY
rm -f "$HOME/md-converted/kit-bench-sample.md"
printf '{"prompt":"summarize %s/Data/kit-bench-sample.docx"}' "$HOME" | "$KIT/venv/bin/python" "$HOME/.claude/hooks/auto-md.py" >/dev/null 2>&1
if grep -q "Hello from the bench" "$HOME/md-converted/kit-bench-sample.md" 2>/dev/null; then ok "G3.7 ~/md-converted/kit-bench-sample.md contains the document text"; else bad "G3.7 no converted markdown (or text missing)"; fi

hr "G3.5a — hand edit survives a re-install, second install prints 0 changes"
SETTINGS="$HOME/.claude/settings.json"
node -e '
const fs=require("fs"),p=process.argv[1];const s=JSON.parse(fs.readFileSync(p,"utf8"));
s.kitBenchProbe="keep-me";fs.writeFileSync(p,JSON.stringify(s,null,2)+"\n");' "$SETTINGS"
RUN2="$STATE_DIR/install2.log"
claude-kit install > "$RUN2" 2>&1; RC=$?
if [ "$RC" = 0 ] && grep -q '^0 changes$' "$RUN2"; then ok "G3.5a second claude-kit install: exit 0, 0 changes"; else bad "G3.5a second install exit=$RC — $(grep -E 'changed:|✗' "$RUN2" | head -3 | tr '\n' ' ')"; fi
if node -e '
const fs=require("fs"),p=process.argv[1];const s=JSON.parse(fs.readFileSync(p,"utf8"));
if(s.kitBenchProbe!=="keep-me")process.exit(1);delete s.kitBenchProbe;fs.writeFileSync(p,JSON.stringify(s,null,2)+"\n");' "$SETTINGS"
then ok "G3.5a hand-added settings key survived (probe removed again)"; else bad "G3.5a hand-added settings key was lost"; fi

hr "G3.5b + G3.6 — need a working Claude session"
S1="$STATE_DIR/session1.log"
if with_timeout 180 claude -p 'reply with exactly: BENCH OK' > "$S1" 2>&1 && grep -q 'BENCH OK' "$S1"; then
  ok "session: claude -p answered ($( [ -n "${ANTHROPIC_BASE_URL:-}" ] && echo "gateway $ANTHROPIC_BASE_URL" || echo 'claude login'))"
  HOOKFAIL=$(grep -riE 'bun: (command )?not found|hook .* exited with (code )?[1-9]' "$S1" "$HOME/.claude/logs" 2>/dev/null | head -3)
  if [ -n "$HOOKFAIL" ]; then
    printf '%s\n' "$HOOKFAIL"
    bad "G3.5b a plugin Setup hook failed (above)"
  else
    ok "G3.5b no failed plugin Setup hook after the first real session"
  fi
  BEFORE=$(ls "$HOME/second-brain/raw-sources/Thoughts" 2>/dev/null | wc -l | tr -d ' ')
  with_timeout 240 claude -p '/thought-note bench test thought' > "$STATE_DIR/thought.log" 2>&1
  AFTER=$(ls "$HOME/second-brain/raw-sources/Thoughts" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$AFTER" = "$((BEFORE + 1))" ] && [ -s "$HOME/second-brain/thought.md" ] && grep -q . "$HOME/second-brain/wiki/log.md"; then
    ok "G3.6 /thought-note wrote exactly one Thoughts file, thought.md, and a wiki/log.md line"
  else
    bad "G3.6 /thought-note: Thoughts before=$BEFORE after=$AFTER thought.md=$([ -s "$HOME/second-brain/thought.md" ] && echo yes || echo no) — see $STATE_DIR/thought.log"
  fi
  with_timeout 240 claude -p '/project status' > "$STATE_DIR/project.log" 2>&1; RC=$?
  if [ "$RC" = 0 ] && ! grep -qiE 'C:\\|no such file|ENOENT' "$STATE_DIR/project.log"; then
    ok "G3.6 /project status exit 0, no Windows path, no missing file"
  else
    bad "G3.6 /project status exit=$RC — $(tail -3 "$STATE_DIR/project.log" | tr '\n' ' ')"
  fi
else
  skip "G3.5b + G3.6: no working Claude session — $(tail -2 "$S1" | tr '\n' ' ')"
  note "either run 'claude' once and sign in, or export ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN for a gateway, then re-run"
fi

hr "manual — answer these when you paste the output back"
OBS="$HOME/Library/Application Support/obsidian/obsidian.json"
if [ -f "$OBS" ] && grep -q "second-brain" "$OBS"; then note "G3.8: obsidian.json lists ~/second-brain — open Obsidian: does 'second-brain' appear in the vault list WITHOUT you adding it? (yes = PASS, and the gate downgrades to terminal)"; else note "G3.8: obsidian.json has no second-brain entry — open Obsidian > Open folder as vault > ~/second-brain (S15), confirm the thought note renders"; fi
note "RR-2: how many password prompts did install.sh show? (kit expects exactly 1)"
note "RR-1/G8.5: the installer's own 'bootstrap finished in Ns' line and any step that felt slow"

echo; echo "PASS=$PASS FAIL=$FAIL SKIP=$SKIP   (logs in $STATE_DIR)"
[ "$FAIL" = 0 ]
