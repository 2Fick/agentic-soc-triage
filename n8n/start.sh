#!/usr/bin/env bash
# Starts n8n with its data folder (SQLite DB, credentials, binary data, logs) on D: instead of
# the default ~/.n8n, see docs/disk-usage-tracking.md for why. Always use this script (or set
# N8N_USER_FOLDER directly) rather than a bare `npx n8n start`, or n8n will silently recreate its
# data folder on C:.
set -euo pipefail
cd "$(dirname "$0")/.."

export N8N_USER_FOLDER="$(pwd -W 2>/dev/null || pwd)/n8n/.n8n"
exec npx n8n start
