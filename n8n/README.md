# n8n triage workflow

## Start

Always use the start script, never a bare `npx n8n start`:

```bash
./start.sh
```

It sets `N8N_USER_FOLDER` so the data folder stays inside the repo, and
`N8N_BLOCK_ENV_ACCESS_IN_NODE=false` which recent n8n versions require for the Slack node to read
`SLACK_WEBHOOK_URL` from the environment. The editor is then at http://localhost:5678.

## First-time setup

n8n asks for a local owner account on first access. Email and password are local only, nothing is
sent anywhere.

1. Open http://localhost:5678 and create the owner account.
2. Import the workflow if it is not already there:
   ```bash
   N8N_USER_FOLDER="$(pwd)" npx n8n import:workflow --input=workflows/wazuh-triage.json
   ```
3. Open the **Wazuh Agentic Triage** workflow, select the node **Gemini Chat Model**, and create a
   credential of type Google Gemini(PaLM) Api with the `GEMINI_API_KEY` value from `../.env`.
4. Publish the workflow.

Nothing else needs configuring. The two MCP Client Tool nodes point at `http://localhost:3001/mcp`
and `:3002/mcp` with no authentication, since those servers are local only, and the Slack node reads
its webhook URL straight from the environment.

## What has to be running

```bash
# MCP servers, with the API keys loaded from .env
cd mcp-servers && set -a && source ../.env && set +a
node virustotal-server.js &
node abuseipdb-server.js &

# n8n, which also needs SLACK_WEBHOOK_URL from .env
cd n8n && set -a && source ../.env && set +a && ./start.sh

# Wazuh, see wazuh/README.md
```

## The workflow

`Wazuh Alert Webhook` receives alerts at `/webhook/wazuh-alert`, posted by the Wazuh integration.

`Triage Cascade` decides whether the alert needs the model at all: it deduplicates against recent
verdicts, settles alerts with no actionable indicator on its own, and enforces the spend guard. Only
what is left goes to `Triage Agent`, which runs Gemini with the two MCP tool servers attached and an
enforced output schema. `Record Verdict` caches the result so a repeat of the same alert is answered
without a second model call.

Both paths end at `Post to Slack`, which reports the verdict along with the triage path taken and
the running count of model calls for the day.

## Editing the workflow

Edit it in the UI, then export it back so the change is versioned:

```bash
N8N_USER_FOLDER="$(pwd)" npx n8n export:workflow --id=<id> --output=workflows/wazuh-triage.json
```

Two things worth knowing when editing the JSON directly rather than through the UI. Node parameter
names are version-specific, and an unknown name is ignored silently with the default applied, so
check the node source for the `typeVersion` in use. And n8n keeps published versions separately from
the working copy, so a direct database edit will not take effect: reimport and publish instead.

## Manual test, without Wazuh

```bash
curl -X POST http://localhost:5678/webhook/wazuh-alert \
  -H "Content-Type: application/json" \
  -d '{"alert":{"rule":{"id":"5710","level":10,"description":"sshd: brute force attempt"},"full_log":"...","srcip":"8.8.8.8"}}'
```
