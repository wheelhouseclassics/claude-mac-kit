#!/bin/bash
# claude-mac-kit — bench-teardown: scrub a rented test Mac at the end of a burst, BEFORE the lease ends.
# Runs ON the Mac (over SSH or in Terminal). Idempotent: every step prints `skip` when there is nothing to do.
# Usage: claude-kit bench-teardown [--dry-run]     (or: bash ~/.claude-kit/scripts/bench-teardown.sh)
set -u

step() { printf '==> [%s] %s\n' "$1" "$2"; }

main() {
  local dry=0
  [ "${1:-}" = "--dry-run" ] && dry=1
  # act CMD…  → runs quietly, or prints the command under --dry-run
  act() { if [ "$dry" = 1 ]; then printf '    dry-run: %s\n' "$*"; else "$@" >/dev/null 2>&1; fi; }

  # 1. Claude Code: sign out (Keychain item + ~/.claude/.credentials.json fallback)
  if command -v claude >/dev/null 2>&1; then
    step claude "logout"
    act claude auth logout || act claude logout || true
  else
    step claude "skip (not installed)"
  fi
  if security find-generic-password -s 'Claude Code-credentials' >/dev/null 2>&1; then
    step keychain "delete 'Claude Code-credentials'"
    act security delete-generic-password -s 'Claude Code-credentials' || true
  else
    step keychain "skip (no 'Claude Code-credentials' item)"
  fi

  # 2. GitHub CLI
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    step gh "logout"
    act gh auth logout --hostname github.com || true
  else
    step gh "skip (not logged in)"
  fi

  # 3. Tailscale: drop Funnel handlers, then log the node out (open-source tailscaled, D9)
  if command -v tailscale >/dev/null 2>&1; then
    step tailscale "funnel reset + logout"
    act tailscale funnel reset || true
    act tailscale logout || true
  else
    step tailscale "skip (not installed)"
  fi

  # 4. Secrets on disk: credentials/, the telegram channel env, the plaintext Claude fallback
  local p
  for p in "$HOME/.claude/credentials" "$HOME/.claude/channels/telegram" "$HOME/.claude/.credentials.json"; do
    if [ -e "$p" ]; then
      step files "rm -rf $p"
      act rm -rf "$p"
    else
      step files "skip ($p absent)"
    fi
  done

  # 5. Server-side removals the Mac cannot do for you
  cat <<'CHECKLIST'
Server-side removals (browser; do these before deleting the instance):
  [ ] Tailscale admin console: delete the bench machine; revoke any auth key minted for it
  [ ] GitHub > Settings > Applications > Authorized OAuth Apps: revoke "GitHub CLI" for this Mac
  [ ] claude.ai > Settings > Sessions/devices: sign the bench out
  [ ] Telegram @BotFather: /revoke if a real bot token was pasted on the bench
  [ ] MarketCheck / Airtable: rotate any key pasted on the bench
  [ ] Composio dashboard: disconnect the bench's Gmail/Drive connections
  [ ] Provider console: delete the instance; record end time + final spend in TESTLOG.md
CHECKLIST
}

main "$@"
