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

## 2026-09-03 : Incident - flood d'alertes SCA, désactivation du module SCA

**Contexte** : une fois l'agent Windows connecté et Sysmon actif, environ 338 exécutions n8n se
sont déclenchées en quelques minutes (335 en erreur). En creusant les logs d'alertes Wazuh, la
quasi-totalité (306+) venait de la règle 19007, une alerte de niveau 7 générée par le module SCA
(Security Configuration Assessment) pour **chaque contrôle de conformité échoué** lors d'un scan
CIS Benchmark. Le scan tournait contre un container dont la distribution ne correspond même pas
au benchmark testé (CIS Amazon Linux 2023 sur une image qui n'est pas Amazon Linux), garantissant
un taux d'échec élevé et donc un flot d'alertes. Chaque alerte de niveau >= 7 déclenchait l'agent
Gemini via l'intégration n8n, ce qui a très probablement épuisé le quota gratuit de la clé API
(explique les erreurs `fetch failed`/503 rencontrées pendant les tests de la Phase 3).

**Décision** : désactiver entièrement le module SCA (`<sca><enabled>no</enabled></sca>`) : le
scan de conformité n'apporte rien à l'objectif du projet (détection et triage d'attaques) et son
coût (bruit, épuisement du quota LLM) dépasse largement sa valeur ici. Le seuil de déclenchement
de l'intégration n8n est aussi relevé de niveau 7 à niveau 10, en marge de sécurité contre
d'autres sources de bruit ambiant (ex. une règle PowerShell générique de niveau 9 observée dans le
même flot).

**Leçon** : dans un pipeline qui déclenche un appel LLM par alerte, le filtre de déclenchement
doit être pensé dès le départ pour exclure le bruit de fond (conformité, scans périodiques), pas
seulement le niveau de sévérité brut d'une règle Wazuh isolée.

**Suite** : en creusant, le module de détection de vulnérabilités (CVE) présentait le même risque
(CVE Critical = niveau 13, High = niveau 10, les deux au-dessus du seuil de déclenchement, avec
600+ CVE détectées sur les paquets installés) et a été désactivé par la même logique. Le SCA
tournait aussi côté agent Windows (scan CIS séparé de celui du manager), désactivé via la
configuration partagée (`config/agent.conf`). Après ces trois désactivations, plus aucun flot
constaté sur une nouvelle série de tests.

## 2026-09-03 : Règles de détection custom pour les scénarios d'attaque

**Contexte** : hypothèse de départ du projet ("le ruleset par défaut de Wazuh couvre déjà la
plupart des techniques Atomic Red Team via Sysmon") vérifiée fausse en pratique pour certains cas.
Le ruleset par défaut contient bien des règles Sysmon (`0800-sysmon_id_1.xml`,
`0860-sysmon_id_13.xml`, etc.), mais leur déclenchement s'est avéré peu fiable lors des tests :
la règle intégrée pour PowerShell encodé (92057) n'a fini par se déclencher correctement qu'après
un redémarrage complet du manager (`wazuh-control restart`, pas un simple `docker compose
restart`).

**Décision** : écrire des règles custom dans `wazuh/config/local_rules.xml` pour les 3 techniques
simulées, en s'appuyant sur la structure exacte des événements Sysmon capturés sur cette machine
(vérifiée via `wazuh-logtest` et l'archivage complet temporaire, voir méthode dans le code). Deux
des trois règles (T1059.001 encodage PowerShell, T1053.005 tâche planifiée) sont confirmées
fonctionnelles avec de vraies alertes de niveau 12 et tags MITRE ATT&CK corrects. La troisième
(T1547.001, clé de registre Run) reste un problème ouvert : la structure de l'événement capturé
correspond exactement à ce que la règle attend (vérifié champ par champ), mais ni la règle custom
ni la règle intégrée équivalente (92300/92301) ne se déclenchent pour ce cas précis, pour une
raison non identifiée à ce stade. À reprendre en Phase 5 si le temps le permet, sinon documenté
comme limitation connue plutôt que laissé silencieux.

## 2026-09-04 : Garde-fou anti-flood dans le workflow n8n, et bug persistant du schéma de sortie

**Contexte** : suite à l'incident de flood SCA/CVE (voir plus haut, confirmé par le tableau de bord
d'usage de la clé API Gemini : ~400 requêtes, dont des erreurs 429 TooManyRequests, en quelques
minutes), la demande explicite était d'éviter que ce type de problème bloque le projet pour le
reste d'une journée à l'avenir.

**Décision** : ajouter un coupe-circuit directement dans le workflow n8n (`Rate Limit Guard`, un
node Code qui plafonne les appels à 20 par fenêtre glissante de 24h via les données statiques du
workflow, indépendant de la config Wazuh) plutôt que de compter uniquement sur la discipline
manuelle ou la config côté SIEM. Défense en profondeur : même si le filtre d'alertes Wazuh était
mal reconfiguré à nouveau, ce garde-fou empêcherait un nouveau flood de vider le quota. Confirmé
fonctionnel par test réel (`withinLimit: true`, comptage correct, routage conditionnel correct).

**Problème rencontré en cours de route, à noter pour la suite** : plusieurs heures passées à
corriger un souci persistant où le node "Triage Verdict Schema" retombe sur son schéma d'exemple
par défaut (`state`/`cities`) au lieu du schéma custom (`severity`/`verdict`/`action`/...),
apparemment à chaque fois que le workflow est modifié via l'interface n8n (lier une credential,
publier). Plusieurs approches tentées (patch direct en base, republication CLI, réimport propre,
synchronisation manuelle des tables de versioning internes de n8n) : aucune n'a résolu le problème
de façon durable, et la manipulation directe des tables internes de n8n (`workflow_history`,
`workflow_entity.versionId`/`activeVersionId`, `webhook_entity`) s'est avérée plus fragile que
prévu, causant elle-même d'autres pannes (route de webhook cassée, erreur 500). La chaîne complète
fonctionne mécaniquement (webhook, garde-fou, agent, outils MCP, Slack), seul ce champ de schéma
pose problème. Piste à essayer en priorité la prochaine fois : `schemaType: "fromJson"` (générer
le schéma depuis un exemple) plutôt que `"manual"`, qui pourrait être moins sujet à ce
comportement. Éviter la chirurgie de base de données sur les tables de versioning n8n à l'avenir :
la republication via l'interface utilisateur, bien que plus lente, s'est révélée être la seule
méthode fiable à 100% sur l'ensemble de la session.
