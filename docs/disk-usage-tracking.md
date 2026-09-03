# Suivi espace disque C: vers D:

Le disque C: de la machine de développement est limité en espace. Convention adoptée après une
première passe trop large : seuls les **éléments propres à ce projet** doivent vivre sur D:
(données d'appli spécifiques au projet, dossiers de travail...). Les caches/outils **génériques
réutilisables par d'autres projets** (cache npm, etc.) peuvent rester sur C:, pas besoin de les
migrer. Ce qui reste nécessairement sur C: (ou par choix, pour du générique) est suivi ici.

## Déjà redirigé vers D:

| Élément | Avant | Maintenant | Action effectuée |
|---|---|---|---|
| Données n8n (DB SQLite, credentials, binaire, logs), spécifique à ce projet | `~/.n8n` | `n8n/.n8n` (dans le repo, ignoré par git) | Dossier déplacé, n8n relancé avec `N8N_USER_FOLDER`. Toujours démarrer n8n via `n8n/start.sh`, pas `npx n8n start` en direct, sinon il recrée le dossier par défaut sur C: |
| `mcp-servers/node_modules` | (jamais sur C:) | `mcp-servers/node_modules` | Installé directement sur D: |

## Redirigé vers D: mais pas strictement nécessaire (générique, aurait pu rester sur C:)

| Élément | Avant | Maintenant | Note |
|---|---|---|---|
| Cache npm/npx global | `%LOCALAPPDATA%\npm-cache` | `D:\dev-cache\npm-cache` | Fait avant la clarification du périmètre (générique, utile pour d'autres projets), sans impact négatif, pas besoin de revenir en arrière |

## Encore sur C: (normal, générique, pas à migrer)

| Élément | Chemin | Taille approx. | Pourquoi c'est OK sur C: |
|---|---|---|---|
| Disque virtuel Docker Desktop (WSL2) | `%LOCALAPPDATA%\Docker\wsl\disk\docker_data.vhdx` | Plusieurs dizaines de Go (dont une partie, pas tout, liée à ce projet : images/volumes Wazuh) | C'est l'infra Docker Desktop générique, partagée avec d'éventuels autres projets, pas spécifique à ce projet, donc pas concerné par la préférence D:. Docker Desktop ne permet pas de choisir un emplacement par projet de toute façon. |

## Nettoyage propre à ce projet, en fin de projet

Ce qui est spécifique au projet et peut être supprimé (pas "migré", juste enlevé) une fois le
projet terminé, pour libérer de la place dans le disque virtuel Docker partagé :

```bash
cd wazuh
docker compose down --rmi all -v   # supprime conteneurs, images et volumes Wazuh de ce projet
```

Ça ne réduit pas forcément la taille du fichier `docker_data.vhdx` lui-même (comportement connu de
Docker Desktop, le fichier ne se compacte pas automatiquement), mais libère l'espace logique
dedans. Un "Clean / Purge data" depuis Docker Desktop, menu Troubleshoot, peut aider à compacter
le fichier si besoin, mais ça touche aussi aux autres projets Docker éventuels, à faire seulement
si nécessaire.
