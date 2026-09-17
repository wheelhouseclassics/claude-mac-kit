---
name: mcp-doctor
description: Diagnose and fix a local MCP server that is failing or misbehaving. Use IMMEDIATELY when the user says an MCP is "not working", "down", "won't connect", "died", "broken", mentions error "-32000", "Failed to reconnect", "tools missing", "tools not showing", "server not showing in /mcp", or asks why MCP tools disappeared. Do NOT use for building new MCP servers from scratch — this skill is repair-only.
---

# MCP Doctor

Fix a broken local MCP server with the fewest possible tool calls. Path check first — it is cheap and it is the usual root cause of a `-32000` / "Failed to reconnect" outage (project folder moved or renamed, config still points at the old path; it takes many calls to find without this checklist).

## Step 0 — Disambiguate. Always.

"My MCP server" is ambiguous. Confirm WHICH before touching anything:

- **Claude Code MCP** — defined in `~/.claude.json` (user scope, `mcpServers` block), a project `.mcp.json` (project scope), or a plugin's `.mcp.json` inside `~/.claude/plugins` (shown as `plugin:<plugin>:<server>`). `~/.claude/settings.json` decides which project servers are enabled (`enabledMcpjsonServers` / `disabledMcpjsonServers`). This skill can diagnose these.
- **Claude Desktop MCP** — different app, different config: `"$HOME/Library/Application Support/Claude/claude_desktop_config.json"` (the path has a space — always quote it). Claude Code CANNOT restart Claude Desktop or reload its extensions. Read the config to spot the error, then give the user manual steps (fix config → fully quit Claude Desktop with Cmd+Q, closing the window is not enough → relaunch).
- **A project server process** — pm2/node daemon, launchd agent, docker container, etc. Not an MCP problem; diagnose as a normal process.

A prior session burned 20 minutes assuming "my mcp server" meant a project's own server when the user meant Claude Desktop's Filesystem MCP. One confirming question is cheaper.

List what is actually configured before guessing:

```bash
claude mcp list                                  # every Claude Code server (all scopes) + connection status
jq '.mcpServers' ~/.claude.json                  # user scope — extract this block, never dump the whole file
jq '.mcpServers' .mcp.json                       # project scope (run inside the project)
jq '.mcpServers' "$HOME/Library/Application Support/Claude/claude_desktop_config.json"   # Claude Desktop
```

(`brew install jq` if missing.)

## Step 1 — Diagnostic checklist (Claude Code MCPs, most-likely first)

Run in order; stop at the first failure and report the one-line fix.

1. **Config path exists on disk?** Take the server's `command` + `args` (`claude mcp get <name>`, or the jq output above) and check every path in them with `ls -la`. Folder moves are the #1 cause of `-32000` / "Failed to reconnect". Fix = edit the path in the config, then Step 2.
2. **Command runs standalone?** e.g. `node ~/projects/<name>/src/server.js` or `npx -y <package>` — if it prints stderr and exits, the bug is in the server code (missing dep, syntax error, bad env var). Fix the code, not the config. macOS gotcha: Claude Desktop is a GUI app and does not get your shell PATH, so Homebrew's `node`, `npx`, `uvx`, `python3` are often "not found" from it — put the absolute binary path in the config (`which node` → `/opt/homebrew/bin/node`).
3. **Required port/endpoint up?** Some servers need a live dependency (a debugging port, a local API). Check it:
   ```bash
   PORT=3000
   lsof -nP -iTCP:"$PORT" -sTCP:LISTEN          # who is listening on the port (empty = nothing)
   pgrep -fl 'server.js'                        # is the server process alive
   ps aux | grep -i '[s]erver.js'               # fallback listing with full command line
   curl -sS -m 5 "http://127.0.0.1:$PORT/"      # endpoint responds?
   ```
   Server code fine + dependency down = start the dependency.
4. **Only then** look at logs, env vars, node version, permissions. Claude Desktop writes per-server logs to `~/Library/Logs/Claude/mcp-server-<name>.log` (`mcp.log` for the launcher itself); for Claude Code, `claude --debug` prints MCP connection errors at startup.

Report the diagnosis as one line: what broke, the exact fix, and that the user must run the reload dance below.

## Step 2 — The reload dance (after ANY config or server-code fix)

Claude cannot reconnect MCPs itself. Tell the user exactly this:

1. If the server code changed and it runs as a long-lived process, restart that process first (stdio servers relaunch automatically on reconnect).
2. Run `/mcp` in Claude Code → reconnect the failed server (or restart the session if the config file itself changed).
3. Once connected, deferred tools still need loading: call `ToolSearch` with `select:<tool_name>` before using any of the server's tools.

Claude Desktop: fix the config → Cmd+Q → relaunch → confirm the server shows up under the tools menu.

Do not claim the fix worked until a real tool call from that server succeeds.

## Where things live (macOS)

- `~/.claude.json` — Claude Code user-level config; `mcpServers` holds user-scope servers (`claude mcp add` writes here). The file also holds unrelated session state — extract only `mcpServers` with jq.
- `<project>/.mcp.json` — project-scope servers, checked into the repo. They run only after approval, recorded in `~/.claude/settings.json` or the project's `.claude/settings.local.json`.
- `~/.claude/settings.json` — `enabledMcpjsonServers`, `disabledMcpjsonServers`, `enableAllProjectMcpServers`.
- `~/.claude/plugins` — plugin cache. Plugin-shipped servers live inside the cached plugin folder; fix them by updating or reinstalling the plugin, not by editing the cache.
- `"$HOME/Library/Application Support/Claude/claude_desktop_config.json"` — Claude Desktop config. It may not exist until the user adds a server — if they talk about Claude Desktop MCPs, verify the file exists first (`ls -la`).
- `~/Library/Logs/Claude/` — Claude Desktop MCP logs.
