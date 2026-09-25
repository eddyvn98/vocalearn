#!/bin/sh
# Run on the owner's computer. No credentials are read from project files.
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
name=${1:-vocalearn}
case "$name" in ''|*[!a-zA-Z0-9._-]*|.|..) echo "Invalid repository name" >&2; exit 1;; esac
command -v git >/dev/null 2>&1 || { echo 'Install Git first.' >&2; exit 1; }
command -v gh >/dev/null 2>&1 || { echo 'Install the GitHub CLI first.' >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo 'Run: gh auth login' >&2; exit 1; }
login=$(gh api user --jq .login)
if git rev-parse --show-toplevel >/dev/null 2>&1; then
  top=$(git rev-parse --show-toplevel)
  [ "$top" = "$(pwd -P)" ] || { echo 'Refusing to use a parent Git project.' >&2; exit 1; }
fi
if [ -d .git ] && git remote get-url origin >/dev/null 2>&1; then
  echo 'Origin already exists. Review it manually; no overwrite or push performed.' >&2; exit 1
fi
if gh repo view "$login/$name" >/dev/null 2>&1; then
  echo "Repository $login/$name already exists. Choose another name; nothing was changed." >&2; exit 1
fi
printf 'Create PRIVATE repository %s/%s and push this project? [y/N] ' "$login" "$name"
read -r answer
case "$answer" in y|Y|yes|YES) ;; *) echo 'Cancelled.'; exit 0;; esac
if [ ! -d .git ]; then git init -b main; fi
branch=$(git branch --show-current)
[ "$branch" = main ] || { echo 'Expected main branch. Review this repository manually.' >&2; exit 1; }
git config user.name >/dev/null 2>&1 || git config user.name "$login"
git config user.email >/dev/null 2>&1 || git config user.email "$login@users.noreply.github.com"
git add .
echo 'Review the staged files. No .env, database, secrets or user uploads should appear:'
git diff --cached --stat
printf 'Commit these files and create the private repository? [y/N] '
read -r answer
case "$answer" in y|Y|yes|YES) ;; *) echo 'Cancelled. Files remain staged locally; no remote created.'; exit 0;; esac
if ! git diff --cached --quiet; then git commit -m "feat: initial VocaLearn implementation from spec v0.5"; fi
gh repo create "$login/$name" --private --source=. --remote=origin --push
gh repo view "$login/$name" --json url,visibility
