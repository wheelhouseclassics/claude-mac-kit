#!/usr/bin/env bash
# Point git at the versioned hooks (.git/hooks is never cloned) and make them executable.
set -euo pipefail
root=$(git rev-parse --show-toplevel)
cd "$root"
git config core.hooksPath scripts/git-hooks
chmod +x scripts/git-hooks/* 2>/dev/null || true
if command -v gitleaks >/dev/null 2>&1; then
  echo "git hooks installed (core.hooksPath=scripts/git-hooks); gitleaks $(gitleaks version 2>/dev/null || true)"
else
  echo "git hooks installed (core.hooksPath=scripts/git-hooks)"
  echo "WARNING: gitleaks is not on PATH — every commit will be refused until it is (brew install gitleaks)" >&2
fi
