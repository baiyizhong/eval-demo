#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../services/api"
uvicorn eval_platform_api.main:app --reload --host 0.0.0.0 --port 8000
