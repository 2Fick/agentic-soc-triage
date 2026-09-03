# Décisions de design

Journal des choix qui engagent le projet. Format court : contexte, décision, raison.

## 2026-09-03 : Hébergement du manager Wazuh, local (Docker Desktop / WSL2)

**Contexte** : Wazuh manager est Linux-only. Sous Windows, deux options : Docker Desktop (WSL2,
nécessite la virtualisation matérielle) ou une VM cloud gratuite (ex. Oracle Cloud Always Free).

**Vérification** : Gestionnaire des tâches, Performances, CPU, Virtualisation = **Activée**.
Docker Desktop et WSL2 (distributions `Ubuntu` et `docker-desktop`) étaient déjà installés sur la
machine, non lancés.

**Décision** : manager Wazuh en conteneurs Docker, en local, via `docker compose`. Pas besoin de
VM cloud, la démo en entretien se fera en local (screen-recording ou machine présente).

**Alternative rejetée** : VM cloud (Oracle Cloud Always Free). Aurait donné une URL démontrable à
distance, mais ajoute de la complexité réseau (exposition publique d'un manager Wazuh et webhook
n8n) pour un gain marginal vu que la virtualisation locale est disponible sans effort. Peut être
reconsidéré en Phase 5 si une démo à distance s'avère utile.

## 2026-09-03 : Serveurs MCP VirusTotal/AbuseIPDB, écrits maison, pas des paquets npm tiers

**Contexte** : des serveurs MCP communautaires existent déjà sur npm pour VirusTotal et AbuseIPDB
(ex. `@burtthecoder/mcp-virustotal`, `@pipeworx/mcp-abuseipdb`), installables via `npx` sans écrire
de code.

**Décision** : écrire des serveurs MCP minimalistes maison (SDK officiel MCP), plutôt que
d'exécuter du code tiers non audité qui manipulerait des clés API VirusTotal/AbuseIPDB. Deux
raisons : (1) sécurité, ce sont des paquets peu téléchargés, d'auteurs inconnus, exécuter du code
arbitraire avec des clés API en entrée va à l'encontre de l'esprit d'un projet de sécurité ; (2)
valeur CV, "j'ai construit un serveur MCP" démontre une compréhension du protocole, "j'ai lancé le
paquet npm de quelqu'un d'autre" n'en démontre aucune.

## 2026-09-03 : Transport MCP, Streamable HTTP plutôt que stdio

**Contexte** : le plan initial faisait tourner les serveurs MCP en stdio, spawnés comme
sous-processus par n8n. En inspectant le code source du node natif "MCP Client Tool" de n8n
(`@n8n/n8n-nodes-langchain`, v2.22.6), il ne supporte que des transports réseau, SSE ou HTTP
Streamable (`serverTransport`: `sse` | `httpStreamable`), pas de spawn de commande locale.

**Décision** : les deux serveurs MCP tournent en Streamable HTTP (mode stateless, un
`McpServer`+`transport` neuf par requête HTTP, pattern de l'exemple officiel du SDK
`simpleStatelessStreamableHttp.ts`), exposés sur `http://localhost:3001/mcp` (VirusTotal) et
`http://localhost:3002/mcp` (AbuseIPDB). n8n s'y connecte avec authentification `None` (local
uniquement). Validé avec de vrais appels (VirusTotal sur 8.8.8.8, AbuseIPDB sur une IP réelle).

**Alternative rejetée** : le community node `n8n-nodes-mcp` supporte le stdio, mais c'est à
nouveau du code tiers nécessitant l'installation d'un community node, même arbitrage sécurité que
pour les serveurs MCP eux-mêmes (voir décision ci-dessus).
