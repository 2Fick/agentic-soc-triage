# n8n : workflow de triage

## Démarrage

Toujours via ce script (garde les données sur D:, voir `docs/disk-usage-tracking.md`) :

```bash
./start.sh
```

Éditeur accessible sur http://localhost:5678.

## Configuration initiale (une seule fois)

n8n exige un compte owner local au premier accès (email et mot de passe, purement local, aucun
envoi réel).

1. Ouvrir http://localhost:5678 et suivre l'écran de création de compte owner.
2. Le workflow "Wazuh Agentic Triage" est déjà importé (voir `workflows/wazuh-triage.json`),
   l'ouvrir depuis la liste des workflows.
3. Sur le node "Gemini Chat Model" : cliquer dessus, dans le champ credential créer une nouvelle
   credential (`Create New Credential`) de type Google Gemini(PaLM) Api, coller la valeur de
   `GEMINI_API_KEY` (depuis `../.env`) dans le champ "API Key", sauvegarder.
4. Publier / activer le workflow.

Rien d'autre à configurer : les deux nodes "MCP Client Tool" (VirusTotal, AbuseIPDB) pointent vers
`http://localhost:3001/mcp` et `:3002/mcp` sans authentification (serveurs locaux, voir
`../mcp-servers/README.md`), et le node "Post to Slack" lit `SLACK_WEBHOOK_URL` directement depuis
l'environnement du processus n8n, aucune credential n8n à créer pour ces trois-là.

## Prérequis à chaque démarrage

Avant d'activer/tester le workflow, ces 3 services doivent tourner :

```bash
# Terminal 1 : serveurs MCP (charge les clés depuis .env)
cd mcp-servers && set -a && source ../.env && set +a
node virustotal-server.js &
node abuseipdb-server.js &

# Terminal 2 : n8n (charge SLACK_WEBHOOK_URL depuis .env pour le node Post to Slack)
cd n8n && set -a && source ../.env && set +a && ./start.sh

# Wazuh (Docker) : voir wazuh/README.md
```

## Le workflow

`Wazuh Alert Webhook` (`/webhook/wazuh-alert`, appelé par l'intégration custom Wazuh, voir
`../wazuh/config/wazuh_cluster/wazuh_manager.conf`) vers `Triage Agent` (agent Gemini,
tool-calling agentique vers les 2 serveurs MCP, sortie structurée forcée par `Triage Verdict
Schema`) vers `Post to Slack`.

Le prompt système du `Triage Agent` définit sévérité/verdict/action (`auto_close`/`escalate`) avec
un biais volontaire vers l'escalade en cas de doute, voir `docs/decisions.md` pour le
raisonnement. Pour l'ajuster : éditer le node dans l'UI, puis ré-exporter avec :

```bash
N8N_USER_FOLDER="$(pwd)/.n8n" npx n8n export:workflow --id=<id> --output=workflows/wazuh-triage.json
```

## Test manuel (sans passer par Wazuh)

```bash
curl -X POST http://localhost:5678/webhook/wazuh-alert \
  -H "Content-Type: application/json" \
  -d '{"alert":{"rule":{"id":"5710","level":10,"description":"sshd: brute force attempt"},"full_log":"...","srcip":"8.8.8.8"}}'
```
