#!/usr/bin/env bash
# setup.sh — clone/update data repos, build data.json, and start the dev server.
# Run from the repo root: bash scripts/setup.sh
set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# ─── Helpers ─────────────────────────────────────────────────────────────────

green()  { echo -e "\033[32m$*\033[0m"; }
yellow() { echo -e "\033[33m$*\033[0m"; }
red()    { echo -e "\033[31m$*\033[0m"; }

clone_or_pull() {
  local url="$1"
  local dir="$2"
  if [ -d "$dir/.git" ]; then
    yellow "Updating $dir..."
    git -C "$dir" pull
  else
    yellow "Cloning $url → $dir..."
    git clone "$url" "$dir"
  fi
}

# ─── Step 1: Data repos ───────────────────────────────────────────────────────

green "\n[1/4] Data repos"
clone_or_pull \
  "https://github.com/liquidslr/leetcode-company-wise-problems.git" \
  "leetcode-company-wise-problems"

clone_or_pull \
  "https://github.com/snehasishroy/leetcode-companywise-interview-questions.git" \
  "leetcode-companywise-interview-questions"

# ─── Step 2: Build data.json from CSV repos ───────────────────────────────────

green "\n[2/4] Building data.json from CSV repos..."
node scripts/build-data.mjs

# ─── Step 3: Merge Supabase extras ───────────────────────────────────────────

green "\n[3/4] Merging Supabase extras..."
(cd web && node ../scripts/export-supabase.mjs)

# ─── Step 4: Install deps + start dev server ─────────────────────────────────

green "\n[4/4] Starting dev server..."
if [ ! -d "web/node_modules" ]; then
  yellow "Installing dependencies..."
  (cd web && npm install)
fi

green "\nSetup complete — starting http://localhost:5173/visor-leetcode/\n"
(cd web && npm run dev)
