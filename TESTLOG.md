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
_No runs yet. Each run: date, commit/tag installed (`KIT_REF`), command pasted, exit code, per-step timing table above, gate results, anomalies._
