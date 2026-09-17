#!/bin/bash
# claude-mac-kit bootstrap — one line on a fresh Apple Silicon Mac:
#
#   curl -fsSL https://raw.githubusercontent.com/wheelhouseclassics/claude-mac-kit/public/install.sh | bash
#
# What it does (each step is idempotent and prints `run`, `skip`, or `dry-run`):
#   preflight   macOS + Apple Silicon (Rosetta-aware) + Command Line Tools probe
#   sudo        asks for your password ONCE, then keeps sudo alive for the whole run
#   homebrew    Homebrew (NONINTERACTIVE; Homebrew installs the Command Line Tools itself)
#   kit-clone   this repo → ~/.claude-kit   (branch/tag: KIT_REF, default `public`)
#   brew-bundle every formula/cask in ~/.claude-kit/Brewfile, timed per item
#   node-link   node@24 is keg-only → forced link
#   tailscaled  open-source tailscaled as a system daemon (no GUI app)
#   claude-code Claude Code native installer → ~/.local/bin/claude
#   shell       ~/.zprofile: brew shellenv + ~/.local/bin (written once)
#   claude-kit  ~/.local/bin/claude-kit → ~/.claude-kit/cli/claude-kit.js
#   kit-install `claude-kit install` (skills, hooks, vault…) unless --bootstrap-only
#   extras      whisper.cpp + ffmpeg when KIT_EXTRAS=1 (or --extras)
#
# Flags:   --bootstrap-only (default for now)  --full  --dry-run  --extras  --ref <branch|tag>  --help
# Env:     KIT_REPO KIT_REF KIT_DIR KIT_EXTRAS CLAUDE_CODE_VERSION
# Test-only overrides (never set these by hand): ARCH_OVERRIDE PROC_TRANSLATED_OVERRIDE KIT_OS_OVERRIDE KIT_TTY
#
# Written for the /bin/bash 3.2 that macOS ships. Everything lives inside functions and the LAST line
# is `main "$@"`, so a truncated download can never execute half a script.
set -u

KIT_REPO="${KIT_REPO:-https://github.com/wheelhouseclassics/claude-mac-kit.git}"
KIT_REF="${KIT_REF:-public}"
KIT_DIR="${KIT_DIR:-$HOME/.claude-kit}"
KIT_EXTRAS="${KIT_EXTRAS:-0}"
KIT_TTY="${KIT_TTY:-/dev/tty}"
BREW_PREFIX="/opt/homebrew"
BREW_BIN="$BREW_PREFIX/bin/brew"
LOCAL_BIN="$HOME/.local/bin"
TAILSCALED_PLIST="/Library/LaunchDaemons/com.tailscale.tailscaled.plist"
HOMEBREW_INSTALLER_URL="https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh"
CLAUDE_INSTALLER_URL="https://claude.ai/install.sh"

DRY_RUN=0
BOOTSTRAP_ONLY=1
MAIN_STARTED=0
KEEPALIVE_PID=""
NEEDS_SUDO=0
CLT_MISSING=0
STEP_T0=0

# ---------- plumbing ----------

__on_exit() {
  local rc=$?
  if [ -n "$KEEPALIVE_PID" ]; then kill "$KEEPALIVE_PID" 2>/dev/null; fi
  if [ "$MAIN_STARTED" != 1 ]; then
    echo "install.sh: the script was truncated before main() could run (incomplete download?). Nothing was changed." >&2
    exit 70
  fi
  exit "$rc"
}
trap __on_exit EXIT

log()  { printf '%s\n' "$*"; }
warn() { printf 'warning: %s\n' "$*" >&2; }
die()  { printf 'install.sh: %s\n' "$*" >&2; exit 1; }

# step NAME STATUS [DETAIL]   → "==> [name] status - detail"   (STATUS: run | skip | dry-run)
step() {
  STEP_T0=$SECONDS
  if [ -n "${3:-}" ]; then printf '==> [%s] %s - %s\n' "$1" "$2" "$3"; else printf '==> [%s] %s\n' "$1" "$2"; fi
}
done_in() { printf '    %s done in %ss\n' "$1" "$((SECONDS - STEP_T0))"; }

# run_cmd CMD ARGS…  → executes, or prints the command under --dry-run
run_cmd() {
  if [ "$DRY_RUN" = 1 ]; then printf '    dry-run: %s\n' "$*"; return 0; fi
  "$@"
}

have() { command -v "$1" >/dev/null 2>&1; }

usage() {
  sed -n '2,24p' "$0" 2>/dev/null | sed 's/^# \{0,1\}//'
}

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --bootstrap-only) BOOTSTRAP_ONLY=1 ;;
      --full)           BOOTSTRAP_ONLY=0 ;;
      --dry-run)        DRY_RUN=1 ;;
      --extras)         KIT_EXTRAS=1 ;;
      --ref)            shift; [ $# -gt 0 ] || die "--ref needs a value"; KIT_REF="$1" ;;
      -h|--help)        usage; exit 0 ;;
      *)                die "unknown argument: $1 (try --help)" ;;
    esac
    shift
  done
}

# ---------- steps ----------

preflight() {
  step preflight run
  local os arch translated ver major
  os="${KIT_OS_OVERRIDE:-$(uname -s)}"
  [ "$os" = "Darwin" ] || die "this installer is for macOS only (uname -s says: $os)"

  arch="${ARCH_OVERRIDE:-$(uname -m)}"
  translated="${PROC_TRANSLATED_OVERRIDE:-$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)}"
  case "$arch" in
    arm64)
      log "    cpu: Apple Silicon (arm64)" ;;
    x86_64)
      if [ "$translated" = "1" ]; then
        log "    cpu: x86_64 reported under Rosetta (sysctl.proc_translated=1) - treating as Apple Silicon (arm64)"
      else
        printf '\n' >&2
        printf 'install.sh: this Mac reports an Intel CPU (x86_64).\n' >&2
        printf 'claude-mac-kit supports Apple Silicon only (M1 or later). Nothing was installed.\n' >&2
        exit 1
      fi ;;
    *)
      die "unsupported CPU architecture: $arch (Apple Silicon required)" ;;
  esac

  ver="$(sw_vers -productVersion 2>/dev/null || echo unknown)"
  log "    macOS: $ver   bash: ${BASH_VERSION:-unknown}"
  if [ "$ver" != "unknown" ]; then
    major="${ver%%.*}"
    case "$major" in
      ''|*[!0-9]*) ;;
      *) [ "$major" -ge 14 ] || warn "macOS $ver is older than the kit was tested on (14+). Continuing." ;;
    esac
  fi

  # Command Line Tools pre-check. We only PROBE. If they are missing, Homebrew's installer performs the
  # headless install itself (softwareupdate). The kit never launches the interactive CLT dialog.
  if xcode-select -p >/dev/null 2>&1; then
    log "    Command Line Tools: present ($(xcode-select -p 2>/dev/null))"
  else
    CLT_MISSING=1
    log "    Command Line Tools: not found - Homebrew will install them headlessly via softwareupdate (expect +5-10 min)"
  fi

  if [ -x "$BREW_BIN" ] || have brew; then log "    Homebrew: present"; else NEEDS_SUDO=1; log "    Homebrew: missing (will install; needs sudo once)"; fi
  if [ -f "$TAILSCALED_PLIST" ]; then log "    tailscaled daemon: installed"; else NEEDS_SUDO=1; log "    tailscaled daemon: not installed (needs sudo once)"; fi
  done_in preflight
}

sudo_keepalive() {
  while true; do
    sudo -n true 2>/dev/null || exit
    sleep 45
    kill -0 "$1" 2>/dev/null || exit
  done
}

ensure_sudo() {
  if [ "$NEEDS_SUDO" != 1 ]; then step sudo skip "nothing in this run needs root"; return 0; fi
  if [ "$DRY_RUN" = 1 ]; then step sudo dry-run "would prime sudo (sudo -v) once and keep it alive during the run"; return 0; fi
  if sudo -n true 2>/dev/null; then
    step sudo skip "credentials already cached"
  else
    # No terminal to ask on (plain `ssh` without -t, cron, a script) → fail fast, before anything downloads.
    if ! { exec 3<"$KIT_TTY"; } 2>/dev/null; then
      printf '\n' >&2
      printf 'install.sh: sudo needs your macOS password but there is no terminal to ask on.\n' >&2
      printf 'Please run this in Terminal (or over ssh -t), not from a script, cron, or a plain ssh session.\n' >&2
      exit 1
    fi
    exec 3<&-
    step sudo run "asking for your macOS password once (Homebrew + system daemons)"
    # shellcheck disable=SC2024  # deliberate: the redirect hands sudo the terminal as stdin
    sudo -v <"$KIT_TTY" || die "sudo did not succeed"
  fi
  sudo_keepalive $$ >/dev/null 2>&1 &
  KEEPALIVE_PID=$!
}

brew_env() {
  if [ -x "$BREW_BIN" ]; then eval "$("$BREW_BIN" shellenv)"; fi
  export HOMEBREW_NO_ENV_HINTS=1 HOMEBREW_NO_INSTALL_CLEANUP=1 HOMEBREW_NO_ANALYTICS=1
}

install_homebrew() {
  if [ -x "$BREW_BIN" ] || have brew; then
    step homebrew skip "already installed"
  elif [ "$DRY_RUN" = 1 ]; then
    step homebrew dry-run "would install Homebrew with NONINTERACTIVE=1 (it installs the Command Line Tools if missing)"
  else
    step homebrew run "downloading the official installer (NONINTERACTIVE=1)"
    [ "$CLT_MISSING" = 1 ] && log "    Homebrew is installing the Command Line Tools first (softwareupdate) - this is the slow part"
    NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL "$HOMEBREW_INSTALLER_URL")" </dev/null || die "Homebrew installation failed"
    [ -x "$BREW_BIN" ] || die "Homebrew finished but $BREW_BIN is missing"
    done_in homebrew
  fi
  brew_env
}

clone_kit() {
  if [ -d "$KIT_DIR/.git" ]; then
    step kit-clone skip "$KIT_DIR exists (ref $(git -C "$KIT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?'))"
    return 0
  fi
  if [ "$DRY_RUN" = 1 ]; then
    step kit-clone dry-run "would git clone --depth 1 --branch $KIT_REF $KIT_REPO $KIT_DIR"
    return 0
  fi
  have git || die "git is not available even after Homebrew installed the Command Line Tools"
  step kit-clone run "git clone --depth 1 --branch $KIT_REF"
  git clone --quiet --depth 1 --branch "$KIT_REF" "$KIT_REPO" "$KIT_DIR" || die "git clone of $KIT_REPO ($KIT_REF) failed"
  done_in kit-clone
}

# brew_items FILE   → "formula name" / "cask name" lines from a Brewfile (comments stripped)
brew_items() {
  sed -e 's/#.*$//' "$1" | awk '$1=="brew"||$1=="cask"{gsub(/"/,"",$2); print ($1=="brew"?"formula":"cask"), $2}'
}

# install_brewfile LABEL FILE   → per-item install with wall clock; skip when already present
install_brewfile() {
  local label="$1" file="$2" kind name t0 n=0 installed=0
  if [ ! -f "$file" ]; then
    if [ "$DRY_RUN" = 1 ]; then step "$label" dry-run "would install every item in $file"; return 0; fi
    die "$file not found (kit clone incomplete?)"
  fi
  step "$label" run "$file"
  while read -r kind name; do
    [ -n "$name" ] || continue
    n=$((n + 1))
    if [ "$kind" = "cask" ]; then
      if brew list --cask "$name" >/dev/null 2>&1; then log "    cask $name skip"; continue; fi
    else
      if brew list --formula "$name" >/dev/null 2>&1; then log "    brew $name skip"; continue; fi
    fi
    if [ "$DRY_RUN" = 1 ]; then
      if [ "$kind" = "cask" ]; then log "    dry-run: brew install --cask $name"; else log "    dry-run: brew install $name"; fi
      continue
    fi
    t0=$SECONDS
    if [ "$kind" = "cask" ]; then
      brew install --cask --quiet "$name" </dev/null || die "brew install --cask $name failed"
    else
      brew install --quiet "$name" </dev/null || die "brew install $name failed"
    fi
    installed=$((installed + 1))
    log "    $kind $name installed in $((SECONDS - t0))s"
  done <<EOF
$(brew_items "$file")
EOF
  if [ "$installed" = 0 ]; then log "    all $n items already present"; fi
  done_in "$label"
}

brew_bundle() {
  local file="$KIT_DIR/Brewfile"
  if ! have brew && [ "$DRY_RUN" = 1 ]; then step brew-bundle dry-run "would brew install every item in $file, then brew bundle check"; return 0; fi
  install_brewfile brew-bundle "$file"
  if [ "$DRY_RUN" != 1 ]; then
    HOMEBREW_BUNDLE_NO_LOCK=1 brew bundle check --file="$file" --no-upgrade >/dev/null 2>&1 || die "brew bundle check --file=$file is not satisfied"
  fi
}

link_node() {
  if [ "$DRY_RUN" = 1 ] && ! have brew; then step node-link dry-run "would brew link --overwrite --force node@24 (keg-only)"; return 0; fi
  if "$BREW_PREFIX/bin/node" -v 2>/dev/null | grep -q '^v24\.'; then
    step node-link skip "$("$BREW_PREFIX/bin/node" -v) already linked"
    return 0
  fi
  step node-link run "node@24 is keg-only"
  run_cmd brew link --overwrite --force node@24 || die "brew link node@24 failed"
  done_in node-link
}

install_tailscaled_daemon() {
  if [ -f "$TAILSCALED_PLIST" ]; then step tailscaled skip "daemon already installed"; return 0; fi
  if [ "$DRY_RUN" = 1 ]; then step tailscaled dry-run "would sudo tailscaled install-system-daemon"; return 0; fi
  step tailscaled run "installing the open-source tailscaled as a system daemon"
  sudo "$BREW_PREFIX/bin/tailscaled" install-system-daemon || die "tailscaled install-system-daemon failed"
  done_in tailscaled
}

install_claude_code() {
  local tmp
  if [ -x "$LOCAL_BIN/claude" ] || have claude; then step claude-code skip "already installed ($("$LOCAL_BIN/claude" --version 2>/dev/null || claude --version 2>/dev/null || echo present))"; return 0; fi
  if [ "$DRY_RUN" = 1 ]; then step claude-code dry-run "would run the Claude Code native installer ($CLAUDE_INSTALLER_URL)"; return 0; fi
  step claude-code run "downloading the native installer"
  tmp="$(mktemp "${TMPDIR:-/tmp}/claude-install.XXXXXX")" || die "mktemp failed"
  curl -fsSL "$CLAUDE_INSTALLER_URL" -o "$tmp" || die "could not download $CLAUDE_INSTALLER_URL"
  # shellcheck disable=SC2086
  bash "$tmp" ${CLAUDE_CODE_VERSION:-} </dev/null || die "Claude Code installer failed"
  rm -f "$tmp"
  [ -x "$LOCAL_BIN/claude" ] || warn "installer finished but $LOCAL_BIN/claude is missing; check the output above"
  done_in claude-code
}

write_shell_profile() {
  local f="$HOME/.zprofile" need_brew=1 need_local=1
  if [ -f "$f" ]; then
    grep -qF 'brew shellenv' "$f" && need_brew=0
    grep -qF '.local/bin' "$f" && need_local=0
  fi
  if [ "$need_brew" = 0 ] && [ "$need_local" = 0 ]; then step shell skip "$f already has brew shellenv + ~/.local/bin"; return 0; fi
  if [ "$DRY_RUN" = 1 ]; then step shell dry-run "would append brew shellenv / ~/.local/bin lines to $f"; return 0; fi
  step shell run "appending to $f"
  {
    printf '\n# claude-mac-kit\n'
    # shellcheck disable=SC2016  # literal $(...) and $HOME are exactly what .zprofile must contain
    [ "$need_brew" = 1 ] && printf 'eval "$(%s shellenv)"\n' "$BREW_BIN"
    # shellcheck disable=SC2016
    [ "$need_local" = 1 ] && printf 'export PATH="$HOME/.local/bin:$PATH"\n'
  } >>"$f"
  done_in shell
}

link_claude_kit() {
  local target="$KIT_DIR/cli/claude-kit.js" link="$LOCAL_BIN/claude-kit"
  if [ "$(readlink "$link" 2>/dev/null)" = "$target" ]; then step claude-kit skip "$link already points at the kit"; return 0; fi
  if [ "$DRY_RUN" = 1 ]; then step claude-kit dry-run "would ln -sf $target $link"; return 0; fi
  step claude-kit run "linking $link"
  mkdir -p "$LOCAL_BIN"
  ln -sf "$target" "$link"
  done_in claude-kit
}

kit_install() {
  if [ "$BOOTSTRAP_ONLY" = 1 ]; then step kit-install skip "--bootstrap-only (default in this kit version; pass --full to run claude-kit install)"; return 0; fi
  if [ "$DRY_RUN" = 1 ]; then step kit-install dry-run "would run claude-kit install"; return 0; fi
  step kit-install run "claude-kit install"
  PATH="$BREW_PREFIX/bin:$LOCAL_BIN:$PATH" "$LOCAL_BIN/claude-kit" install || die "claude-kit install failed"
  done_in kit-install
}

install_extras() {
  if [ "$KIT_EXTRAS" != 1 ]; then step extras skip "set KIT_EXTRAS=1 (or --extras) for whisper.cpp + ffmpeg"; return 0; fi
  if ! have brew && [ "$DRY_RUN" = 1 ]; then step extras dry-run "would brew install every item in $KIT_DIR/Brewfile.extras"; return 0; fi
  install_brewfile extras "$KIT_DIR/Brewfile.extras"
}

summary() {
  log ""
  log "claude-mac-kit bootstrap finished in ${SECONDS}s."
  log "Open a NEW Terminal window (or run: exec zsh -l) so PATH picks up Homebrew and ~/.local/bin."
  if [ "$BOOTSTRAP_ONLY" = 1 ]; then log "Next: claude-kit install   (or re-run this installer with --full)"; else log "Next: claude-kit setup"; fi
}

# ---------- main ----------

main() {
  MAIN_STARTED=1
  parse_args "$@"
  [ "$DRY_RUN" = 1 ] && log "(dry-run: nothing will be downloaded, written, or asked)"
  preflight
  ensure_sudo
  install_homebrew
  clone_kit
  brew_bundle
  link_node
  install_tailscaled_daemon
  install_claude_code
  write_shell_profile
  link_claude_kit
  kit_install
  install_extras
  summary
}

main "$@"
