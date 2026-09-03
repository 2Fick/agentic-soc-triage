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

# 4. Suit les logs le temps du premier démarrage (~1 min)
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

## Agent Wazuh

À installer sur la machine qui génère la télémétrie (ex. ce PC Windows, avec Sysmon pour capturer
la création de process, PowerShell, etc., que le ruleset Wazuh par défaut sait déjà détecter à
des niveaux de sévérité élevés, pas besoin de règles custom pour la plupart des techniques Atomic
Red Team). Étape traitée en Phase 4 avec le choix des scénarios d'attaque.

## Sécurité (rappel pour un usage au-delà de la démo locale)

Les mots de passe par défaut (`SecretPassword`, `kibanaserver`, `MyS3cr37P450r.*-`) sont ceux du
dépôt officiel Wazuh, faits pour un premier démarrage. Comme ce déploiement reste local et n'est
jamais exposé publiquement, ils sont laissés tels quels pour la démo, à changer via l'outil
`wazuh-passwords-tool` si le projet devait un jour être exposé au-delà de `localhost`.
