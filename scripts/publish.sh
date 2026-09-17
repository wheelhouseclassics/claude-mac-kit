#!/usr/bin/env bash
# Build the `public` orphan branch from HEAD using a WHITELIST of paths and push ONLY that branch (plus its tags).
# main (idea.md, proposed-plan.md, PLAN.md, PROGRESS.md, .pipeline/) is never pushed to the public remote (D12).
#   scripts/publish.sh [--remote NAME] [--tag vX.Y.Z] [--no-push]
set -euo pipefail

remote="origin"; push=1; tag=""
while [ $# -gt 0 ]; do
  case "$1" in
    --remote) remote="$2"; shift 2 ;;
    --tag) tag="$2"; shift 2 ;;
    --no-push) push=0; shift ;;
    -h|--help) echo "usage: scripts/publish.sh [--remote NAME] [--tag vX.Y.Z] [--no-push]"; exit 0 ;;
    *) echo "publish: unknown argument $1" >&2; exit 2 ;;
  esac
done

root=$(git rev-parse --show-toplevel)
cd "$root"
head=$(git rev-parse HEAD)
short=$(git rev-parse --short HEAD)

# Whitelist of paths that may exist on the public branch. Everything else (pipeline internals) stays on main.
allow='^(install\.sh|Brewfile|Brewfile\.extras|scripts/bench-teardown\.sh|README\.md|LICENSE|TESTLOG\.md|GUIDE\.(md|html)|manifest\.json|manifest\.schema\.json|package\.json|\.gitleaks\.toml|\.gitattributes|\.gitignore|kit/.+|cli/.+|test/.+|\.github/.+|scripts/build-[^/]+|scripts/export-airtable-schema\.js|scripts/lib/.+|scripts/manifest-config\.js|scripts/install-git-hooks\.sh|scripts/publish\.sh|scripts/git-hooks/.+)$'
deny='^(\.pipeline/|idea\.md$|proposed-plan\.md$|PLAN\.md$|PROGRESS\.md$)'

tmpidx=$(mktemp)
trap 'rm -f "$tmpidx"' EXIT
export GIT_INDEX_FILE="$tmpidx"
git read-tree --empty
git ls-tree -r "$head" -z | while IFS= read -r -d '' entry; do
  meta=${entry%%$'\t'*}
  p=${entry#*$'\t'}
  mode=${meta%% *}
  rest=${meta#* }
  sha=${rest#* }
  if printf '%s\n' "$p" | grep -Eq "$deny"; then continue; fi
  if printf '%s\n' "$p" | grep -Eq "$allow"; then printf '%s %s\t%s\0' "$mode" "$sha" "$p"; fi
done | git update-index -z --index-info
tree=$(git write-tree)
unset GIT_INDEX_FILE

parent=$(git rev-parse -q --verify refs/heads/public 2>/dev/null || true)
if [ -n "$parent" ] && [ "$(git rev-parse "$parent^{tree}")" = "$tree" ]; then
  echo "publish: no changes (public already matches HEAD $short)"
else
  if [ -n "$parent" ]; then
    commit=$(git commit-tree "$tree" -p "$parent" -m "publish: $short")
  else
    commit=$(git commit-tree "$tree" -m "publish: $short (orphan root)")
  fi
  git update-ref refs/heads/public "$commit"
  echo "publish: public -> $commit (from $short)"
fi

if [ -n "$tag" ]; then
  git tag -f "$tag" refs/heads/public
  echo "publish: tagged $tag on public"
fi

if [ "$push" = 1 ]; then
  git push "$remote" refs/heads/public:refs/heads/public
  for t in $(git tag --merged refs/heads/public); do
    git push "$remote" "refs/tags/$t:refs/tags/$t"
  done
fi
