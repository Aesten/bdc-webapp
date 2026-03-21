#!/usr/bin/env bash
# init.sh — run once after cloning / before first start
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

echo "[init] Working directory: $REPO_DIR"

# ── Required runtime directories ──────────────────────────────────────────────
for dir in uploads data; do
  if [ ! -d "$dir" ]; then
    mkdir -p "$dir"
    echo "[init] Created $dir/"
  else
    echo "[init] $dir/ already exists"
  fi
done

# ── Backend dependencies ───────────────────────────────────────────────────────
echo "[init] Installing backend dependencies..."
bun install

# ── Frontend dependencies + build ─────────────────────────────────────────────
echo "[init] Installing frontend dependencies..."
(cd client && bun install)

echo "[init] Building frontend..."
bun run build

echo "[init] Done. You can now start the service."
