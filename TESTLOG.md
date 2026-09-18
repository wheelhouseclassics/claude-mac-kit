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

