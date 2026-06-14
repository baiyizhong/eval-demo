#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../services/worker"
python -m eval_platform_worker.main
echo "eval-platform-worker scaffold ready"
