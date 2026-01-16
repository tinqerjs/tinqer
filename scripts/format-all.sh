#!/usr/bin/env bash
set -euo pipefail

# Change to the project root directory
cd "$(dirname "$0")/.."

# Check for --check flag
CHECK_FLAG=""
if [[ "${1:-}" == "--check" ]]; then
  CHECK_FLAG="--check"
  echo "Checking formatting across all files..."
else
  echo "Formatting all files with prettier..."
fi

# Run prettier on all files
if [ -n "$CHECK_FLAG" ]; then
  git ls-files -z --cached --others --exclude-standard -- \
    "*.js" \
    "*.jsx" \
    "*.ts" \
    "*.tsx" \
    "*.json" \
    "*.md" \
    "*.yml" \
    "*.yaml" \
    | xargs -0 -r ./node_modules/.bin/prettier $CHECK_FLAG --ignore-path .prettierignore
else
  git ls-files -z --cached --others --exclude-standard -- \
    "*.js" \
    "*.jsx" \
    "*.ts" \
    "*.tsx" \
    "*.json" \
    "*.md" \
    "*.yml" \
    "*.yaml" \
    | xargs -0 -r ./node_modules/.bin/prettier --write --ignore-path .prettierignore
fi

echo "Formatting complete!"
