#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f tsconfig.test.json || ! -d tests ]]; then
  echo "Run test:build from a package workspace." >&2
  exit 1
fi

node --input-type=module -e 'import { rmSync } from "node:fs"; rmSync(".tests", { recursive: true, force: true });'
tsc -p tsconfig.test.json "$@"
