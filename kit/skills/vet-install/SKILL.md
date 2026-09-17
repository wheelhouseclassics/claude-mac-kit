---
name: vet-install
description: Vet a third-party GitHub repo for security issues and real capability, then install it only after explicit user approval. Use whenever the user shares a GitHub URL with review or install intent — "review this github repo", "is this repo safe", "any security issues?", "can it actually do what it claims?", "check out this link and install it", "install <tool> from github", or any pasted GitHub URL where the user wants to evaluate or try the project. Do NOT use for reviewing the user's own code, own repos, local projects, or pull requests — this skill is for third-party code only.
---

# Vet & Install

Two hard-gated phases. **Why the gate:** running unvetted third-party code (even `npm install` postinstall hooks) can compromise the machine — credentials, trading bots, everything. The user has explicitly asked to wait for approval every single time. Never collapse the phases.

## Phase 1 — VET (never install, never execute repo code)

**Acquire the code without running it:**
- Shallow-clone into the session scratchpad: `git clone --depth 1 <url> <scratchpad>/vet-<name>` — or fetch key files via the GitHub API for large repos.
- Do NOT run `npm install`, `pip install`, build scripts, or any code from the repo in this phase. Cloning and reading only.

**Security review — scan for:**
- Credential exfiltration: network calls that send env vars, files, or keystrokes out (grep for `process.env` / `os.environ` near `fetch`/`axios`/`requests`/`http`).
- Install hooks: `postinstall`/`preinstall` in package.json, `setup.py` side effects, Makefile install targets that fetch remote code.
- `curl | bash` / `iwr | iex` patterns anywhere (README included).
- Obfuscated code: base64 blobs, hex-encoded strings, `eval`/`exec` on constructed strings, minified files in a "source" repo.
- Suspicious dependencies: typosquats, unpinned git URLs, packages with no obvious purpose.
- Hardcoded URLs, telemetry, and analytics endpoints — list every external host the code talks to.
- If it's a Claude plugin/skill/MCP server: read the manifest — what permissions, hooks, and tools does it request? Flag anything broader than its job needs.

**Capability check:**
- Identify the core mechanism: which file/function actually does the headline thing the README claims?
- Flag claims with no implementing code ("AI-powered X" with no model call, "syncs to Y" with no Y client).
- Note maturity signals: last commit date, open issues, tests present or absent.

**Report, then STOP:**
- Verdict first: **SAFE / CAUTION / UNSAFE** with one-line justification.
- What it actually does (vs. what it claims), notable risks, external hosts contacted.
- End with: "Waiting for your approval before installing."
- **Never proceed to Phase 2 in the same turn as the vet report.** No exceptions, even if the original request said "then install it."

## Phase 2 — INSTALL (only after the user explicitly approves)

**Install by the repo's own method:** npm/pip/plugin marketplace/git clone — whatever the README prescribes. Install into `~/projects/<name>` for apps, or the tool's standard location: global CLIs via `npm install -g <pkg>` or `brew install <formula>`; Python tools into the kit venv with `~/.claude-kit/venv/bin/pip install <pkg>` (never the system Python).
- macOS gotcha: a binary downloaded from a GitHub release carries the quarantine flag and Gatekeeper refuses to run it — `xattr -d com.apple.quarantine <file>` only after confirming it is the vetted artifact. If a freshly installed tool is "not found" in this session, call it by absolute path (`/opt/homebrew/bin/<tool>`).

**For Electron/desktop apps**, create a launcher:
1. A `start-<name>.sh` in the project folder (`chmod +x` it) that **first kills stale processes on the dev port**, then launches. Electron dev servers orphan child processes on abrupt kill (learned on Krypt-Trader) — a stale process on the port makes the next launch silently fail. Pattern:
   ```bash
   #!/bin/bash
   NAME=myapp        # repo folder under ~/projects
   PORT=5173         # the dev-server port
   for pid in $(lsof -nP -tiTCP:"$PORT" -sTCP:LISTEN); do kill -9 "$pid"; done
   cd "$HOME/projects/$NAME" || exit 1
   npm run dev
   ```
2. A Desktop launcher: `~/Desktop/<Name>.command` containing `exec "$HOME/projects/<name>/start-<name>.sh"`, then `chmod +x` it — double-clicking a `.command` file in Finder runs it in Terminal.

**Verify before reporting done:**
- Actually run it: launch the app and confirm the window/port responds, hit its health endpoint, or run `<tool> --version`.
- Never report success without observed proof (output, HTTP response, or screenshot). "Install completed without errors" is not proof it runs.

**Final report:**
- Where everything landed: install path, launcher script path, Desktop launcher name.
- How to launch it and how to uninstall it (command or folder to delete).

## Hard rules
- Phase 1 executes zero repo code. Phase 2 requires an explicit user "yes" in a later turn.
- If the vet verdict is UNSAFE, refuse to install even if asked; explain the specific risk and offer alternatives.
- If CAUTION, restate the specific risk when asking for approval so the yes is informed.
