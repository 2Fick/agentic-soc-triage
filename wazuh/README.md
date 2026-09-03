# Wazuh manager (déploiement local, single-node)

Déploiement Docker single-node officiel (`wazuh/wazuh-docker` v4.14.7), avec deux ajouts pour ce
projet :
- `config/wazuh_cluster/wazuh_manager.conf` : bloc `<integration>` qui envoie chaque alerte de
  niveau >= 7 au webhook n8n.
- `integrations/custom-n8n(.py)` : script d'intégration custom qui POST l'alerte JSON vers n8n
  (voir `docs/decisions.md` à la racine pour le contexte).

## Prérequis

- Docker Desktop (WSL2 backend) installé et démarré.
- `vm.max_map_count >= 262144` sur le moteur Linux du WSL2 (requis par le indexer OpenSearch). Sur
  les versions récentes de Docker Desktop c'est déjà configuré, sinon :
  ```bash
  wsl -d docker-desktop sysctl -w vm.max_map_count=262144
  ```

## Démarrage

```bash
# 1. Génère les certificats SSL internes (indexer / manager / dashboard)
docker compose -f generate-indexer-certs.yml run --rm generator

# 2. Démarre l'environnement en arrière-plan
docker compose up -d

# 3. Déploie le script d'intégration n8n dans le conteneur (voir "Pourquoi un script à part" ci-dessous)
./deploy-integration.sh

# 4. Déploie les règles de détection custom et la config partagée pour les agents
./deploy-config.sh

# 5. Suit les logs le temps du premier démarrage (~1 min)
docker compose logs -f
```

### Pourquoi `deploy-integration.sh` et pas un bind mount direct

`integrations/custom-n8n(.py)` vit dans le repo, mais **n'est pas monté directement** dans le
conteneur : les bind mounts Docker Desktop depuis un disque Windows rendent les fichiers
world-writable, et `wazuh-integratord` refuse par sécurité d'exécuter un script world-writable
(`ERROR: file 'integrations/custom-n8n' has write permissions`). `deploy-integration.sh` copie le
script dans le volume nommé `wazuh_integrations` avec les bonnes permissions (`750`), puis
redémarre le manager. À relancer à chaque modification de `custom-n8n.py`.

Dashboard accessible sur https://localhost (certificat auto-signé, avertissement navigateur
normal). Identifiants par défaut : `admin` / `SecretPassword` (à changer avant toute exposition
au-delà de la démo locale, voir la section Sécurité ci-dessous).

## Vérifier que l'intégration n8n est bien câblée

```bash
docker compose exec wazuh.manager tail -f /var/ossec/logs/integrations.log
```

Une ligne `OK sent alert id=... -> HTTP 200` doit apparaître à chaque alerte de niveau >= 7, une
fois que le workflow n8n écoute sur `http://localhost:5678/webhook/wazuh-alert`.

## Agent Wazuh + Sysmon

Installé sur la machine Windows qui génère la télémétrie (voir `sysmon/` pour la config Sysmon et
`attacks/` pour les scénarios de test). Contrairement à l'hypothèse de départ, le ruleset Wazuh par
défaut ne couvre pas fiablement tous les cas Sysmon utiles ici : des règles custom ont été
ajoutées dans `config/local_rules.xml` (voir `docs/decisions.md`).

**Important** : le module SCA (scan de conformité CIS) et la détection de vulnérabilités (CVE)
sont désactivés, à la fois côté manager (`ossec.conf`) et côté agent (`config/agent.conf`). Les
deux génèrent une alerte par contrôle/CVE échoué (des centaines en quelques minutes) et ont
provoqué un incident réel pendant le développement : voir `docs/decisions.md`. Ne pas les
réactiver sans mettre en place un filtrage adapté sur l'intégration n8n, sous peine d'épuiser le
quota gratuit de la clé API Gemini en quelques minutes.

## Sécurité (rappel pour un usage au-delà de la démo locale)

Les mots de passe par défaut (`SecretPassword`, `kibanaserver`, `MyS3cr37P450r.*-`) sont ceux du
dépôt officiel Wazuh, faits pour un premier démarrage. Comme ce déploiement reste local et n'est
jamais exposé publiquement, ils sont laissés tels quels pour la démo, à changer via l'outil
`wazuh-passwords-tool` si le projet devait un jour être exposé au-delà de `localhost`.
