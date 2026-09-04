#!/usr/bin/env bash
# Starts n8n with its data folder (SQLite DB, credentials, binary data, logs) kept inside this
# repo rather than in the default ~/.n8n. Always use this script, or set N8N_USER_FOLDER yourself,
# rather than a bare `npx n8n start`: otherwise n8n silently recreates its data folder in the home
# directory and the instance comes up empty.
set -euo pipefail
cd "$(dirname "$0")/.."

# n8n appends its own ".n8n" subfolder to N8N_USER_FOLDER, so this must point at the parent
# (n8n/) rather than n8n/.n8n itself, or data ends up nested one level too deep.
export N8N_USER_FOLDER="$(pwd -W 2>/dev/null || pwd)/n8n"

# n8n blocks $env access in node expressions by default since a recent breaking change. The
# "Post to Slack" node relies on $env.SLACK_WEBHOOK_URL, so this needs to be explicitly allowed.
export N8N_BLOCK_ENV_ACCESS_IN_NODE=false

exec npx n8n start
