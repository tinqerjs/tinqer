#!/usr/bin/env bash
# -------------------------------------------------------------------
# install-deps.sh – Install dependencies for all packages in the monorepo
#
# Usage:
#   ./scripts/install-deps.sh         # Install only if node_modules missing
#   ./scripts/install-deps.sh --force # Force reinstall all dependencies
# -------------------------------------------------------------------
set -euo pipefail

# Change to the project root directory
cd "$(dirname "$0")/.."

echo "=== Installing Tinqer Dependencies ==="

if [[ ! -d node_modules || "$*" == *--force* ]]; then
  echo "Installing workspace dependencies…"
  npm install
fi

echo "=== Dependency installation completed ==="
