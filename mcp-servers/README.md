# Serveurs MCP : VirusTotal & AbuseIPDB

Deux serveurs [MCP](https://modelcontextprotocol.io/) minimalistes, écrits maison (voir
`docs/decisions.md` à la racine pour le choix de ne pas utiliser un paquet npm tiers), que l'agent
Gemini appelle lui-même comme outils pendant le triage, sans node HTTP n8n câblé en dur.

- `virustotal-server.js` (port 3001) : `lookup_ip`, `lookup_domain`, `lookup_file_hash`
- `abuseipdb-server.js` (port 3002) : `check_ip`

**Transport : Streamable HTTP, stateless**, chacun exposé sur `http://localhost:<port>/mcp`. Pas
du stdio : le node natif "MCP Client Tool" de n8n ne sait parler qu'à des serveurs MCP en réseau
(SSE ou HTTP Streamable), pas spawn un sous-processus, donc ces serveurs tournent en continu
plutôt que d'être lancés à la demande.

## Installation et démarrage

```bash
npm install

# Charge VT_API_KEY / ABUSEIPDB_API_KEY depuis ../.env, puis démarre les deux serveurs
# (chacun dans son propre terminal, ou en arrière-plan)
node virustotal-server.js   # http://localhost:3001/mcp
node abuseipdb-server.js    # http://localhost:3002/mcp
```

## Clés API (gratuites)

- VirusTotal : https://www.virustotal.com/gui/my-apikey (palier gratuit, ~4 req/min)
- AbuseIPDB : https://www.abuseipdb.com/account/api (palier gratuit, 1000 req/jour)

Chaque serveur lit sa clé depuis une variable d'environnement (`VT_API_KEY`,
`ABUSEIPDB_API_KEY`, voir `../.env`), jamais en dur dans le code.

Dans n8n, chaque node "MCP Client Tool" pointe simplement vers l'URL `http://localhost:<port>/mcp`
(authentification : `None`, ces serveurs ne sont exposés qu'en local), aucune clé à saisir côté
n8n : elles restent uniquement dans l'environnement des serveurs MCP eux-mêmes.

## Test manuel (sans n8n)

```bash
curl -s -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"lookup_ip","arguments":{"ip":"8.8.8.8"}}}'
```

Réponse attendue : un résultat JSON avec `malicious_votes`, `community_reputation`, etc.
