# TESTLOG — claude-mac-kit bench runs

Spend cap **$100** (SC14, raised from $50 by the owner 2026-09-16). **Hard stop at $90 spent.**
Bench: **AWS EC2 Mac** (`mac2.metal`, M1, us-west-2) — Dedicated Host, **24 h minimum, billed until the host is RELEASED**, ≈ $0.65/h ≈ $15.60 per bench-day (put the console's real rate in the ledger). Scaleway (EUR 0.22/h M4-S) was the first choice; parked 2026-09-16 because the payment method was not approved.
Burst plan: P2+P3 (2 bench-days) · P4+P5 (2) · P7 (1) · P8 rehearsal (1) = 6 bench-days ≈ $94 worst case. Trim the P8 rehearsal first if the ledger runs hot.
End every burst with `claude-kit bench-teardown` ON the Mac, then `python scripts/bench-lease-aws.py release --yes` (terminate + release host), then close the ledger row.

## Spend ledger
| # | Lease start (local) | Lease end | Provider / instance | Rate | Hours billed | USD | Cum. USD | Burst | Notes |
|---|---|---|---|---|---|---|---|---|---|
| _none yet_ | | | | | | | | | |

## Bench fingerprint (G2.1 — first row of every fresh instance)
| Field | Value |
|---|---|
| provider / instance type | AWS EC2 / mac2.metal (host id: ) |
| rate / minimum | ≈ $0.65/h (verify) / 24 h, billed until host release |
| reinstall method | |
| SSH user / host | ec2-user@ |
| VNC (EC2: `sudo passwd ec2-user` + ARD kickstart; 5900 via SSH tunnel, SG allows only the build PC) | |
| `sw_vers` | |
| `uname -m` | |
| `sysctl -n sysctl.proc_translated` | |
| `xcode-select -p` | |
| `/bin/bash --version` (first line) | |
| `command -v brew` | |
| `ls ~/.claude` | |
| running spend at fingerprint | |

## Install wall clock (G2.5 — feeds the 90-min budget)
| Run | Step | Seconds | Notes |
|---|---|---|---|
| _none yet_ | | | |

## Runs (newest first)

### 2026-09-17 — Run 2 · FREE GitHub-hosted macOS runner · run 35295846712 · **ALL GREEN** · $0
Installed the PUBLISHED `install.sh` (`public` @ `af54230`) twice with `--bootstrap-only`. Every workflow step passed.

| Field | Value |
|---|---|
| provider / instance type | GitHub-hosted `macos-latest` runner (free for public repos) — stand-in for the rented Mac |
| `sw_vers` | macOS **26.6.2**, build 25G83 |
| `uname -m` | **arm64** |
| `/bin/bash --version` | **GNU bash 3.2.57(1)-release (arm64-apple-darwin25)** — confirms the bash-3.2 target is real, not theoretical |
| `command -v brew` | `/opt/homebrew/bin/brew` (PREINSTALLED on runners — a real fresh Mac installs it here) |
| first run, total | **80 s** (exit 0) |
| second run, total | **7 s** (exit 0, budget 60 s) |
| running spend | **$0.00** |

Per-item wall clock, first run (formulas already on the runner are skipped, so a fresh Mac will be slower — Homebrew + Command Line Tools alone add roughly 5–10 min):

| Item | Seconds |
|---|---|
| preflight | 0 |
| kit-clone (`git clone --depth 1 --branch public`) | 1 |
| formula gitleaks | 1 |
| formula bun | 2 |
| formula python@3.12 | 5 |
| formula tmux | 3 |
| formula tailscale | 3 |
| cask claude (Claude Desktop) | 17 |
| cask obsidian | 25 |
| brew-bundle (step total) | 63 |
| tailscaled system daemon | 0 |
| claude-code native installer | 9 |
| zprofile + claude-kit symlink | 0 |

**G2.5 evidence (partial — see caveats):** `zsh -lic` resolves `brew node git gh gitleaks bun python3.12 tmux tailscale claude claude-kit`; `node -v` = **v24.20.0**; `claude --version` = **2.1.275 (Claude Code)**; `brew bundle check --no-upgrade` satisfied; `/Applications/Claude.app` + `/Applications/Obsidian.app` present; `tailscale version` = open-source build; `.zprofile` has exactly one brew-shellenv line and one `~/.local/bin` line.

**G2.6 evidence (complete):** second run **7 s**; every step reported `skip` except probe-only `preflight` (`check`); `brew-bundle skip - all 10 items already present`; `sudo skip - nothing in this run needs root`; sha256 manifest over `~/.claude-kit` + `~/.zprofile` + the `claude-kit` symlink target **byte-identical** before/after. Asserted over kit-owned paths only, never `~/.claude`.

**Caveats — why this is not the whole of G2.1/G2.5:** the runner is not a fresh login (Homebrew, Xcode CLT and node preinstalled), its sudo is **passwordless** so the "exactly one password prompt" check cannot run, and there is no GUI Terminal, VNC, Keychain, TCC dialog or iMessage. Those need a real Mac (rented, or the boss's Mac mini in Phase 8).

**Kit fix this run produced:** `install.sh` step statuses are now honest — `preflight` reports `check` (probe only) and `brew-bundle` pre-scans the Brewfile so a fully-installed run reports `skip - all N items already present` instead of `run`. The bench asserts no step may print `run` on a second pass.

### 2026-09-17 — Run 1 · FREE GitHub-hosted macOS runner (`macos-latest`, Apple silicon) · run 35295371881 · $0
Bench substitute for the rented Mac (AWS refuses Mac hosts on both owner accounts; Scaleway no_stock). Installed the PUBLISHED `install.sh` from `raw.githubusercontent.com/wheelhouseclassics/claude-mac-kit/public/install.sh` with `--bootstrap-only`.

| Field | Value |
|---|---|
| runner | GitHub `macos-latest`, Apple silicon, `/opt/homebrew` preinstalled |
| kit ref installed | `public` @ `6d4706d` |
| first run, total | **67 s** (exit 0, no sudo prompt: runner sudo is passwordless) |
| result | installer PASSED; verification step failed on a too-strict assertion of mine, not on the kit |

Per-item wall clock (feeds the 90-min budget; formulas already present on the runner are skipped, so a real fresh Mac will be slower):

| Item | Seconds |
|---|---|
| kit-clone | 1 |
| formula gitleaks | 2 |
| formula bun | 3 |
| formula python@3.12 | 4 |
| formula tmux | 3 |
| formula tailscale | 2 |
| cask claude | 14 |
| cask obsidian | 24 |
| brew-bundle (step total) | 56 |
| tailscaled system daemon | 0 |
| claude-code native installer | 8 |
| zprofile + claude-kit symlink | 0 |

Verified on the Mac: `brew node git gh gitleaks bun python3.12 tmux tailscale claude claude-kit` all resolve in a `zsh -lic` login shell; `node -v` = **v24.20.0**; `claude --version` = **2.1.275 (Claude Code)**; steps `homebrew`/`node-link` correctly reported `skip` because the runner already had them.

**Anomaly (fixed, mine not the kit's):** the workflow ran `brew bundle check` WITHOUT `--no-upgrade`, so the runner's preinstalled-but-outdated formulae counted as unmet and the step failed. `install.sh` itself uses `--no-upgrade` and passed. Fixed in `bench.yml`; re-run follows.

**Bench-untestable here (record against a real Mac in Phase 8):** the single-sudo-prompt path (runner sudo is passwordless), GUI Terminal login, TCC dialogs, VNC, Keychain, iMessage, and the fresh-Mac timings for Homebrew + Command Line Tools (preinstalled on runners).


---

## 2026-09-17 — Phase 2 waiver ledger (owner: "waive and continue")

Phase 2 closes at **5/7**. Two gate items never ran on a rented Mac, because no Apple-silicon Mac
was rentable to this owner (AWS account-level Mac-host block on both accounts; Scaleway `no_stock`
with its card declined). They are carried to Phase 8 on the boss's Mac mini, which is where the
matching success criteria were always specified to close.

| Ledger | Gate item | Why unproven here | Closes at | What Phase 8 must observe |
|---|---|---|---|---|
| RR-1 | G2.1 — bench provisioned, VNC desktop, fresh fingerprint | No rented Mac exists; the free runner is a substitute, not the gate | G8.5 + G8.6 (SC14) | Real fresh-machine fingerprint recorded in TESTLOG |
| RR-2 | G2.5 — "exits 0 prompting for sudo exactly once" | GitHub runner sudo is passwordless → prompt count unobservable | G8.5 (SC1 at G8.6) | **Count the password prompts during the first install; write the number here** |
| RR-2 | G2.5 — fresh-Mac wall clock vs the 90-minute budget | Runner ships Homebrew + Xcode + Node preinstalled | G8.5 | Per-item stopwatch on a machine with none of it preinstalled |

Everything else in G2.5 is green on real macOS 26.6.2 arm64 (run `35295846712`). Bench spend across
the entire hunt: **$0**.

---

## 2026-09-17 — Phase 3 bench (`bench3.yml`) on a free macOS runner — G3.3, G3.4, G3.5a, G3.7 PASSED

Runs `35304720043` (failed, found a real bug), `35306868562`, `35307185550`, **`35307486912` (the
evidence run)** — all `macos-latest`, Apple silicon, **$0**. The workflow installs the PUBLISHED
`install.sh` (now `--full` by default, so it runs `claude-kit install`) on a machine with **no Claude
credentials and no `~/.claude`**, then asserts the result.

| Gate | Verdict | Evidence from run `35307486912` |
|---|---|---|
| G3.1 | ✓ terminal (Windows) | `test/settings-merge.test.js` 5/5 — allowlist only, denylist absent, boss edits survive, second apply byte-identical, stale Windows hook command re-pinned not duplicated |
| G3.2 | ✓ terminal (Windows) | `test/plugin-plan.test.js` 6/6 — `--scope user --yes --json` on every install, zero calls when provisioned, both JSON shapes, failure names the plugin, stale index → one `marketplace update` + one retry |
| G3.3 | ✓ real Mac | first run **181 s**, exit 0, `kit-install run`; then `G3.3 OK: 14 plugins, 5 marketplaces, installed with no login` — plugin id set equals the manifest exactly |
| G3.4 | ✓ real Mac | `G3.4 OK: 10 skills, registry seed clean, CLAUDE.md references the three folders`; residue grep clean over the installed tree; SC8 vault + `.obsidian/{app,appearance,core-plugins}.json`; `~/Data`, `~/projects`; `bun`, `defuddle`, venv python **3.12**, `markitdown ok` |
| G3.5 | **PARTIAL** | **5a ✓** second `claude-kit install` printed `0 changes`, every step `ok (no changes)`, and `G3.5a OK: hand edits survived a re-install` (hand-added `statusLine` kept, boss-disabled plugin stayed `false`). **5b OPEN** — the claude-mem Setup-hook log needs a real session |
| G3.6 | **OPEN** | needs an authenticated session (below) |
| G3.7 | ✓ real Mac | `{"prompt":"summarize $HOME/Data/sample.docx"}` piped into the INSTALLED `~/.claude/hooks/auto-md.py` wrote a non-empty `~/md-converted/sample.md` containing the document's text |
| G3.8 | carried → P8 | HUMAN, one click in Obsidian; no Mac with a screen exists (owner decision, 2026-09-17) |

**Bug the bench caught (run `35304720043`):** `everything-claude-code@everything-claude-code` no longer
exists — upstream renamed the marketplace AND the plugin to **`ecc`** (same repo). The manifest was
shipping an id no fresh Mac can resolve. Fixed via `manifest-config.plugins.renames` (manifest entries
now carry `was` + `note`) plus a one-shot `claude plugin marketplace update` + retry in `plugins.js`.

**Two more findings, both now encoded in the workflow:**
- The Claude CLI creates an **empty `~/.claude/skills/learned/`** itself (it exists on the build
  machine too). Skill set-equality is therefore wrong; the gate now requires every manifest skill to
  be present with a non-empty `SKILL.md`, and fails only on an EXTRA dir that carries a `SKILL.md`.
- `markitdown[all]` does **not** pull `python-docx` (it reads .docx through mammoth), and `graphifyy`
  ships no importable module of that name — the fixture is now built with stdlib `zipfile`, and the
  dependency is asserted with `pip show`.

**Blocked:** `ANTHROPIC_API_KEY` (added as a repo Actions secret on the owner's instruction) is
rejected by the API with **"Credit balance is too low"**, so `claude -p` cannot run on the bench and
**G3.5b + G3.6 stay OPEN — not passed, not waived.**

---

## 2026-09-28 — Phase 3 on a REAL Mac (owner's iMac): `mac-gates.sh` PASS=13 FAIL=0 SKIP=0

Machine: iMac, **macOS 26.5.1 (25F80), arm64, bash 3.2.57**, no Homebrew/node/claude beforehand
(`~/.claude` existed — Claude Desktop had been installed by hand; `~/.claude.json` did not). Three
installer runs over 2026-09-25 → 09-28, each one finding or confirming something:

| Run | Result | What it proved / found |
|---|---|---|
| 1 (09-25) | died at `brew install --cask claude` | **Bug:** Homebrew refuses a hand-installed `/Applications/Claude.app` ("already an App at …"). Fixed: a present `.app` counts as satisfied, never installed. Also: **exactly ONE password prompt**, CLT + Homebrew **143 s**, git 9 s, gh 3 s, node@24 23 s, bun 5 s, python@3.12 6 s, tmux 3 s, tailscale 4 s |
| 2 (09-26) | died at `brew bundle check` | **Bug:** the post-install verification also only knows brew-managed casks. Fixed: `verify_brewfile` uses the kit's own presence test. Obsidian cask 52 s |
| 3 (09-28) | **`bootstrap finished in 291s`**, `claude-kit install` **107 changes in 126 s** | tailscaled daemon **101 s (with a SECOND password prompt — see RR-2 below)**, Claude Code native installer 32 s (v2.1.284). Every Phase 3 step ran: tree, vault, deps (venv + graphifyy + markitdown + defuddle), settings-pre, 5 marketplaces + 14 plugins, settings-post no-op, headless launch primed Setup hooks, obsidian.json written |

Gate results (`mac-gates.sh`, second invocation after the gate-script fix):

| Gate | Verdict | Evidence |
|---|---|---|
| G3.3 | ✓ real Mac | all 5 manifest marketplaces + all 14 plugin ids present, installed before any login. The signed-in account also synced 9 `*@synced` plugins of its own — extras, correctly not failures |
| G3.4 | ✓ real Mac | residue grep clean over kit-owned trees (`.claude/skills/synced/` = claude.ai account sync, excluded); 10 kit skills with `SKILL.md`; registry seed parses; CLAUDE.md names the three folders; SC8 vault + `.obsidian` configs; `~/Data`, `~/projects`; bun, defuddle, venv python 3.12 + markitdown + graphifyy |
| G3.5 | ✓ real Mac | 5a: second `claude-kit install` → `0 changes`, hand-added settings key survived. 5b: after the first real session, no `bun not found` and no non-zero Setup-hook exit (claude-mem's `bun install --production` completed) |
| G3.6 | ✓ real Mac | `claude -p '/thought-note …'` created exactly one file under `raw-sources/Thoughts/`, overwrote `thought.md`, appended to `wiki/log.md`; `claude -p '/project status'` exit 0, no Windows path, no missing-file error |
| G3.7 | ✓ real Mac | installed `auto-md.py` converted a `.docx` named in a prompt into `~/md-converted/kit-bench-sample.md` |
| G3.8 | ✓ real Mac (owner, 09-30) | `obsidian.json` write is **HONOURED**: the owner opened Obsidian on the iMac and `second-brain` was already in the vault list without adding it. Per PLAN the gate downgrades to terminal (assert the `~/second-brain` entry in `obsidian.json`); Guide step S15 becomes "confirm it is listed", not a click |

Session auth on this Mac: **`claude` login** (the owner signed in). The OpenRouter gateway route was not exercised here.

**Gate-script bug found by this run (not a kit bug):** `if grep … | head -N` reports `head`'s exit status,
so two checks "failed" on a clean tree — fixed by testing captured output. Lesson generalises to every
bash-3.2 script in the kit: never put a pipeline in an `if`.

**RR-2 (carried from Phase 2) — new evidence:** the fresh-machine run (run 1) prompted **once**, but died
before `tailscaled`. Run 3 prompted at `[sudo]` **and again at `[tailscaled]`** (`sudo tailscaled
install-system-daemon`, 101 s = waiting for typing), ~15 s after the ticket was primed and with the
keepalive alive. Cause not yet known (ticket lost vs tailscaled prompting on its own). `install.sh` now
logs whether the sudo ticket is still valid immediately before that step, so the Phase 8 fresh-machine
run attributes it. **Until then the "exactly one prompt" claim is NOT proven.**
Owner confirmed on 09-30: run 3 showed exactly **two** prompts (`[sudo]`, then `[tailscaled]`) — evidence stands as written.

**Phase-4 consequence recorded here so it is not lost:** claude.ai account sync adds `*@synced` plugins and
`~/.claude/skills/synced/…` on any signed-in machine. `claude-kit doctor` rows `plugins_match_manifest`
and `skills_match_manifest` MUST ignore `@synced` / `skills/synced` (same rule as `@skills-dir`), or the
boss's account will fail the doctor through no fault of the kit.

**Kit-clone staleness (fixed 09-28):** re-runs used `cli/` from the first clone (`0757f1e`) while
`install.sh` arrived fresh. `kit-clone` now mirrors `KIT_REF` on re-run (skips with local edits).
