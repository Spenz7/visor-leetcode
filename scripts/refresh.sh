#!/usr/bin/env bash
# refresh.sh — pull latest data from CSV repos and rebuild data.json.
# Run from the repo root: bash scripts/refresh.sh
set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

green()  { echo -e "\033[32m$*\033[0m"; }
yellow() { echo -e "\033[33m$*\033[0m"; }

green "\n[1/3] Pulling latest CSV data..."
git -C leetcode-company-wise-problems pull
git -C leetcode-companywise-interview-questions pull

green "\n[2/3] Rebuilding data.json..."
node scripts/build-data.mjs

green "\n[3/3] Merging Supabase extras..."
(cd web && node ../scripts/export-supabase.mjs)

green "\nDone — restart the dev server to pick up the new data.\n"
